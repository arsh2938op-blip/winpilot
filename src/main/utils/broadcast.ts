import { BrowserWindow, Notification } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'

/** The one shared activity-event emitter used by the main app. */
export function emitAgentActivity(requestId: string | undefined, label: string): void {
  if (!requestId) return
  broadcastToRenderer(IpcChannels.agent.activity, { requestId, label, at: Date.now() })
}

export function broadcastToRenderer(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, payload)
  })
}

/** Fire a '✨ New Skill Unlocked' desktop notification + renderer event. */
export function emitSkillUnlocked(featureName: string): void {
  const payload = { featureName, at: Date.now() }
  broadcastToRenderer(IpcChannels.agent.skillUnlocked, payload)
  if (Notification.isSupported()) {
    new Notification({
      title: '✨ New Skill Unlocked',
      body: featureName,
      silent: false
    }).show()
  }
}

/** Broadcast agent status updates (e.g. status: "coding" with message: "Synthesizing new capability..."). */
export function emitAgentStatus(status: 'idle' | 'ready' | 'coding' | string, message = ''): void {
  broadcastToRenderer(IpcChannels.agent.statusChange, { status, message, at: Date.now() })
}
