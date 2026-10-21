import { getOpenCodeCommand, isOpenCodeEnabled } from './openCodeStore'
import { runCommand } from '../../utils/runCommand'
import { emitAgentActivity } from '../../utils/broadcast'

function escapePS(value: string): string {
  return value.replace(/'/g, "''")
}

export async function runOpenCodeTask(
  task: string,
  projectPath: string,
  requestId?: string
): Promise<{ success: boolean; output: string }> {
  if (!(await isOpenCodeEnabled())) {
    return { success: false, output: 'OpenCode is disabled — enable it in AI Network settings.' }
  }

  const template = await getOpenCodeCommand()
  const command = template.replace('{task}', escapePS(task)).replace('{cwd}', escapePS(projectPath))
  emitAgentActivity(requestId, `[OpenCode] Running: ${task}`)

  try {
    const { stdout } = await runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
      cwd: projectPath,
      timeoutMs: 10 * 60_000
    })
    emitAgentActivity(requestId, '[OpenCode] Done')
    return { success: true, output: stdout.trim() }
  } catch (err) {
    emitAgentActivity(requestId, '[OpenCode] Failed')
    return { success: false, output: `OpenCode failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
