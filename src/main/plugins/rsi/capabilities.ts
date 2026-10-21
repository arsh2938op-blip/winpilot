import { registerCapability } from '../../flameCore/capabilities'
import { runOpenCodeTask } from '../../services/ai/opencode'
import { isGitRepo, checkpoint, rollback, runTests } from '../../services/rsi/git'
import { registerSkill } from '../../services/skills/store'
import { isOpenCodeEnabled } from '../../services/ai/openCodeStore'
import { listImportedProjects } from '../../services/projects/store'
import { emitAgentActivity } from '../../utils/broadcast'
import { stageOperation } from '../files/pendingOps'
import path from 'path'

const MAX_ATTEMPTS = 2

export function registerRsiCapabilities(): void {
  registerCapability({
    id: 'rsi.improve',
    label: 'Recursive self-improvement task',
    description: 'Has OpenCode implement an improvement, gated by tests and a git checkpoint, capped retries.',
    run: async (args) => {
      const task = args.task as string | undefined
      const projectPath = args.projectPath as string | undefined
      const testCommand = (args.testCommand as string | undefined) || 'npm test'
      const requestId = args.requestId as string | undefined
      if (!task || !projectPath) return { success: false, message: 'Need both a task and a target project.' }
      if (!(await isOpenCodeEnabled())) return { success: false, message: 'OpenCode is disabled — enable it in AI Network settings.' }

      const operationId = stageOperation(async () => {
        emitAgentActivity(requestId, '[RSI] Improvement task started')
        const importedProjects = await listImportedProjects()
        const project = importedProjects.find((entry) => path.resolve(entry.path) === path.resolve(projectPath))
        if (!project?.permissions.read || !project.permissions.write || !project.permissions.execute) {
          return { success: false, message: 'Project read, write, and execute permissions must remain enabled to run RSI.' }
        }
        if (!(await isGitRepo(projectPath))) {
          return { success: false, message: 'RSI requires a Git repository — this project has no .git folder.' }
        }

        try {
          await checkpoint(projectPath, task)
        } catch (err) {
          return { success: false, message: `Could not create Git checkpoint: ${err instanceof Error ? err.message : String(err)}` }
        }
        emitAgentActivity(requestId, '[RSI] Git checkpoint created')

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          emitAgentActivity(requestId, `[OpenCode] Attempt ${attempt}/${MAX_ATTEMPTS}`)
          const opencode = await runOpenCodeTask(task, projectPath, requestId)
          if (!opencode.success) continue

          emitAgentActivity(requestId, '[RSI] Running tests')
          const tests = await runTests(projectPath, testCommand)
          if (tests.passed) {
            emitAgentActivity(requestId, '[RSI] Tests passed')
            await registerSkill({
              name: task.slice(0, 60),
              description: task,
              version: '1.0.0',
              sourceProject: projectPath,
              permissions: ['read', 'write'],
              status: 'validated',
              testStatus: 'passed'
            })
            emitAgentActivity(requestId, '[Flame] Improvement complete')
            return { success: true, message: `Improvement complete and tests passed.\n\n${opencode.output}` }
          }
          emitAgentActivity(requestId, `[RSI] Tests failed (attempt ${attempt})`)
        }

        emitAgentActivity(requestId, '[RSI] Rolling back to checkpoint')
        try {
          await rollback(projectPath)
        } catch (err) {
          return { success: false, message: `Improvement failed, and rollback failed: ${err instanceof Error ? err.message : String(err)}` }
        }
        return { success: false, message: `Stopped after ${MAX_ATTEMPTS} failed attempts — rolled back. No uncontrolled retries.` }
      })

      return {
        success: true,
        message: `__PENDING_FILE_OP__${JSON.stringify({ operationId, label: `RSI: ${task}` })}`
      }
    }
  })
}
