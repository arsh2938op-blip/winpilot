import { app } from 'electron'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { emitAgentActivity } from '../../utils/broadcast'

/**
 * Bridge to the FlameAGI Coder Engine (coder_engine.py v1.2.0) — the guarded
 * wrapper around OpenCode. Every code change made through chat goes through
 * this engine, so it always gets the engine's protections for free:
 *   - .bak snapshots in .flame/runs/<run_id>/ for one-command rollback
 *   - ast.parse / py_compile guard before any change is kept (all-or-nothing)
 *   - VS Code visual diffs via `code --diff`
 *   - staged review mode (--review) that never touches the workspace
 *
 * The engine is a single-stdlib-file Python program. Tasks are piped to its
 * stdin (`run -`) instead of the argv, so no shell quoting is ever involved.
 */

export interface CoderFileChange {
  path: string
  action: string
  added?: number
  removed?: number
  check?: string
}

export interface CoderRunResult {
  run_id?: string
  status: string
  backend?: string
  summary?: string
  files: CoderFileChange[]
  warnings?: string[]
  error?: string
  test?: { passed?: boolean; output_tail?: string } | null
  next?: string
}

export interface CoderRunEntry {
  run_id: string
  status: string
  backend?: string | null
  task: string
  files: string[]
  started: string
}

export interface CoderEditOptions {
  review?: boolean
  backend?: 'auto' | 'gemini' | 'opencode'
  files?: string[]
  openDiff?: boolean
  requestId?: string
}

const RUN_TIMEOUT_MS = 15 * 60_000 // engine lets OpenCode run up to 10 min by itself
const FAST_TIMEOUT_MS = 2 * 60_000

/* ------------------------------------------------------------------ */
/* Engine discovery                                                    */
/* ------------------------------------------------------------------ */

const MAX_WALK_UP = 4

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function walkUp(start: string): string[] {
  const candidates: string[] = []
  let dir = path.resolve(start)
  for (let i = 0; i < MAX_WALK_UP && dir !== path.parse(dir).root; i++) {
    candidates.push(path.join(dir, 'coder_engine.py'))
    dir = path.dirname(dir)
  }
  return candidates
}

async function loadEngineOverride(): Promise<string | undefined> {
  const envValue = process.env.FLAME_CODER_ENGINE?.trim()
  if (envValue && (await exists(envValue))) return envValue
  try {
    const secrets = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'secrets.json'), 'utf8'))
    const stored = typeof secrets.coderEnginePath === 'string' ? secrets.coderEnginePath.trim() : ''
    if (stored && (await exists(stored))) return stored
  } catch {
    /* no secrets file yet — fall through to auto-discovery */
  }
  return undefined
}

let cachedEnginePath: string | undefined

export async function findCoderEngine(projectPath?: string): Promise<string> {
  if (cachedEnginePath && (await exists(cachedEnginePath))) return cachedEnginePath
  const override = await loadEngineOverride()
  if (override) {
    cachedEnginePath = override
    return override
  }
  const candidates = [
    ...(projectPath ? walkUp(projectPath) : []),
    ...walkUp(app.getAppPath())
  ]
  for (const candidate of candidates) {
    /* eslint-disable no-await-in-loop */
    if (await exists(candidate)) {
      cachedEnginePath = candidate
      return candidate
    }
    /* eslint-enable no-await-in-loop */
  }
  throw new Error(
    'coder_engine.py was not found near this project. Place it in the workspace root, ' +
    'or set the coderEnginePath setting.'
  )
}

/* ------------------------------------------------------------------ */
/* Python execution                                                    */
/* ------------------------------------------------------------------ */

interface ExecResult {
  stdout: string
  stderr: string
  code: number | null
}

let cachedPython: string | undefined

async function resolvePython(): Promise<string> {
  if (cachedPython) return cachedPython
  for (const exe of ['python', 'py']) {
    const works = await new Promise<boolean>((resolve) => {
      const child = execFile(exe, ['--version'], { windowsHide: true }, (err) => resolve(!err))
      child.stdin?.end()
    })
    if (works) {
      cachedPython = exe
      return exe
    }
  }
  throw new Error('Python was not found on PATH — the Coder Engine needs it (python or py).')
}

