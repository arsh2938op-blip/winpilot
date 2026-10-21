import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { getCapability } from '../flameCore/capabilities'
import { runStagedOperation } from '../plugins/files/pendingOps'

export function registerFilesIpc(): void {
  ipcMain.handle(IpcChannels.files.confirmOperation, async (_event, operationId: string) => {
    return runStagedOperation(operationId)
  })

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

  ipcMain.handle(IpcChannels.files.readPdfText, async (_event, filePath: string) => {
    const capability = getCapability('files.readPdfText')
    if (!capability) return { success: false, message: 'PDF reading not available.' }
    return capability.run({ path: filePath })
  })
}
