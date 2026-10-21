import { app, BrowserWindow, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'

/**
 * Window chrome controls for the custom frameless title bar.
 * This is infrastructure for the app shell (every window needs minimize/
 * maximize/close), not a product "feature" — so unlike winget/system/etc.
 * it's implemented directly rather than left as a TODO placeholder.
 */
export function registerWindowIpc(): void {
  ipcMain.handle(IpcChannels.window.minimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle(IpcChannels.window.maximizeToggle, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.handle(IpcChannels.window.close, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // Keep the renderer's maximize/restore icon in sync even when the state
  // changes via OS shortcuts (e.g. Win+Up), not just our own button.
  const attachMaximizeForwarding = (win: BrowserWindow): void => {
    const notify = (): void =>
      win.webContents.send(IpcChannels.window.onMaximizedChange, win.isMaximized())
    win.on('maximize', notify)
    win.on('unmaximize', notify)
  }

  BrowserWindow.getAllWindows().forEach(attachMaximizeForwarding)
  app.on('browser-window-created', (_event, win) => attachMaximizeForwarding(win))
}
