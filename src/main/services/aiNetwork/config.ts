import { promises as fs } from 'fs'
import path from 'path'
import type {
  AiNetworkConfig,
  AiNetworkEndpoint,
  AiNetworkGuards,
  AiNetworkRouting
} from '@shared/types'
import { findCoderConfigFile } from '../ai/coderConfigStore'

/**
 * AI Network configuration.
 *
 * The whole federation is declared in `.flame/coder_config.json` — nothing
 * about the three default collaborators (Gemini, Flame/Ollama, OpenCode) is
 * baked into the UI or the router. This module is the only place that knows
 * the *shape* of the file and the bootstrap defaults used when it is missing.
 *
 * Secrets are never written here. Gemini keys stay in the app's secrets store;
 * the endpoint only records the env-var name that *may* hold a key.
 */

export const DEFAULT_CONFIG_FILE = path.join('.flame', 'coder_config.json')

export const DEFAULT_ENDPOINTS: AiNetworkEndpoint[] = [
  {
    id: 'flame',
    label: 'Flame',
    kind: 'ollama',
    enabled: true,
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5-coder:1.5b',
    roles: ['chat', 'triage'],
    priority: 10,
    apiKeyEnv: ''
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    kind: 'opencode',
    enabled: true,
    baseUrl: '',
    model: '',
    roles: ['coding'],
    priority: 20,
    transport: 'auto',
    endpointPath: '/api/task',
    command: ['opencode', 'run', '{task}'],
    apiKeyEnv: ''
  },
  {
    id: 'gemini',
    label: 'Gemini',
    kind: 'gemini',
    enabled: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    roles: ['chat', 'reasoning'],
    priority: 30,
    apiKeyEnv: 'GEMINI_API_KEY'
  }
]

export const DEFAULT_ROUTING: AiNetworkRouting = {
  // Chat stays local-first: Flame answers, Gemini is escalation.
  chat: ['flame', 'gemini'],
  // Task mode triages with the reflex model, edits with OpenCode, and
  // escalates non-edit reasoning to Gemini.
  task: ['flame', 'opencode', 'gemini']
}

export const DEFAULT_GUARDS: AiNetworkGuards = {
  ast: true,
  maxFilesPerRun: 25,
  protectedGlobs: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.flame/**',
    '**/dist/**',
    '**/out/**',
    '**/build/**',
    '**/coverage/**',
    '**/.next/**',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock'
  ],
  allowElectronInRenderer: false
}

interface RawCoderConfig {
  endpoints?: Partial<AiNetworkEndpoint>[]
  routing?: Partial<AiNetworkRouting>
  guards?: Partial<AiNetworkGuards>
  // Legacy v1.2.0 snake_case keys, still honoured.
  local_model?: string
  local_keep_alive?: string
  gemini_model?: string
  cloud_model?: string
  opencode_command?: string[] | string
  [key: string]: unknown
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Merge one endpoint over its default, preserving unknown-ish legacy fields. */
function mergeEndpoint(base: AiNetworkEndpoint, incoming?: Partial<AiNetworkEndpoint>): AiNetworkEndpoint {
  const merged: AiNetworkEndpoint = {
    ...base,
    ...(incoming ?? {}),
    id: incoming?.id?.trim() || base.id,
    label: incoming?.label?.trim() || base.label,
    kind: incoming?.kind ?? base.kind,
    roles: Array.isArray(incoming?.roles) && incoming.roles.length ? incoming.roles : base.roles,
    priority: typeof incoming?.priority === 'number' ? incoming.priority : base.priority
  }
  merged.enabled = incoming?.enabled ?? base.enabled
  merged.baseUrl = incoming?.baseUrl ?? base.baseUrl
  merged.model = incoming?.model ?? base.model
  return merged
}

/**
 * Apply legacy keys from the old `coder_config.json` so existing installs
 * keep working without any manual migration.
 */
function applyLegacy(
  raw: RawCoderConfig,
  endpoints: AiNetworkEndpoint[],
  explicitIds: Set<string>
): AiNetworkEndpoint[] {
  return endpoints.map((endpoint) => {
    // An explicit endpoint in `endpoints` always wins over a legacy key, so
    // editing the model in the AI Network panel is not silently reverted.
    if (explicitIds.has(endpoint.id)) return endpoint
    if (endpoint.id === 'flame') {
      const local = raw.local_model || (raw.gemma_model as string | undefined)
      return local ? { ...endpoint, model: local } : endpoint
    }
    if (endpoint.id === 'gemini') {
      const cloud = raw.cloud_model || raw.gemini_model
      return cloud ? { ...endpoint, model: cloud } : endpoint
    }
    if (endpoint.id === 'opencode' && raw.opencode_command) {
      return { ...endpoint, command: raw.opencode_command }
    }
    return endpoint
  })
}

export async function resolveConfigPath(projectPath?: string): Promise<string> {
  if (projectPath) return path.join(projectPath, DEFAULT_CONFIG_FILE)
  return findCoderConfigFile()
}

/** Read + normalise the config. Never throws: a broken file falls back to defaults. */
export async function readNetworkConfig(projectPath?: string): Promise<AiNetworkConfig> {
  const configPath = await resolveConfigPath(projectPath)
  let raw: RawCoderConfig = {}
  try {
    raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as RawCoderConfig
  } catch {
    raw = {}
  }

  const defaults = clone(DEFAULT_ENDPOINTS)
  const incoming = Array.isArray(raw.endpoints) ? raw.endpoints : []
  const byId = new Map(incoming.filter((e) => e.id).map((e) => [e.id as string, e]))
  const explicitIds = new Set(byId.keys())

  // Defaults first (so the three collaborators always exist), then any extra
  // endpoints the user added themselves.
  const merged: AiNetworkEndpoint[] = defaults.map((base) => mergeEndpoint(base, byId.get(base.id)))
  for (const extra of incoming) {
    if (!extra.id || merged.some((e) => e.id === extra.id)) continue
    merged.push({
      ...(extra as AiNetworkEndpoint),
      enabled: extra.enabled ?? true,
      baseUrl: extra.baseUrl ?? '',
      model: extra.model ?? '',
      roles: extra.roles ?? ['chat'],
      priority: extra.priority ?? 50
    })
  }

  const routing: AiNetworkRouting = {
    chat: Array.isArray(raw.routing?.chat) && raw.routing.chat.length ? raw.routing.chat : DEFAULT_ROUTING.chat,
    task: Array.isArray(raw.routing?.task) && raw.routing.task.length ? raw.routing.task : DEFAULT_ROUTING.task
  }

  return {
    version: typeof (raw.version as number) === 'number' ? (raw.version as number) : 2,
    endpoints: applyLegacy(raw, merged, explicitIds).sort((a, b) => a.priority - b.priority),
    routing,
    guards: { ...DEFAULT_GUARDS, ...(raw.guards ?? {}) },
    configPath
  }
}

/** Create the config file with defaults if it does not exist yet. */
export async function ensureNetworkConfig(projectPath?: string): Promise<AiNetworkConfig> {
  const config = await readNetworkConfig(projectPath)
  try {
    await fs.access(config.configPath)
  } catch {
    await writeRawConfig(config.configPath, config)
  }
  return config
}

async function writeRawConfig(configPath: string, config: AiNetworkConfig): Promise<void> {
  let existing: RawCoderConfig = {}
  try {
    existing = JSON.parse(await fs.readFile(configPath, 'utf8')) as RawCoderConfig
  } catch {
    existing = {}
  }
  // Keep legacy keys intact for coder_engine.py, then store the new shape.
  const next: RawCoderConfig = {
    ...existing,
    version: config.version,
    endpoints: config.endpoints,
    routing: config.routing,
    guards: config.guards
  }
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(next, null, 2), 'utf8')
}

