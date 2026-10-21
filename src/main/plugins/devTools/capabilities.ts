import path from 'path'
import { registerCapability } from '../../flameCore/capabilities'
import { runCommand } from '../../utils/runCommand'
import { getCurrentProject, setCurrentProject } from '../../services/project/store'
import { emitAgentActivity } from '../../utils/broadcast'

const ALLOWED_BASE_COMMANDS = new Set(['npm', 'dir', 'mkdir', 'type'])
const DANGEROUS_CHARS = /[&|;<>`$]/

function validateCommand(raw: string): { ok: boolean; reason?: string } {
  if (!raw.trim()) return { ok: false, reason: 'Empty command.' }
  if (DANGEROUS_CHARS.test(raw)) {
    return { ok: false, reason: 'Command contains characters that are not allowed (chaining or redirection).' }
  }
  const base = raw.trim().split(/\s+/)[0]?.toLowerCase()
  if (!ALLOWED_BASE_COMMANDS.has(base ?? '')) {
    return {
      ok: false,
      reason: `"${base ?? ''}" is not an allowed command. Allowed: ${[...ALLOWED_BASE_COMMANDS].join(', ')}, plus "cd".`
    }
  }
  return { ok: true }
}

async function resolveCwd(): Promise<string> {
  const project = await getCurrentProject()
  return project.path || process.cwd()
}

export function registerDevToolsCapabilities(): void {
  registerCapability({
    id: 'devtools.runCommand',
    label: 'Run a basic command',
    description: 'Runs a whitelisted command (npm, dir, mkdir, type, cd) in Flame\'s current project folder.',
    run: async (args) => {
      const raw = (args.command as string | undefined)?.trim()
      const requestId = args.requestId as string | undefined
      if (!raw) return { success: false, message: 'What command should I run?' }

      emitAgentActivity(requestId, '[Command] Validating command…')
      if (/^cd\b/i.test(raw)) {
        const target = raw.replace(/^cd\s*/i, '').trim() || '.'
        const current = await resolveCwd()
        const next = path.resolve(current, target)
        await setCurrentProject(next)
        emitAgentActivity(requestId, '[Command] Working directory updated')
        return { success: true, message: `> ${raw}\nNow working in: ${next}` }
      }

      const validation = validateCommand(raw)
      if (!validation.ok) {
        emitAgentActivity(requestId, '[Command] Blocked by validation')
        return { success: false, message: `Blocked: ${validation.reason}` }
      }

      const cwd = await resolveCwd()
      try {
        emitAgentActivity(requestId, `[Command] Running: ${raw}`)
        const { stdout, stderr } = await runCommand('cmd.exe', ['/d', '/s', '/c', raw], {
          cwd,
          timeoutMs: 5 * 60_000
        })
        emitAgentActivity(requestId, '[Command] Completed')
        return { success: true, message: `> ${raw}\n${[stdout, stderr].filter(Boolean).join('\n').trim() || '(no output)'}` }
      } catch (err) {
        emitAgentActivity(requestId, '[Command] Failed')
        return { success: false, message: `> ${raw}\nFailed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}
