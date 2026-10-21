import { ipcMain, dialog } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { MinecraftConfig, MinecraftStatus } from '@shared/types'
import {
  getMinecraftConfig,
  saveMinecraftConfig,
  writeMinecraftEnvFile,
  listModelPresets
} from '../services/minecraft/store'
import { startMindCraft, stopMindCraft, getMinecraftStatus } from '../services/minecraft/process'

export function registerMinecraftIpc(): void {
  ipcMain.handle(IpcChannels.minecraft.getConfig, async (): Promise<MinecraftConfig> => getMinecraftConfig())

  ipcMain.handle(IpcChannels.minecraft.saveConfig, async (_event, config: MinecraftConfig): Promise<void> => {
    await saveMinecraftConfig(config)
  })

  ipcMain.handle(IpcChannels.minecraft.pickFolder, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const config = await getMinecraftConfig()
    const next = { ...config, projectPath: result.filePaths[0] }
    await saveMinecraftConfig(next)
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.minecraft.listModelPresets, async (): Promise<Record<string, string[]>> => {
    const config = await getMinecraftConfig()
    if (!config.projectPath) return {}
    return listModelPresets(config.projectPath)
  })

  ipcMain.handle(IpcChannels.minecraft.start, async () => {
    const config = await getMinecraftConfig()
    if (!config.projectPath) return { success: false, message: 'No MindCraft folder configured.' }
    try {
      await writeMinecraftEnvFile(config)
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) }
    }
    return startMindCraft(config.projectPath, config)
  })

  ipcMain.handle(IpcChannels.minecraft.stop, async () => stopMindCraft())

  ipcMain.handle(IpcChannels.minecraft.getStatus, async (): Promise<MinecraftStatus> => getMinecraftStatus())
}

