import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getCurrentProject, pickProjectFolder, openInVsCode } from '../services/project/store'

export function registerProjectIpc(): void {
  ipcMain.handle(IpcChannels.project.get, async () => {
    return getCurrentProject()
  })

  ipcMain.handle(IpcChannels.project.pickFolder, async () => {
    return pickProjectFolder()
  })

  ipcMain.handle(IpcChannels.project.openInVsCode, async () => {
    return openInVsCode()
  })
}