/** execFile wrapper that resolves on ANY exit code (engine reports failures
 * as valid JSON with status "failed") and pipes `input` to stdin, so task
 * text never meets a shell. runCommand() can't do either, hence this helper.
 * Callers must resolvePython() first — no spawn retry here. */
function execEngine(
  args: string[],
  cwd: string,
  input: string,
  timeoutMs: number
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      args[0],
      args.slice(1),
      { cwd, windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(`Could not start '${args[0]}'.`))
          return
        }
        if (error && (error as Error & { killed?: boolean }).killed) {
          reject(new Error(`Coder Engine timed out after ${Math.round(timeoutMs / 60_000)} min.`))
          return
        }
        const errno = error ? (error as unknown as { code?: number | string }).code : undefined
        const code = typeof errno === 'number' ? errno : error ? 1 : 0
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code })
      }
    ).stdin?.end(input, 'utf8')
  })
}

/* ------------------------------------------------------------------ */
/* Engine subcommands                                                  */
/* ------------------------------------------------------------------ */

async function engineJson<T>(
  rawArgs: string[],
  projectPath: string | undefined,
  input = '',
  timeoutMs = RUN_TIMEOUT_MS
): Promise<T> {
  const enginePy = await findCoderEngine(projectPath)
  const python = await resolvePython()
  const args = [python, enginePy, '--json']
  // --workspace is a top-level flag in the engine CLI: it must come before the subcommand
  if (projectPath) args.push('--workspace', path.resolve(projectPath))
  args.push(...rawArgs)
  const { stdout } = await execEngine(args, projectPath ? path.resolve(projectPath) : '', input, timeoutMs)

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    const trimmed = stdout.trim()
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        throw new Error(
          trimmed
            ? `Coder Engine returned unparseable output: ${trimmed.slice(0, 300)}`
            : 'Coder Engine returned no output.'
        )
      }
    } else {
      throw new Error(
        trimmed
          ? `Coder Engine output was not JSON: ${trimmed.slice(0, 300)}`
          : 'Coder Engine returned no output.'
      )
    }
  }
  return parsed as T
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function runCoderTask(task: string, projectPath: string, options: CoderEditOptions = {}): Promise<CoderRunResult> {
  const requestId = options.requestId
  emitAgentActivity(requestId, '[Coder Engine] Preparing run')
  const args: string[] = ['run', '-']
  if (options.review) args.push('--review')
  if (options.backend && options.backend !== 'auto') args.push('--backend', options.backend)
  if (options.openDiff) args.push('--open-diff')
  if (options.files?.length) args.push('--files', ...options.files)

  emitAgentActivity(requestId, options.review ? '[Coder Engine] Staging proposal' : '[Coder Engine] Editing code (OpenCode)')
  const result = await engineJson<CoderRunResult>(args, projectPath, task)
  if (!result.files) result.files = []
  emitAgentActivity(requestId, result.error ? '[Coder Engine] Failed' : '[Coder Engine] Done')
  return result
}

/** approve / reject / rollback. When no run id is given the engine picks the
 * newest staged (approve/reject) or newest applied (rollback) run itself. */
export async function coderApproval(
  command: 'approve' | 'reject' | 'rollback',
  runId: string | undefined,
  projectPath?: string,
  requestId?: string
): Promise<CoderRunResult> {
  emitAgentActivity(requestId, `[Coder Engine] ${command}`)
  if (runId) {
    return engineJson<CoderRunResult>([command, runId], projectPath, '', FAST_TIMEOUT_MS)
  }
  return engineJson<CoderRunResult>([command], projectPath, '', FAST_TIMEOUT_MS)
}

export async function coderListRuns(projectPath?: string): Promise<CoderRunEntry[]> {
  return engineJson<CoderRunEntry[]>(['list'], projectPath, '', FAST_TIMEOUT_MS)
}

