import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getCapability } from '../flameCore/capabilities'

export function registerAttachmentFilesIpc(): void {
  ipcMain.handle(IpcChannels.files.readText, async (_event, filePath: string) => {
    const capability = getCapability('files.readText')
    if (!capability) return { success: false, message: 'File reading not available.' }
    return capability.run({ path: filePath })
  })

  ipcMain.handle(IpcChannels.files.listDirectory, async (_event, dirPath: string) => {
    const capability = getCapability('files.listDirectory')
    if (!capability) return { success: false, message: 'Directory listing not available.' }
    return capability.run({ path: dirPath })
  })
}
