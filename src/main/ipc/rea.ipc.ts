import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import {
  executeReaInspectFile,
  executeReaInspectAsar,
  executeReaAuditWorkspace,
  executeReaGenerateFolder,
  executeReaExportZip,
  executeReaCodeOnEvidence
} from '../plugins/rea/capabilities'

export function registerReaIpc(): void {
  ipcMain.handle(
    IpcChannels.rea.inspectFile,
    async (_event, filePath: string, requestId?: string) => {
      return executeReaInspectFile(filePath, requestId)
    }
  )

  ipcMain.handle(
    IpcChannels.rea.inspectAsar,
    async (_event, asarPath: string, requestId?: string) => {
      return executeReaInspectAsar(asarPath, requestId)
    }
  )

  ipcMain.handle(
    IpcChannels.rea.auditWorkspace,
    async (_event, workspaceDir?: string, requestId?: string) => {
      return executeReaAuditWorkspace(workspaceDir, requestId)
    }
  )

  ipcMain.handle(
    IpcChannels.rea.generateFolder,
    async (
      _event,
      args: {
        folderName: string
        baseDir?: string
        files?: Record<string, string>
        subFolders?: string[]
      },
      requestId?: string
    ) => {
      return executeReaGenerateFolder(args, requestId)
    }
  )

  ipcMain.handle(
    IpcChannels.rea.exportZip,
    async (
      _event,
      args: {
        sourcePath: string
        outputZipPath?: string
      },
      requestId?: string
    ) => {
      return executeReaExportZip(args, requestId)
    }
  )

  ipcMain.handle(
    IpcChannels.rea.codeOnEvidence,
    async (
      _event,
      args: {
        task: string
        targetPath?: string
        workspaceDir?: string
      },
      requestId?: string
    ) => {
      return executeReaCodeOnEvidence(args, requestId)
    }
  )
}
