import { spawn } from 'child_process'
import type { AiNetworkEndpoint, AiNetworkEndpointState } from '@shared/types'
import { hasGoogleApiKey, getActiveGeminiModel, keyCount } from '../ai/googleKeyStore'
import { askGemini } from '../ai/geminiChat'

/**
 * Liveness probes for the three collaborator kinds. Every probe is short and
 * side-effect free: we never spend cloud tokens just to draw a green dot.
 */

const PROBE_TIMEOUT_MS = 2500

let openCodeVersion: string | null | undefined

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function execText(command: string, args: string[], timeoutMs = PROBE_TIMEOUT_MS): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      resolve({ ok: false, text: 'timed out' })
    }, timeoutMs)
    child.stdout?.on('data', (d: Buffer) => (out += d.toString('utf8')))
    child.stderr?.on('data', (d: Buffer) => (out += d.toString('utf8')))
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, text: 'not found' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, text: out.trim() })
    })
  })
}

async function checkOllama(endpoint: AiNetworkEndpoint): Promise<AiNetworkEndpointState> {
  const base = { id: endpoint.id, label: endpoint.label, kind: endpoint.kind, enabled: endpoint.enabled, model: endpoint.model, roles: endpoint.roles }
  if (!endpoint.enabled) return { ...base, online: false, detail: 'Disabled' }
  const root = endpoint.baseUrl.replace(/\/+$/, '')
  try {
    const res = await fetchWithTimeout(`${root}/api/tags`)
    if (!res.ok) return { ...base, online: false, detail: `Ollama responded ${res.status}` }
    const data = (await res.json()) as { models?: { name: string }[] }
    const names = (data.models ?? []).map((m) => m.name)
    const wanted = endpoint.model.trim()
    const present = wanted ? names.some((n) => n === wanted || n.startsWith(`${wanted}:`) || n.startsWith(wanted)) : true
    return {
      ...base,
      online: present,
      detail: present ? `Ready · ${names.length} local model${names.length === 1 ? '' : 's'}` : `Running, but "${wanted}" is not pulled`
    }
  } catch {
    return { ...base, online: false, detail: 'Ollama is not reachable' }
  }
}

async function checkGemini(endpoint: AiNetworkEndpoint): Promise<AiNetworkEndpointState> {
  const base = { id: endpoint.id, label: endpoint.label, kind: endpoint.kind, enabled: endpoint.enabled, model: endpoint.model, roles: endpoint.roles }
  if (!endpoint.enabled) return { ...base, online: false, detail: 'Disabled' }
  const [configured, keys, activeModel] = await Promise.all([hasGoogleApiKey(), keyCount(), getActiveGeminiModel()])
  const model = endpoint.model || activeModel || 'not selected'
  if (!configured) {
    return { ...base, model, online: false, detail: 'No Gemini API key configured' }
  }
  return { ...base, model, online: true, detail: `API key ready · ${keys} key${keys === 1 ? '' : 's'}` }
}

async function checkOpenCode(endpoint: AiNetworkEndpoint): Promise<AiNetworkEndpointState> {
  const base = { id: endpoint.id, label: endpoint.label, kind: endpoint.kind, enabled: endpoint.enabled, model: endpoint.model, roles: endpoint.roles }
  if (!endpoint.enabled) return { ...base, online: false, detail: 'Disabled' }

  if (endpoint.transport === 'http' && endpoint.baseUrl.trim()) {
    try {
      const res = await fetchWithTimeout(endpoint.baseUrl.replace(/\/+$/, ''))
      return { ...base, online: true, detail: `HTTP transport · ${res.status}` }
    } catch {
      return { ...base, online: false, detail: 'HTTP endpoint is not reachable' }
    }
  }

  if (openCodeVersion === undefined) {
    const result = await execText(process.platform === 'win32' ? 'cmd.exe' : 'opencode', process.platform === 'win32' ? ['/d', '/s', '/c', 'opencode --version'] : ['--version'])
    openCodeVersion = result.ok ? result.text.split(/\r?\n/)[0] : null
  }
  if (!openCodeVersion) return { ...base, online: false, detail: 'OpenCode CLI not found on PATH' }
  return { ...base, online: true, detail: `${openCodeVersion} · CLI transport` }
}

export async function checkEndpoint(endpoint: AiNetworkEndpoint): Promise<AiNetworkEndpointState> {
  switch (endpoint.kind) {
    case 'ollama':
      return checkOllama(endpoint)
    case 'gemini':
      return checkGemini(endpoint)
    case 'opencode':
      return checkOpenCode(endpoint)
    default:
      return {
        id: endpoint.id,
        label: endpoint.label,
        kind: endpoint.kind,
        enabled: endpoint.enabled,
        online: false,
        detail: 'Unknown endpoint kind',
        model: endpoint.model,
        roles: endpoint.roles
      }
  }
}

export async function checkAllEndpoints(endpoints: AiNetworkEndpoint[]): Promise<AiNetworkEndpointState[]> {
  return Promise.all(endpoints.map((endpoint) => checkEndpoint(endpoint)))
}

/** Explicit "Test" button: performs the cheapest real request for the kind. */
export async function testEndpoint(endpoint: AiNetworkEndpoint): Promise<{ success: boolean; message: string }> {
  if (!endpoint.enabled) return { success: false, message: `${endpoint.label} is disabled.` }

  if (endpoint.kind === 'ollama') {
    const root = endpoint.baseUrl.replace(/\/+$/, '')
    try {
      const res = await fetch(`${root}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: endpoint.model, prompt: 'Reply with the single word: connected', stream: false })
      })
      if (!res.ok) return { success: false, message: `Ollama returned ${res.status}.` }
      const data = (await res.json()) as { response?: string }
      return { success: true, message: data.response?.trim() || 'Connected.' }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  if (endpoint.kind === 'gemini') {
    try {
      const reply = await askGemini('Reply with just the word "connected".')
      return { success: true, message: reply }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  const state = await checkOpenCode(endpoint)
  return { success: state.online, message: state.detail }
}
