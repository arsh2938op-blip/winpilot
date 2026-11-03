import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { FlamePluginMeta } from '@shared/types'
import * as pluginManager from '../flameCore/pluginManager'

export function registerPluginsIpc(): void {
  ipcMain.handle(IpcChannels.plugins.list, async (): Promise<FlamePluginMeta[]> => {
    return pluginManager.listPlugins()
  })

  ipcMain.handle(
    IpcChannels.plugins.toggle,
    async (
      _event,
      pluginId: string,
      targetState?: boolean
    ): Promise<{ success: boolean; plugin: FlamePluginMeta }> => {
      return pluginManager.togglePlugin(pluginId, targetState)
    }
  )

  ipcMain.handle(
    IpcChannels.plugins.getState,
    async (_event, pluginId: string): Promise<boolean> => {
      return pluginManager.isPluginActive(pluginId)
    }
  )
}

