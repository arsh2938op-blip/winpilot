import { promises as fs } from 'fs'
import path from 'path'
import { getFlameDir, getBundledSearchDirs, isAppPackaged } from '../../utils/flamePaths'

export interface CoderConfig {
  local_model?: string
  local_keep_alive?: string
  gemini_model?: string
  cloud_model?: string
  opencode_command?: string[] | string
  [key: string]: unknown
}

export interface ModelConfigPayload {
  localModel?: string
  local_model?: string
  cloudModel?: string
  cloud_model?: string
  localKeepAlive?: string
  local_keep_alive?: string
}

const OLLAMA_URL = 'http://127.0.0.1:11434'

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Locate .flame/coder_config.json in project root or parent directories.
 */
export async function findCoderConfigFile(): Promise<string> {
  const flameConfig = path.join(getFlameDir(), 'coder_config.json')
  if (isAppPackaged() || (await fileExists(flameConfig))) {
    return flameConfig
  }

  const roots = getBundledSearchDirs()
  for (const root of roots) {
    let curr = path.resolve(root)
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(curr, '.flame', 'coder_config.json')
      if (await fileExists(candidate)) {
        return candidate
      }
      const parent = path.dirname(curr)
      if (parent === curr) break
      curr = parent
    }
  }

  return flameConfig
}

/**
 * Read the current coder config from .flame/coder_config.json.
 */
export async function readCoderConfig(): Promise<CoderConfig> {
  const filePath = await findCoderConfigFile()
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as CoderConfig
    // Handle backwards compatibility mapping
    if (!parsed.local_model && parsed.gemma_model) {
      parsed.local_model = String(parsed.gemma_model)
    }
    if (!parsed.cloud_model && parsed.gemini_model) {
      parsed.cloud_model = String(parsed.gemini_model)
    }
    if (!parsed.local_keep_alive) {
      parsed.local_keep_alive = '30s'
    }
    return parsed
  } catch {
    return {
      local_model: 'qwen2.5-coder:1.5b',
      local_keep_alive: '30s',
      cloud_model: 'gemini-4-argon',
      gemini_model: 'gemini-4-argon'
    }
  }
}

/**
 * Get active local model name dynamically.
 */
export async function getActiveLocalModel(): Promise<string> {
  try {
    const cfg = await readCoderConfig()
    return cfg.local_model || 'qwen2.5-coder:1.5b'
  } catch {
    return 'qwen2.5-coder:1.5b'
  }
}

/**
 * Save model configuration directly to .flame/coder_config.json.
 */
export async function saveModelConfig(
  input: ModelConfigPayload | string,
  cloudModelArg?: string
): Promise<{ success: boolean; config: CoderConfig }> {
  const filePath = await findCoderConfigFile()
  let current: CoderConfig = {}
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    current = JSON.parse(raw)
  } catch {
    current = {}
  }

  let localModel: string | undefined
  let cloudModel: string | undefined
  let keepAlive: string | undefined

  if (typeof input === 'string') {
    localModel = input.trim()
    if (typeof cloudModelArg === 'string') {
      cloudModel = cloudModelArg.trim()
    }
  } else if (input && typeof input === 'object') {
    localModel = (input.localModel || input.local_model)?.trim()
    cloudModel = (input.cloudModel || input.cloud_model)?.trim()
    keepAlive = (input.localKeepAlive || input.local_keep_alive)?.trim()
  }

  if (localModel) {
    current.local_model = localModel
    current.gemma_model = localModel // Backwards compatibility for older scripts
  }
  if (cloudModel) {
    current.cloud_model = cloudModel
    current.gemini_model = cloudModel // Backwards compatibility for older scripts
  }
  if (keepAlive) {
    current.local_keep_alive = keepAlive
  } else if (!current.local_keep_alive) {
    current.local_keep_alive = '30s'
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(current, null, 2), 'utf8')

  return { success: true, config: current }
}

/**
 * Get unified model configuration for renderer.
 */
export async function getModelConfig(): Promise<{
  localModel: string
  cloudModel: string
  localKeepAlive: string
  raw: CoderConfig
}> {
  const cfg = await readCoderConfig()
  const localModel = cfg.local_model || (cfg.gemma_model as string) || 'qwen2.5-coder:1.5b'
  const cloudModel = cfg.cloud_model || (cfg.gemini_model as string) || 'gemini-4-argon'
  const localKeepAlive = cfg.local_keep_alive || '30s'
  return { localModel, cloudModel, localKeepAlive, raw: cfg }
}

/**
 * Queries http://127.0.0.1:11434/api/tags with a 3-second timeout.
 * Returns installed model names or [] if Ollama is not running.
 */
export async function getInstalledOllamaModels(): Promise<string[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    if (!res.ok) return []
    const data = (await res.json()) as { models?: { name: string }[] }
    if (!Array.isArray(data.models)) return []
    return data.models.map((m) => m.name).filter(Boolean)
  } catch {
    clearTimeout(timeoutId)
    return []
  }
}
