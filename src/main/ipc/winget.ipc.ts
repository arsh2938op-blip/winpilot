import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { WingetPackage } from '@shared/types'
import * as wingetService from '../services/winget'

/**
 * Winget Manager IPC registration.
 * Connects renderer invocations to wingetService.
 */
export function registerWingetIpc(): void {
  ipcMain.handle(IpcChannels.winget.listInstalled, async (): Promise<WingetPackage[]> => {
    return wingetService.listInstalled()
  })

  ipcMain.handle(IpcChannels.winget.listUpgradable, async (): Promise<WingetPackage[]> => {
    return wingetService.listUpgradable()
  })

  ipcMain.handle(
    IpcChannels.winget.search,
    async (_event, query: string): Promise<WingetPackage[]> => {
      return wingetService.search(query)
    }
  )

  ipcMain.handle(IpcChannels.winget.install, async (_event, packageId: string): Promise<void> => {
    // IMPORTANT: installs must be confirmed in the UI review dialog before execution
    return wingetService.install(packageId)
  })

  ipcMain.handle(IpcChannels.winget.update, async (_event, packageId: string): Promise<void> => {
    return wingetService.update(packageId)
  })

  ipcMain.handle(
    IpcChannels.winget.uninstall,
    async (_event, packageId: string): Promise<void> => {
      // IMPORTANT: uninstalls must be confirmed in the UI dialog before execution
      return wingetService.uninstall(packageId)
    }
  )

  ipcMain.handle(
    IpcChannels.winget.getIcon,
    async (_event, packageId: string, packageName?: string): Promise<string | undefined> => {
      return wingetService.getIconForPackage(packageId, packageName)
    }
  )

  ipcMain.handle(
    IpcChannels.winget.getMetadata,
    async (_event, packageId: string): Promise<{ icon?: string; description?: string; publisher?: string; homepage?: string }> => {
      return wingetService.getWingetMetadata(packageId)
    }
  )
}
