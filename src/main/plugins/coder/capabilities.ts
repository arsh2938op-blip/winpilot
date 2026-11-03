import { registerCapability } from '../../flameCore/capabilities'
import {
  runCoderTask,
  coderApproval,
  coderOpenDiff,
  coderListRuns,
  coderDoctor,
  coderModifiedFiles,
  formatRunResult,
  parseEditPrompt
} from '../../services/ai/coderEngine'
import {
  formatTaskResult,
  runTaskMode
} from '../../services/coder/nativeCoder'
import {
  listTaskRuns,
  openTaskDiff,
  rollbackTaskRun
} from '../../services/coder/guards'
import { readNetworkConfig } from '../../services/aiNetwork/config'
import { checkAllEndpoints } from '../../services/aiNetwork/health'
import { getCurrentProject } from '../../services/project/store'
import { emitAgentActivity } from '../../utils/broadcast'

const OK_STATUSES = new Set(['applied', 'staged', 'noop', 'rejected', 'rolled_back', 'answered'])

async function resolveProjectPath(explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit
  const project = await getCurrentProject()
  return project.path || undefined
}

/**
 * The coder plugin.
 *
 * Task-mode edits go through the native guarded pipeline (`runTaskMode`):
 * snapshot → OpenCode (HTTP or CLI) → AST/boundary guards → commit/restore.
 *
 * The legacy coder_engine.py remains the review/staging backend (it can stage
 * a proposal without touching the workspace) and the final fallback when
 * OpenCode cannot be launched at all.
 */
