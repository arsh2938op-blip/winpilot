import { promises as fs } from 'fs'
import path from 'path'
import type { TaskRunFileChange, TaskRunResult } from '@shared/types'
import { emitAgentActivity } from '../../utils/broadcast'
import { readNetworkConfig } from '../aiNetwork/config'
import { answerFromNetwork, planWithGemini, resolveCodingEndpoint, triageTask } from '../aiNetwork/router'
import {
  createRunId,
  detectChanges,
  openTaskDiff,
  restoreChanges,
  takeSnapshot,
  taskRunDir,
  validateChanges,
  writeManifest,
  type TaskRunManifest
} from './guards'
import { runOpenCode } from './opencodeTransport'
import type { TransportOutcome } from './opencodeTransport'
import { runCoderTask, coderOpenDiff } from '../ai/coderEngine'

export { formatTaskResult } from './guards'
export { interruptOpenCode } from './opencodeTransport'

/**
 * Task-mode coordinator.
 *
 * Chat and Task share the same window; the mode decides which pipeline runs.
 * Task mode never dispatches through the generic capability router — it owns
 * its own snapshot → execute → guard → commit lifecycle, so a coding request
 * cannot accidentally be handled as casual conversation (and vice versa).
 */

export interface TaskModeOptions {
  requestId?: string
  signal?: AbortSignal
  /** Open the guarded diff in VS Code after changes are committed. */
  openDiff?: boolean
  /** Targeted files, forwarded to the transport (optional hint). */
  files?: string[]
}

function now(): number {
  return Date.now()
}

function sanitizeOutput(output: string): string {
  return output
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\r/g, '')
    .trim()
}

function summarize(output: string, fallback: string): string {
  const clean = sanitizeOutput(output)
  if (!clean) return fallback
  const lines = clean.split('\n').filter((line) => line.trim().length > 0)
  const summary = lines.slice(-12).join('\n')
  return summary.length > 900 ? `${summary.slice(0, 900)}…` : summary
}

function baseResult(runId: string, backend: string, startedAt: number): TaskRunResult {
  return {
    runId,
    backend,
    status: 'failed',
    summary: '',
    files: [],
    warnings: [],
    startedAt,
    finishedAt: startedAt
  }
}

async function finalize(
  result: TaskRunResult,
  projectPath: string,
  task: string,
  snapshotPath: string
): Promise<TaskRunResult> {
  result.finishedAt = now()
  const manifest: TaskRunManifest = {
    runId: result.runId,
    task,
    backend: result.backend,
    status: result.status,
    summary: result.summary,
    files: result.files,
    warnings: result.warnings,
    error: result.error,
    answer: result.answer,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    workspace: projectPath,
    snapshotPath
  }
  try {
    await writeManifest(result, manifest, projectPath)
  } catch (err) {
    result.warnings.push(`Could not persist run manifest: ${err instanceof Error ? err.message : String(err)}`)
  }
  return result
}

function annotateChecks(changes: TaskRunFileChange[], astEnabled: boolean): void {
  for (const change of changes) {
    if (change.action === 'delete') continue
    const ext = path.extname(change.path).toLowerCase()
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) change.check = astEnabled ? 'AST ok' : 'AST bypassed'
    else if (ext === '.json') change.check = 'JSON ok'
  }
}

async function answerOnly(
  prompt: string,
  projectPath: string,
  requestId?: string,
  signal?: AbortSignal
): Promise<TaskRunResult> {
  const startedAt = now()
  const runId = createRunId()
  emitAgentActivity(requestId, '[Task] Question detected — routing to reasoning nodes')
  const config = await readNetworkConfig(projectPath)
  const answer = await answerFromNetwork(prompt, config, requestId, signal)
  const result = baseResult(runId, answer.backend, startedAt)
  if (!answer.text) {
    result.status = 'failed'
    result.error = 'No reasoning endpoint is online. Enable Gemini in the AI Network, or start Ollama.'
    result.summary = 'I could not answer this in Task mode.'
    return finalize(result, projectPath, prompt, '')
  }
  result.status = 'answered'
  result.summary = `Answered by ${answer.backend}`
  result.answer = answer.text
  return finalize(result, projectPath, prompt, '')
}