/**
 * Persist a partial update. Endpoints are matched by id (so the renderer can
 * send just the changed one), routing/guards replace their section.
 */
export async function updateNetworkConfig(
  update: Partial<AiNetworkConfig>,
  projectPath?: string
): Promise<AiNetworkConfig> {
  const current = await readNetworkConfig(projectPath)
  let endpoints = clone(current.endpoints)

  for (const incoming of update.endpoints ?? []) {
    if (!incoming.id) continue
    const idx = endpoints.findIndex((e) => e.id === incoming.id)
    if (idx === -1) {
      endpoints.push({
        id: incoming.id,
        label: incoming.label ?? incoming.id,
        kind: incoming.kind ?? 'ollama',
        enabled: incoming.enabled ?? true,
        baseUrl: incoming.baseUrl ?? '',
        model: incoming.model ?? '',
        roles: incoming.roles ?? ['chat'],
        priority: incoming.priority ?? 50,
        transport: incoming.transport,
        endpointPath: incoming.endpointPath,
        apiKeyEnv: incoming.apiKeyEnv,
        command: incoming.command
      })
    } else {
      endpoints[idx] = mergeEndpoint(endpoints[idx], incoming)
    }
  }

  endpoints = endpoints.sort((a, b) => a.priority - b.priority)

  const next: AiNetworkConfig = {
    version: typeof update.version === 'number' ? update.version : current.version,
    endpoints,
    routing: {
      chat: update.routing?.chat?.length ? update.routing.chat : current.routing.chat,
      task: update.routing?.task?.length ? update.routing.task : current.routing.task
    },
    guards: { ...current.guards, ...(update.guards ?? {}) },
    configPath: current.configPath
  }

  await writeRawConfig(next.configPath, next)
  return next
}

/** True when the endpoint is allowed to serve the given role. */
export function endpointServes(endpoint: AiNetworkEndpoint, role: 'chat' | 'triage' | 'coding' | 'reasoning'): boolean {
  return endpoint.enabled && endpoint.roles.includes(role)
}

/** Ordered list of enabled endpoints for a role, honouring `routing.<mode>`. */
export function endpointsForRole(config: AiNetworkConfig, mode: 'chat' | 'task', role: 'chat' | 'triage' | 'coding' | 'reasoning'): AiNetworkEndpoint[] {
  const order = mode === 'task' ? config.routing.task : config.routing.chat
  const rank = new Map(order.map((id, index) => [id, index]))
  return config.endpoints
    .filter((endpoint) => endpointServes(endpoint, role))
    .sort((a, b) => {
      const ra = rank.get(a.id) ?? 100 + a.priority
      const rb = rank.get(b.id) ?? 100 + b.priority
      return ra === rb ? a.priority - b.priority : ra - rb
    })
}
