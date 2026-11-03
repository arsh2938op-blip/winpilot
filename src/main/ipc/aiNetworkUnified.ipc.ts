import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AiNetworkSnapshot } from '@shared/types'
import { readNetworkConfig, updateNetworkConfig } from '../services/aiNetwork/config'
import { checkAllEndpoints, testEndpoint } from '../services/aiNetwork/health'
import { getActiveChatMode } from '../services/aiNetwork/mode'
import { getCurrentProject } from '../services/project/store'

async function activeProjectPath(): Promise<string | undefined> {
  try {
    const project = await getCurrentProject()
    return project.path || undefined
  } catch {
    return undefined
  }
}

/**
 * IPC surface for the AI Network panel. The panel edits the same
 * `.flame/coder_config.json` the router reads, so UI changes take effect on
 * the next Task run with no restart and no duplicated defaults.
 */
export function registerAiNetworkUnifiedIpc(): void {
  ipcMain.handle(IpcChannels.aiNetwork.getConfig, async () => {
    return readNetworkConfig(await activeProjectPath())
  })

  ipcMain.handle(IpcChannels.aiNetwork.updateConfig, async (_event, update) => {
    return updateNetworkConfig(update, await activeProjectPath())
  })

  ipcMain.handle(IpcChannels.aiNetwork.getSnapshot, async (): Promise<AiNetworkSnapshot> => {
    const projectPath = await activeProjectPath()
    const config = await readNetworkConfig(projectPath)
    const endpoints = await checkAllEndpoints(config.endpoints)
    return {
      config,
      endpoints,
      taskMode: getActiveChatMode() === 'task'
    }
  })

  ipcMain.handle(IpcChannels.aiNetwork.testEndpoint, async (_event, endpointId: string) => {
    const config = await readNetworkConfig(await activeProjectPath())
    const endpoint = config.endpoints.find((item) => item.id === endpointId)
    if (!endpoint) return { success: false, message: `No endpoint "${endpointId}" in ${config.configPath}.` }
    return testEndpoint(endpoint)
  })
}
