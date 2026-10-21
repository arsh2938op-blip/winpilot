import { execFile } from 'child_process'

export interface CommandResult {
  stdout: string
  stderr: string
}

/**
 * Runs an external command safely and returns its output as a Promise.
 *
 * Why execFile instead of exec: exec() runs your string through a shell,
 * which means special characters in arguments could change what actually
 * runs. execFile() passes arguments as an array directly to the program —
 * no shell involved. Every service that shells out (system stats now,
 * winget later) should go through this one function, so timeouts and
 * error handling stay consistent everywhere.
 */
export function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<CommandResult> {
  const { timeoutMs = 15_000, cwd, env } = options

  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8',
        cwd,
        env
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${error.message}\n${stderr}`))
          return
        }
        resolve({ stdout, stderr })
      }
    )
    // Signal immediately that no stdin is coming, instead of leaving an
    // idle pipe open — this is what caused Claude Code's "no stdin data
    // received in 3s" wait on every call.
    child.stdin?.end()
  })
}