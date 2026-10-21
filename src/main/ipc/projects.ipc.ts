import { ipcMain, dialog } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ImportedProject, ProjectPermissions } from '@shared/types'
import {
  listImportedProjects,
  addImportedProject,
  removeImportedProject,
  setProjectPermissions
} from '../services/projects/store'
import { setCurrentProject } from '../services/project/store'

export function registerProjectsIpc(): void {
  ipcMain.handle(IpcChannels.projects.list, async (): Promise<ImportedProject[]> => listImportedProjects())

  ipcMain.handle(IpcChannels.projects.import, async (): Promise<ImportedProject[]> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return listImportedProjects()
    return addImportedProject(result.filePaths[0])
  })

  ipcMain.handle(IpcChannels.projects.remove, async (_e, id: string): Promise<ImportedProject[]> => removeImportedProject(id))

  ipcMain.handle(
    IpcChannels.projects.setPermissions,
    async (_e, id: string, permissions: ProjectPermissions): Promise<ImportedProject[]> =>
      setProjectPermissions(id, permissions)
  )

  ipcMain.handle(IpcChannels.projects.setActive, async (_e, projectPath: string): Promise<void> => {
    await setCurrentProject(projectPath)
  })
}
