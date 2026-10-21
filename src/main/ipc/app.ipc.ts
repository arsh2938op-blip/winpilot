import { app, clipboard, dialog, ipcMain } from 'electron'
import os from 'os'
import { IpcChannels } from '@shared/ipc-channels'
import type { PlatformInfo } from '@shared/types'

export function registerAppIpc(): void {
  ipcMain.handle(IpcChannels.app.getVersion, (): string => {
    return app.getVersion()
  })

  ipcMain.handle(IpcChannels.app.getPlatformInfo, (): PlatformInfo => {
    return {
      osVersion: os.release(),
      arch: os.arch(),
      appVersion: app.getVersion()
    }
  })

  // Electron's native clipboard, called via IPC — deliberately NOT
  // navigator.clipboard, which is unreliable in a sandboxed renderer
  // regardless of permission grants (focus-state and secure-context
  // quirks). This is a direct OS write, no browser API involved.
  ipcMain.handle(IpcChannels.app.copyText, (_event, text: string): void => {
    clipboard.writeText(text ?? '')
  })

  ipcMain.handle(IpcChannels.app.pickImage, async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.app.pickAnyFile, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.app.pickAnyFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
}
