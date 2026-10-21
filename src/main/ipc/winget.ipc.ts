import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { WingetPackage } from '@shared/types'
import * as wingetService from '../services/winget'

/**
 * Winget Manager — the first real feature (per the project plan).
 * This file only wires channels to the service layer. All actual logic
 * (running `winget`, parsing output, streaming progress) belongs in
 * src/main/services/winget, so it stays testable independent of Electron.
 */
export function registerWingetIpc(): void {
  ipcMain.handle(IpcChannels.winget.listInstalled, async (): Promise<WingetPackage[]> => {
    // TODO: replace with wingetService.listInstalled()
    return wingetService.listInstalled()
  })
  
  ipcMain.handle(IpcChannels.winget.listUpgradable, async (): Promise<WingetPackage[]> => {
    return wingetService.listUpgradable()
  })

  ipcMain.handle(
    IpcChannels.winget.search,
    async (_event, query: string): Promise<WingetPackage[]> => {
      // TODO: replace with wingetService.search(query)
      return wingetService.search(query)
    }
  )

  ipcMain.handle(IpcChannels.winget.install, async (_event, packageId: string): Promise<void> => {
    // TODO: replace with wingetService.install(packageId), streaming
    // progress back via IpcChannels.winget.onProgress.
    // IMPORTANT: per project philosophy, installs should be confirmed in
    // the UI before this handler is ever invoked.
    return wingetService.install(packageId)
  })

  ipcMain.handle(IpcChannels.winget.update, async (_event, packageId: string): Promise<void> => {
    // TODO: replace with wingetService.update(packageId)
    return wingetService.update(packageId)
  })

  ipcMain.handle(
    IpcChannels.winget.uninstall,
    async (_event, packageId: string): Promise<void> => {
      // TODO: replace with wingetService.uninstall(packageId)
      // IMPORTANT: the renderer must confirm with the user before calling
      // this — see project safety philosophy in the README.
      return wingetService.uninstall(packageId)
    }
  )
}
