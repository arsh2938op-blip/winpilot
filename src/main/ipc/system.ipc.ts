import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { SystemSnapshot } from '@shared/types'
import * as systemService from '../services/system'

export function registerSystemIpc(): void {
  ipcMain.handle(IpcChannels.system.getSnapshot, async (): Promise<SystemSnapshot> => {
    // TODO: replace with systemService.getSnapshot() (CPU/RAM/disk/GPU/etc.)
    return systemService.getSnapshot()
  })
}
