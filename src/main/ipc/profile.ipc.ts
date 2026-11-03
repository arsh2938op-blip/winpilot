import { ipcMain, BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { UserProfile } from '@shared/types'
import { getUserProfile, updateUserProfile } from '../services/profile/userProfileStore'

export function registerProfileIpc(): void {
  ipcMain.handle(IpcChannels.profile.get, async (): Promise<UserProfile> => {
    return getUserProfile()
  })

  ipcMain.handle(IpcChannels.profile.set, async (_event, patch: Partial<UserProfile>): Promise<UserProfile> => {
    const updated = await updateUserProfile(patch)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.profile.onUpdated, updated)
      }
    }
    return updated
  })
}

