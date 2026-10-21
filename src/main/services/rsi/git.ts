import { runCommand } from '../../utils/runCommand'

export async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    await runCommand('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectPath })
    return true
  } catch {
    return false
  }
}

export async function checkpoint(projectPath: string, label: string): Promise<void> {
  await runCommand('git', ['add', '-A'], { cwd: projectPath })
  await runCommand('git', ['commit', '-m', `RSI checkpoint: ${label}`, '--allow-empty'], { cwd: projectPath })
}

export async function rollback(projectPath: string): Promise<void> {
  await runCommand('git', ['reset', '--hard', 'HEAD'], { cwd: projectPath })
}

export async function runTests(projectPath: string, testCommand: string): Promise<{ passed: boolean; output: string }> {
  try {
    const { stdout } = await runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', testCommand], {
      cwd: projectPath,
      timeoutMs: 5 * 60_000
    })
    return { passed: true, output: stdout }
  } catch (err) {
    return { passed: false, output: err instanceof Error ? err.message : String(err) }
  }
}
