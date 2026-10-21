import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AiNetworkStatus, GeminiModelInfo } from '@shared/types'
import { checkOllamaStatus } from '../services/ai'
import {
  hasGoogleApiKey,
  keyCount,
  getNextGoogleApiKey,
  listConfiguredGeminiModels,
  addGeminiModel,
  removeGeminiModel,
  getActiveGeminiModel,
  setActiveGeminiModel,
  getVisionModel,
  setVisionModel,
  isVisionEnabled,
  setVisionEnabled
} from '../services/ai/googleKeyStore'
import { listGeminiModels } from '../services/ai/geminiModels'
import { askGemini } from '../services/ai/geminiChat'
import { getDebateRounds, setDebateRounds } from '../flameCore/debateStore'
import { getDifficulty, setDifficulty } from '../flameCore/difficultyStore'
import type { FlameDifficulty } from '@shared/types'
import { getOpenCodeCommand, setOpenCodeCommand, isOpenCodeEnabled, setOpenCodeEnabled } from '../services/ai/openCodeStore'

export function registerAiNetworkIpc(): void {
  ipcMain.handle(IpcChannels.aiNetwork.status, async (): Promise<AiNetworkStatus> => {
    const [ollama, geminiConfigured, geminiKeys] = await Promise.all([
      checkOllamaStatus(),
      hasGoogleApiKey(),
      keyCount()
    ])
    return {
      ollama,
      gemini: { configured: geminiConfigured, keyCount: geminiKeys }
    }
  })

  ipcMain.handle(IpcChannels.aiNetwork.testGemini, async () => {
    try {
      const reply = await askGemini('Reply with just the word "connected".')
      return { success: true, message: reply }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // Gemini model management — purely user-entered.
  ipcMain.handle(IpcChannels.aiNetwork.listConfiguredGeminiModels, async (): Promise<string[]> => {
    return listConfiguredGeminiModels()
  })
  ipcMain.handle(IpcChannels.aiNetwork.addGeminiModel, async (_event, modelId: string): Promise<string[]> => {
    return addGeminiModel(modelId)
  })
  ipcMain.handle(IpcChannels.aiNetwork.removeGeminiModel, async (_event, modelId: string): Promise<string[]> => {
    return removeGeminiModel(modelId)
  })
  ipcMain.handle(IpcChannels.aiNetwork.getActiveGeminiModel, async (): Promise<string | null> => {
    return getActiveGeminiModel()
  })
  ipcMain.handle(IpcChannels.aiNetwork.setActiveGeminiModel, async (_event, modelId: string): Promise<void> => {
    await setActiveGeminiModel(modelId)
  })

  // Optional discovery — a "see what's on my key" convenience, entirely
  // separate from the resolution path above; never auto-applied.
  ipcMain.handle(IpcChannels.aiNetwork.listGeminiModels, async (): Promise<GeminiModelInfo[]> => {
    const key = await getNextGoogleApiKey()
    if (!key) return []
    try {
      return await listGeminiModels(key)
    } catch {
      return []
    }
  })

  ipcMain.handle(IpcChannels.aiNetwork.getVisionModel, async (): Promise<string | null> => {
    return getVisionModel()
  })
  ipcMain.handle(IpcChannels.aiNetwork.setVisionModel, async (_event, modelId: string): Promise<void> => {
    await setVisionModel(modelId)
  })
  ipcMain.handle(IpcChannels.aiNetwork.isVisionEnabled, async (): Promise<boolean> => isVisionEnabled())
  ipcMain.handle(IpcChannels.aiNetwork.setVisionEnabled, async (_event, enabled: boolean): Promise<void> => {
    await setVisionEnabled(enabled)
  })

  ipcMain.handle(IpcChannels.aiNetwork.getOpenCodeCommand, async (): Promise<string> => getOpenCodeCommand())
  ipcMain.handle(IpcChannels.aiNetwork.setOpenCodeCommand, async (_event, command: string): Promise<void> => {
    await setOpenCodeCommand(command)
  })
  ipcMain.handle(IpcChannels.aiNetwork.isOpenCodeEnabled, async (): Promise<boolean> => isOpenCodeEnabled())
  ipcMain.handle(IpcChannels.aiNetwork.setOpenCodeEnabled, async (_event, enabled: boolean): Promise<void> => {
    await setOpenCodeEnabled(enabled)
  })

  ipcMain.handle(IpcChannels.aiNetwork.getDebateRounds, async (): Promise<number> => getDebateRounds())
  ipcMain.handle(IpcChannels.aiNetwork.setDebateRounds, async (_event, rounds: number): Promise<void> => {
    await setDebateRounds(rounds)
  })
  ipcMain.handle(IpcChannels.aiNetwork.getDifficulty, async (): Promise<FlameDifficulty> => getDifficulty())
  ipcMain.handle(IpcChannels.aiNetwork.setDifficulty, async (_event, difficulty: FlameDifficulty): Promise<void> => {
    await setDifficulty(difficulty)
  })
}

