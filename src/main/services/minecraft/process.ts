import { spawn, ChildProcess } from 'child_process'
import { broadcastToRenderer } from '../../utils/broadcast'
import { IpcChannels } from '@shared/ipc-channels'
import type { MinecraftConfig, MinecraftStatus } from '@shared/types'

let child: ChildProcess | null = null
let status: MinecraftStatus = { state: 'offline', bots: [], serverOnline: false, mindserverOnline: false }

function setStatus(patch: Partial<MinecraftStatus>): void {
  status = { ...status, ...patch }
  broadcastToRenderer(IpcChannels.minecraft.onStatus, status)
}
function log(text: string): void {
  broadcastToRenderer(IpcChannels.minecraft.onLog, { text, at: Date.now() })
}

export function getMinecraftStatus(): MinecraftStatus {
  return status
}
export function isMinecraftRunning(): boolean {
  return !!child && !child.killed
}

/** Parses launcher.js/main.js's REAL, previously-observed stdout lines —
 * "[BOT] name => model", "MindServer running on port", "MC server
 * found", "All bots launched.", and the keys.json first-run exit case. */
function handleLine(line: string): void {
  log(line)

  if (line.includes('Created keys.json from keys.example.json')) {
    setStatus({ state: 'needs_keys' })
    return
  }
  const botMatch = line.match(/\[BOT\]\s+(\S+)\s+=>/)
  if (botMatch) {
    setStatus({ bots: [...new Set([...status.bots, botMatch[1]])] })
    return
  }
  if (line.includes('MindServer running on port')) {
    setStatus({ mindserverOnline: true })
    return
  }
  if (line.includes('MC server found')) {
    setStatus({ serverOnline: true })
    return
  }
  if (line.includes('All bots launched')) {
    setStatus({ state: 'online' })
  }
}

export function startMindCraft(projectPath: string, config: MinecraftConfig): { success: boolean; message: string } {
  if (isMinecraftRunning()) return { success: false, message: 'Already running.' }

  setStatus({ state: 'starting', bots: [], serverOnline: false, mindserverOnline: false })
  log('[FlameAGI] Starting MindCraft…')

  try {
    const yn = (b: boolean): string => (b ? 'Y' : 'N')
    // PowerShell routing — same proven pattern as Claude Code. No user
    // text is interpolated here at all (only a fixed script path), so
    // there's no injection surface to worry about. Explicit env values
    // override stale inherited values that would otherwise beat .env.
    child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'node launcher.js'], {
      cwd: projectPath,
      windowsHide: true,
      env: {
        ...process.env,
        SERVER_IP: config.serverIp,
        SERVER_PORT: String(config.serverPort),
        MODELS: config.modelsOrPreset,
        BOT_COUNT: String(config.botCount),
        BOT_NAMES: config.botNames,
        SPAWN_DELAY: String(config.spawnDelaySeconds),
        SPAWN_TIMEOUT: String(config.spawnDelaySeconds),
        VIEWER: config.viewer ? 'true' : 'false',
        API_ROTATION: yn(config.apiRotation),
        SPEAKJS: yn(config.speakjs),
        OWNERSHIP: yn(config.ownership),
        ESSENTIALS: yn(config.essentials),
        MINDSERVER_PORT: String(config.mindserverPort),
        AUTO_OPEN_UI: config.autoOpenUi ? 'true' : 'false'
      }
    })
    child.stdin?.end()

    const onData = (data: Buffer): void => {
      data
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach(handleLine)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)

    child.on('exit', (code) => {
      const wasKeysIssue = status.state === 'needs_keys'
      child = null
      if (!wasKeysIssue) {
        setStatus({ state: code === 0 ? 'offline' : 'error', bots: [], serverOnline: false, mindserverOnline: false })
        log(`[FlameAGI] MindCraft exited (code ${code}).`)
      }
    })

    return { success: true, message: 'Launching…' }
  } catch (err) {
    child = null
    setStatus({ state: 'error' })
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function stopMindCraft(): { success: boolean; message: string } {
  if (!child) return { success: false, message: "Nothing to stop — FlameAGI didn't start a process." }
  setStatus({ state: 'stopping' })
  log('[FlameAGI] Stopping MindCraft…')
  child.kill()
  child = null
  setStatus({ state: 'offline', bots: [], serverOnline: false, mindserverOnline: false })
  return { success: true, message: 'Stopped.' }
}