/** Fall back to coder_engine.py only when OpenCode itself cannot be launched. */
async function fallbackToEngine(
  prompt: string,
  projectPath: string,
  runId: string,
  startedAt: number,
  requestId?: string
): Promise<TaskRunResult | null> {
  try {
    emitAgentActivity(requestId, '[Task] Falling back to coder_engine.py (OpenCode unavailable)')
    const engine = await runCoderTask(prompt, projectPath, { requestId, backend: 'auto', openDiff: true })
    const result = baseResult(engine.run_id ?? runId, engine.backend ?? 'coder_engine.py', startedAt)
    result.status = engine.status === 'noop' ? 'noop' : engine.status === 'failed' || engine.status === 'rolled_back' ? 'failed' : 'applied'
    result.summary = engine.summary ?? ''
    result.files = (engine.files ?? []).map((file) => ({
      path: file.path,
      action: file.action === 'create' ? 'create' : file.action === 'delete' ? 'delete' : 'modify',
      added: file.added,
      removed: file.removed,
      check: file.check
    }))
    result.warnings = [ ...(engine.warnings ?? []), 'Executed through the legacy guarded engine.' ]
    result.error = engine.error
    if (engine.run_id) {
      coderOpenDiff(engine.run_id, projectPath, requestId).catch(() => {})
    }
    return result
  } catch (err) {
    emitAgentActivity(requestId, `[Task] Engine fallback failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Entry point used by the chat router when the active mode is `task`.
 * Decides between answering and editing, then runs the guarded edit pipeline.
 */
export async function runTaskMode(
  rawPrompt: string,
  projectPath: string,
  options: TaskModeOptions = {}
): Promise<TaskRunResult> {
  const { requestId, signal } = options
  const startedAt = now()
  const runId = createRunId()
  const prompt = rawPrompt.trim()

  if (!prompt) {
    return baseResult(runId, 'none', startedAt)
  }
  if (signal?.aborted) throw new Error('Task interrupted.')

  const config = await readNetworkConfig(projectPath)
  const triage = await triageTask(prompt, config, requestId, signal)
  emitAgentActivity(requestId, `[Task] ${triage.kind.toUpperCase()} · ${triage.reason}`)

  if (triage.kind === 'question') {
    return answerOnly(triage.task, projectPath, requestId, signal)
  }

  const endpoint = resolveCodingEndpoint(config)
  if (!endpoint) {
    const result = baseResult(runId, 'none', startedAt)
    result.error = 'No coding endpoint is enabled in .flame/coder_config.json (add an OpenCode endpoint with the "coding" role).'
    return finalize(result, projectPath, prompt, '')
  }

  const runDir = taskRunDir(projectPath, runId)
  const snapshotDir = path.join(runDir, 'snapshot')
  await fs.mkdir(snapshotDir, { recursive: true })

  emitAgentActivity(requestId, '[Task] Snapshotting workspace')
  const snapshot = await takeSnapshot(projectPath, snapshotDir)
  emitAgentActivity(requestId, `[Task] Snapshot ready (${snapshot.entries.size} files, ${snapshot.tookMs}ms)`)

  if (signal?.aborted) throw new Error('Task interrupted.')

  const plan = await planWithGemini(triage.task, config, requestId, signal)
  if (plan) emitAgentActivity(requestId, '[Task] Gemini supplied an implementation plan')

  const taskPrompt = [
    'You are Flame in Task mode: an autonomous coding agent.',
    `Workspace: ${projectPath}`,
    '',
    'TASK:',
    triage.task,
    '',
    'Rules:',
    '- Make the change directly with your file tools. Do not only describe it.',
    '- Keep edits minimal and consistent with the surrounding code.',
    '- Never modify node_modules, .git, .flame, dist, out, build, or lockfiles.',
    '- Keep TypeScript syntactically valid and respect Electron boundaries ' +
      '(renderer must use window.api, never import electron; main/preload must not import renderer code).',
    '- Finish with one short paragraph describing what changed.',
    plan ? `\nPLAN:\n${plan}` : '',
    options.files?.length ? `\nLikely files: ${options.files.join(', ')}` : ''
  ].filter(Boolean).join('\n')

  emitAgentActivity(requestId, `[Task] Dispatching to ${endpoint.label}`)
  let outcome: TransportOutcome
  try {
    outcome = await runOpenCode(projectPath, endpoint, taskPrompt, requestId)
  } catch (err) {
    const partial = await detectChanges(projectPath, snapshot)
    if (partial.length) await restoreChanges(projectPath, snapshotDir, partial)
    throw err
  }

  if (signal?.aborted) {
    const abortedChanges = await detectChanges(projectPath, snapshot)
    if (abortedChanges.length) await restoreChanges(projectPath, snapshotDir, abortedChanges)
    throw new Error('Task interrupted.')
  }

  if (!outcome.ok && outcome.unavailable) {
    const fallback = await fallbackToEngine(triage.task, projectPath, runId, startedAt, requestId)
    if (fallback) return fallback
  }

  const changes = await detectChanges(projectPath, snapshot)
  const guard = await validateChanges(projectPath, changes, config.guards)
  const warnings = [...snapshot.warnings, ...guard.warnings]

  if (!outcome.ok) {
    // A failed agent may still have written partial files — restore them.
    if (changes.length) {
      emitAgentActivity(requestId, '[Task] Agent failed — restoring snapshots')
      await restoreChanges(projectPath, snapshotDir, changes)
    }
    const result = baseResult(runId, outcome.backend, startedAt)
    result.status = 'failed'
    result.error = summarize(outcome.output, 'OpenCode failed without output.')
    result.summary = 'The agent did not finish, so no changes were kept.'
    result.files = changes
    result.warnings = warnings
    return finalize(result, projectPath, triage.task, snapshotDir)
  }

  if (!guard.ok) {
    emitAgentActivity(requestId, '[Task] Guard rejected the run — restoring snapshots')
    const failures = await restoreChanges(projectPath, snapshotDir, changes)
    const result = baseResult(runId, outcome.backend, startedAt)
    result.status = 'rolled_back'
    result.files = changes
    result.warnings = warnings
    result.error = [
      ...guard.violations.map((violation) => `${violation.path}: ${violation.rule} — ${violation.detail}`),
      ...failures.map((failure) => `restore failed: ${failure}`)
    ].join('\n')
    result.summary = 'AST/boundary guards rejected this change, so it was reverted.'
    return finalize(result, projectPath, triage.task, snapshotDir)
  }

  annotateChecks(changes, config.guards.ast)
  const result = baseResult(runId, outcome.backend, startedAt)
  result.files = changes
  result.warnings = warnings

  if (!changes.length) {
    result.status = 'noop'
    result.summary = summarize(outcome.output, 'OpenCode reported success but changed no files.')
    return finalize(result, projectPath, triage.task, snapshotDir)
  }

  result.status = 'applied'
  result.summary = summarize(outcome.output, `Applied ${changes.length} guarded file change${changes.length === 1 ? '' : 's'}.`)

  emitAgentActivity(requestId, `[Task] Committed ${changes.length} file${changes.length === 1 ? '' : 's'} after guards`)
  const finalized = await finalize(result, projectPath, triage.task, snapshotDir)

  if (options.openDiff !== false) {
    // The manifest must exist before the diff helper can locate the snapshot.
    openTaskDiff(projectPath, runId).catch(() => {})
  }

  return finalized
}
