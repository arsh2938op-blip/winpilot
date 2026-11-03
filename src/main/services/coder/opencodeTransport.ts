import { spawn } from 'child_process'
import type { AiNetworkEndpoint } from '@shared/types'
import { emitAgentActivity } from '../../utils/broadcast'

/**
 * OpenCode transports for Task mode.
 *
 * `http` — POST the task to a user-configured endpoint. This is the preferred
 *          transport when an OpenCode server/sidecar is fronted by HTTP: no
 *          child process, no shell, no quoting, and API keys live in the
 *          server process.
 * `cli`  — spawn OpenCode **directly** (no Python in the middle). The task is
 *          piped over stdin, so arbitrary quotes/newlines can never break the
 *          command line. On Windows the `.cmd` shim is launched through
 *          cmd.exe, but the only text in that command is the program name and
 *          static flags.
 */

const RUN_TIMEOUT_MS = 10 * 60_000

export interface TransportOutcome {
  ok: boolean
  output: string
  backend: string
  /** Machine-readable reason when the transport never started. */
  unavailable?: boolean
}

let activeChild: ReturnType<typeof spawn> | null = null

/** Kills the in-flight OpenCode child (Esc / Interrupt). */
export function interruptOpenCode(): void {
  if (activeChild && !activeChild.killed) {
    try {
      activeChild.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  activeChild = null
}

function commandLine(parts: string[]): string {
  return parts.map((part) => (/[\s"]/g.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part)).join(' ')
}

function splitCommand(command: string[] | string | undefined): string[] {
  if (Array.isArray(command) && command.length) return command
  if (typeof command === 'string' && command.trim()) {
    // Only simple whitespace splitting: values with spaces belong in an array.
    return command.trim().split(/\s+/)
  }
  return ['opencode', 'run']
}

/** Remove the `{task}` / `{prompt}` placeholder — the task arrives on stdin. */
function stripPlaceholder(parts: string[]): string[] {
  return parts.filter((part) => part !== '{task}' && part !== '{prompt}' && part !== '"$TASK"')
}

function extractJsonLines(raw: string): { text: string; tools: string[]; errors: string[] } {
  const text: string[] = []
  const tools: string[] = []
  const errors: string[] = []

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const event = JSON.parse(trimmed) as any
      if (event.part?.text && typeof event.part.text === 'string') text.push(event.part.text)
      else if (typeof event.text === 'string') text.push(event.text)
      if (event.type === 'tool' && event.part?.tool) tools.push(event.part.tool)
      else if (event.part?.tool) tools.push(event.part.tool)
      if (event.type === 'error') errors.push(JSON.stringify(event.error ?? event.part ?? event))
    } catch {
      // Not a JSONL event — ignore, the raw output is still available.
    }
  }
  return { text: text.join('\n\n').trim(), tools, errors }
}

async function runHttp(
  projectPath: string,
  endpoint: AiNetworkEndpoint,
  prompt: string
): Promise<TransportOutcome> {
  const base = endpoint.baseUrl.replace(/\/+$/, '')
  const url = `${base}${endpoint.endpointPath || '/api/task'}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        task: prompt,
        workspace: projectPath,
        model: endpoint.model || undefined,
        files: undefined
      })
    })
    const raw = await res.text()
    if (!res.ok) {
      return { ok: false, output: `HTTP ${res.status}: ${raw.slice(0, 500)}`, backend: 'opencode-http' }
    }
    let output = raw.trim()
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const candidate = parsed.output ?? parsed.summary ?? parsed.result ?? parsed.text
      if (typeof candidate === 'string') output = candidate
    } catch {
      // Plain-text response is fine.
    }
    return { ok: true, output, backend: 'opencode-http' }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err), backend: 'opencode-http' }
  } finally {
    clearTimeout(timer)
  }
}

async function runCli(
  prompt: string,
  projectPath: string,
  endpoint: AiNetworkEndpoint,
  requestId?: string
): Promise<TransportOutcome> {
  const parts = stripPlaceholder(splitCommand(endpoint.command))
  if (!parts.some((part) => part === '--auto' || part === '--yolo')) parts.push('--auto')
  if (!parts.some((part) => part === '--format' || part === '-f')) parts.push('--format', 'json')

  const exe = parts[0]
  const args = parts.slice(1)
  const isWin = process.platform === 'win32'

  return new Promise<TransportOutcome>((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = isWin
      ? spawn('cmd.exe', ['/d', '/s', '/c', commandLine(parts)], {
          cwd: projectPath,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        })
      : spawn(exe, args, {
          cwd: projectPath,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        })

    activeChild = child

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      if (activeChild === child) activeChild = null
    }, RUN_TIMEOUT_MS)

    child.on('error', (err) => {
      clearTimeout(timer)
      if (activeChild === child) activeChild = null
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      resolve({
        ok: false,
        output: missing ? `${exe} is not installed or not on PATH.` : err.message,
        backend: 'opencode-cli',
        unavailable: missing
      })
    })

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('{')) emitAgentActivity(requestId, `[OpenCode] ${trimmed.slice(0, 160)}`)
      }
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (activeChild === child) activeChild = null
      if (timedOut) {
        resolve({ ok: false, output: 'OpenCode timed out after 10 minutes.', backend: 'opencode-cli' })
        return
      }
      const parsed = extractJsonLines(stdout)
      for (const tool of parsed.tools.slice(0, 12)) emitAgentActivity(requestId, `[OpenCode] ${tool}`)
      const output = parsed.text || stdout.trim() || stderr.trim()
      const failed = code !== 0
      const notFound = /is not recognized as an internal or external command|not recognized|command not found|ENOENT/i.test(`${stdout}\n${stderr}`)
      resolve({
        ok: !failed,
        output: failed
          ? `${output || 'OpenCode failed without output.'}${parsed.errors.length ? `\n${parsed.errors.join('\n')}` : ''}`
          : output,
        backend: 'opencode-cli',
        unavailable: failed && notFound
      })
    })

    // The task never appears on the command line.
    child.stdin?.write(prompt, 'utf8')
    child.stdin?.end()
  })
}

export async function runOpenCode(
  projectPath: string,
  endpoint: AiNetworkEndpoint,
  prompt: string,
  requestId?: string
): Promise<TransportOutcome> {
  const wantsHttp = endpoint.transport === 'http' || (endpoint.transport !== 'cli' && endpoint.baseUrl.trim().length > 0)
  if (wantsHttp) {
    emitAgentActivity(requestId, `[OpenCode] HTTP task via ${endpoint.baseUrl}`)
    const result = await runHttp(projectPath, endpoint, prompt)
    if (result.ok || endpoint.transport === 'http') return result
    emitAgentActivity(requestId, '[OpenCode] HTTP endpoint failed — falling back to the local CLI')
    const fallback = await runCli(prompt, projectPath, endpoint, requestId)
    return {
      ...fallback,
      output: `${fallback.output}\n(HTTP transport failed first: ${result.output.slice(0, 200)})`
    }
  }

  emitAgentActivity(requestId, '[OpenCode] CLI task (task piped over stdin)')
  return runCli(prompt, projectPath, endpoint, requestId)
}
