import { BrowserWindow } from 'electron'
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