export async function coderDoctor(projectPath: string): Promise<Array<{ check: string; ok: boolean; detail: string }>> {
  return engineJson<Array<{ check: string; ok: boolean; detail: string }>>(['doctor'], projectPath, '', FAST_TIMEOUT_MS)
}

export async function coderModifiedFiles(projectPath: string): Promise<{
  since_baseline: Array<{ path: string; state: string }>
  git: Array<{ status: string; path: string }>
  note?: string
}> {
  return engineJson(['modified'], projectPath, '', FAST_TIMEOUT_MS)
}

/** Opens a run's diff in VS Code. runId omitted => latest run. */
export async function coderOpenDiff(runId: string | undefined, projectPath?: string, requestId?: string): Promise<void> {
  emitAgentActivity(requestId, '[Coder Engine] Opening diff in VS Code')
  const id = runId ?? (await coderListRuns(projectPath))[0]?.run_id
  if (!id) throw new Error('There is no run yet — ask me to change some code first.')
  await engineJson<Record<string, unknown>>(['diff', id], projectPath, '', FAST_TIMEOUT_MS)
}

/* ------------------------------------------------------------------ */
/* Formatting for the chat window                                      */
/* ------------------------------------------------------------------ */

const PATCH_MARK: Record<string, string> = { modify: 'M', create: 'A', delete: 'D' }

export function formatRunResult(result: CoderRunResult): string {
  const status = result.status
  const lines: string[] = []

  if (result.run_id) {
    lines.push(`Run ${result.run_id}  [${status}]${result.backend ? `  via ${result.backend}` : ''}`)
  }
  if (result.error) {
    lines.push(`⚠ ${result.error}`)
  } else if (result.summary) {
    lines.push(result.summary)
  }
  const marks = result.files.map(
    (f) => `  ${PATCH_MARK[f.action] ?? '?'} ${f.path}${f.added || f.removed ? ` (+${f.added ?? 0} -${f.removed ?? 0})` : ''}`
  )
  if (marks.length) lines.push(...marks)
  else if (!result.error) lines.push('  (no files changed)')
  if (result.test?.output_tail && !result.test.passed) {
    lines.push(`  tests failed: ${result.test.output_tail.slice(-400)}`)
  }
  for (const warning of result.warnings ?? []) lines.push(`  ! ${warning}`)

  if (status === 'staged') {
    lines.push('')
    lines.push('Staged for review. Reply "approve" to apply it, "reject" to discard, or "diff" to see it in VS Code.')
  } else if (status === 'applied') {
    lines.push('')
    lines.push('Applied to the workspace. Say "rollback" to undo.')
  } else if (status === 'noop') {
    lines.push('Nothing needed to change.')
  }
  return lines.join('\n').trim()
}

/** Mirror of the engine's own chat syntax (`Edit: <task> Use: <model>`),
 * parsed in TS so chat fast-paths don't wait on Gemma classification. */
export function parseEditPrompt(prompt: string): { task: string; backend?: 'auto' | 'gemini' | 'opencode'; review: boolean } {
  let text = prompt.trim().replace(/^\s*edit\s*:\s*/i, '')
  let backend: 'auto' | 'gemini' | 'opencode' | undefined

  const useMatch = text.match(/\s*\buse\s*:\s*(\S+)/i)
  if (useMatch) {
    const target = useMatch[1].toLowerCase()
    if (target === 'gemini' || target === 'opencode' || target === 'auto') backend = target
    // a full model name (e.g. gemini-2.5-flash) stays Gemini for the engine; only the
    // explicit backend tokens are picked up here — 'auto' lets the engine decide.
    text = text.slice(0, useMatch.index ?? text.length) + text.slice((useMatch.index ?? text.length) + useMatch[0].length)
  }
  const review = /\b(review|stage|preview|draft)\b/i.test(text)
  return { task: text.replace(/\s+/g, ' ').trim(), backend, review }
}


