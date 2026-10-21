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
import { getCurrentProject } from '../../services/project/store'
import { emitAgentActivity } from '../../utils/broadcast'

const OK_STATUSES = new Set(['applied', 'staged', 'noop', 'rejected', 'rolled_back'])

async function resolveProjectPath(explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit
  const project = await getCurrentProject()
  return project.path || undefined
}

/**
 * The coder plugin: chat-facing access to the Coder Engine v1.2.0
 * (coder_engine.py) — the guarded OpenCode bridge with snapshots,
 * ast/py_compile checks, staged review, and VS Code visual diffs.
 */
export function registerCoderCapabilities(): void {
  registerCapability({
    id: 'coder.edit',
    label: 'Code edit via Coder Engine',
    description: 'Runs a coding task in the active project through the Coder Engine (OpenCode backend, snapshots, syntax guard). Applies the change, or stages it when the user asks for a review.',
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

      try {
        const result = await runCoderTask(parsed.task, projectPath, {
          review: (args.review as boolean | undefined) ?? parsed.review,
          backend: (args.backend as 'auto' | 'gemini' | 'opencode' | undefined) ?? parsed.backend,
          openDiff: true,
          requestId
        })
        const ok = OK_STATUSES.has(result.status)
        return { success: ok, message: formatRunResult(result) }
      } catch (err) {
        emitAgentActivity(requestId, '[Coder Engine] Failed')
        return { success: false, message: `Coder Engine: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'coder.approve',
    label: 'Approve staged change',
    description: 'Applies the newest staged proposal (or a specific run id) from the Coder Engine.',
    run: async (args) => {
      const requestId = args.requestId as string | undefined
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to approve changes in.' }
      try {
        let runId = args.runId as string | undefined
        if (!runId) {
          const staged = (await coderListRuns(projectPath)).find((entry) => entry.status === 'staged')
          if (!staged) return { success: false, message: 'There is no staged change waiting for approval.' }
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
        const result = await coderApproval('reject', runId, projectPath)
        return { success: result.status === 'rejected', message: `Discarded ${runId}. The workspace was never touched.` }
      } catch (err) {
        return { success: false, message: `Reject failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'coder.rollback',
    label: 'Roll back applied change',
    description: 'Restores the workspace from the newest applied run’s snapshots (or a specific run id).',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to roll back.' }
      try {
        const result = await coderApproval('rollback', args.runId as string | undefined, projectPath)
        return { success: result.status === 'rolled_back', message: result.error || formatRunResult(result) }
      } catch (err) {
        return { success: false, message: `Rollback failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'coder.diff',
    label: 'Open change in VS Code',
    description: 'Opens the Coder Engine’s diff for the latest (or given) run in VS Code’s diff viewer.',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to diff.' }
      try {
        await coderOpenDiff(args.runId as string | undefined, projectPath, args.requestId as string | undefined)
        return { success: true, message: 'Opened the change in VS Code.' }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  })

  registerCapability({
    id: 'coder.status',
    label: 'Coder Engine status',
    description: 'Recent Coder Engine runs plus workspace changes since the last baseline.',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to report on.' }
      try {
        const lines: string[] = []
        const runs = await coderListRuns(projectPath)
        if (runs.length) {
          lines.push('Recent runs:')
          for (const entry of runs) {
            lines.push(`  ${entry.run_id}  [${entry.status}]${entry.backend ? ` via ${entry.backend}` : ''} — ${entry.task.slice(0, 60)}`)
          }
        } else {
          lines.push('No Coder Engine runs yet.')
        }
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
    label: 'Coder Engine health check',
    description: 'Checks the Coder Engine setup: workspace, Gemini/OpenCode backends, VS Code, Git, Ollama.',
    run: async (args) => {
      const projectPath = await resolveProjectPath(args.projectPath as string | undefined)
      if (!projectPath) return { success: false, message: 'No active project to check.' }
      try {
        const checks = await coderDoctor(projectPath)
        const lines = checks.map((item) => `[${item.ok ? 'OK ' : 'NO '}] ${item.check}: ${item.detail}`)
        return { success: checks.every((item) => item.ok), message: lines.join('\n') }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  })
}