export function registerCoderCapabilities(): void {
  registerCapability({
    id: 'coder.edit',
    label: 'Guarded code edit (Task mode)',
    description: 'Runs a coding task in the active project. Applies through the native guarded pipeline (snapshots, AST + Electron-boundary checks), or stages it with coder_engine.py when review is requested.',
    run: async (args) => {
      const requestId = args.requestId as string | undefined
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) {
        return { success: false, message: 'Import and pick a project first so the Coder Engine knows what to work on.' }
      }
      const task = (args.task as string | undefined)?.trim()
      if (!task) return { success: false, message: 'Tell me what to change in the code.' }

      const parsed = parseEditPrompt(`Edit: ${task}`)
      if (!parsed.task) return { success: false, message: 'Tell me what to change in the code.' }

      const review = (args.review as boolean | undefined) ?? parsed.review
      try {
        if (review) {
          const result = await runCoderTask(parsed.task, projectPath, {
            review: true,
            backend: (args.backend as 'auto' | 'gemini' | 'opencode' | undefined) ?? parsed.backend,
            openDiff: true,
            requestId
          })
          return { success: OK_STATUSES.has(result.status), message: formatRunResult(result) }
        }

        const result = await runTaskMode(parsed.task, projectPath, { requestId, openDiff: true })
        return {
          success: result.status === 'applied' || result.status === 'noop' || result.status === 'answered',
          message: formatTaskResult(result)
        }
      } catch (err) {
        emitAgentActivity(requestId, '[Task] Failed')
        return { success: false, message: `Task mode: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'coder.approve',
    label: 'Approve staged change',
    description: 'Applies the newest staged proposal (or a specific run id) from coder_engine.py.',
    run: async (args) => {
      const requestId = args.requestId as string | undefined
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to approve changes in.' }
      try {
        let runId = args.runId as string | undefined
        if (!runId) {
          const staged = (await coderListRuns(projectPath)).find((entry) => entry.status === 'staged')
          if (!staged) {
            return {
              success: false,
              message: 'There is no staged change waiting for approval. Task-mode edits are applied immediately after their guards pass.'
            }
          }
          runId = staged.run_id
        }
        const result = await coderApproval('approve', runId, projectPath, requestId)
        return { success: result.status === 'applied', message: result.error && result.status !== 'applied' ? `⚠ ${result.error}` : formatRunResult(result) }
      } catch (err) {
        return { success: false, message: `Approve failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'coder.reject',
    label: 'Discard staged change',
    description: 'Discards the newest staged proposal (or a specific run id).',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to discard changes in.' }
      try {
        let runId = args.runId as string | undefined
        if (!runId) {
          const staged = (await coderListRuns(projectPath)).find((entry) => entry.status === 'staged')
          if (!staged) return { success: false, message: 'There is no staged change to discard.' }
          runId = staged.run_id
        }
        await coderApproval('reject', runId, projectPath)
        return { success: true, message: `Discarded ${runId}. The workspace was never touched.` }
      } catch (err) {
        return { success: false, message: `Reject failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'coder.rollback',
    label: 'Roll back a guarded run',
    description: 'Restores the newest applied Task-mode run from its snapshot (falls back to coder_engine.py runs).',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to roll back.' }
      const runId = args.runId as string | undefined
      try {
        const result = await rollbackTaskRun(projectPath, runId)
        return { success: result.status === 'rolled_back', message: result.error || formatTaskResult(result) }
      } catch (nativeErr) {
        try {
          const result = await coderApproval('rollback', runId, projectPath)
          return { success: result.status === 'rolled_back', message: result.error || formatRunResult(result) }
        } catch (engineErr) {
          return {
            success: false,
            message: `Rollback failed: ${engineErr instanceof Error ? engineErr.message : String(engineErr) || (nativeErr instanceof Error ? nativeErr.message : String(nativeErr))}`
          }
        }
      }
    }
  })

  registerCapability({
    id: 'coder.diff',
    label: 'Open change in VS Code',
    description: 'Opens the latest Task-mode snapshot diff in VS Code (falls back to a coder_engine.py run).',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to diff.' }
      const requestId = args.requestId as string | undefined
      try {
        await openTaskDiff(projectPath, args.runId as string | undefined)
        return { success: true, message: 'Opened the guarded Task diff in VS Code.' }
      } catch (nativeErr) {
        try {
          await coderOpenDiff(args.runId as string | undefined, projectPath, requestId)
          return { success: true, message: 'Opened the change in VS Code.' }
        } catch (engineErr) {
          return {
            success: false,
            message: engineErr instanceof Error ? engineErr.message : (nativeErr instanceof Error ? nativeErr.message : String(nativeErr))
          }
        }
      }
    }
  })

  registerCapability({
    id: 'coder.status',
    label: 'Coder status',
    description: 'Recent guarded Task-mode runs, legacy engine runs, and workspace changes since the baseline.',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to report on.' }
      try {
        const lines: string[] = []
        const taskRuns = await listTaskRuns(projectPath)
        if (taskRuns.length) {
          lines.push('Task-mode runs (guarded):')
          for (const run of taskRuns.slice(0, 10)) {
            const fileCount = run.files.length
            lines.push(`  ${run.runId}  [${run.status}]  ${fileCount} file${fileCount === 1 ? '' : 's'} — ${run.task.slice(0, 60)}`)
          }
        }

        const engineRuns = await coderListRuns(projectPath)
        if (engineRuns.length) {
          lines.push('Coder Engine runs:')
          for (const entry of engineRuns.slice(0, 10)) {
            lines.push(`  ${entry.run_id}  [${entry.status}]${entry.backend ? ` via ${entry.backend}` : ''} — ${entry.task.slice(0, 60)}`)
          }
        }

        if (!taskRuns.length && !engineRuns.length) lines.push('No coding runs yet.')

        const modified = await coderModifiedFiles(projectPath)
        if (modified.since_baseline.length) {
          lines.push('Workspace changes:')
          for (const item of modified.since_baseline.slice(0, 20)) {
            lines.push(`  ${item.state.padEnd(9)} ${item.path}`)
          }
        }
        if (modified.note) lines.push(modified.note)
        return { success: true, message: lines.join('\n') }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  })

  registerCapability({
    id: 'coder.doctor',
    label: 'Coder + network health check',
    description: 'Checks the engine setup (OpenCode, VS Code, Git, Ollama) and every AI Network endpoint from .flame/coder_config.json.',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to check.' }
      try {
        const lines: string[] = []
        const checks = await coderDoctor(projectPath)
        lines.push(...checks.map((item) => `[${item.ok ? 'OK ' : 'NO '}] ${item.check}: ${item.detail}`))

        const config = await readNetworkConfig(projectPath)
        const endpoints = await checkAllEndpoints(config.endpoints)
        lines.push('', `AI Network (${config.configPath}):`)
        for (const endpoint of endpoints) {
          lines.push(`  [${endpoint.online ? 'OK ' : 'NO '}] ${endpoint.label} (${endpoint.kind}): ${endpoint.detail}`)
        }
        return { success: checks.every((item) => item.ok) && endpoints.some((endpoint) => endpoint.online), message: lines.join('\n') }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  })
}
