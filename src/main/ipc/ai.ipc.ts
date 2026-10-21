import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  AiResponse,
  AiStatus,
  GoogleSpeakResult,
  GoogleTranscribeResult,
  ZapierToolInfo,
  ChatModelId
} from '@shared/types'
import { getCapability } from '../flameCore/capabilities'
import type { EffortLevel } from '../flameCore/effort'
import { handlePrompt, checkOllamaStatus } from '../services/ai'
import { setGoogleApiKeys, hasGoogleApiKey, keyCount } from '../services/ai/googleKeyStore'
import { googleSpeak, googleTranscribe } from '../services/ai/googleVoice'
import { setZapierMcpUrl, hasZapierMcpUrl } from '../services/ai/zapierStore'
import { resetZapierClient, listToolSummaries } from '../services/ai/zapierClient'
import { stopDebate } from '../services/ai/debate'

export function registerAiIpc(): void {
  ipcMain.handle(
    IpcChannels.ai.sendPrompt,
    async (_event, prompt: string, model?: ChatModelId, requestId?: string, effort?: EffortLevel | 'auto'): Promise<AiResponse> => {
      return handlePrompt(prompt, model, requestId, effort)
    }
  )

  ipcMain.handle(IpcChannels.ai.stopDebate, async (): Promise<void> => {
    stopDebate()
  })

  ipcMain.handle(IpcChannels.ai.checkStatus, async (): Promise<AiStatus> => {
    return checkOllamaStatus()
  })

  ipcMain.handle(IpcChannels.ai.setGoogleApiKey, async (_event, keys: string): Promise<void> => {
    await setGoogleApiKeys(keys)
  })

  ipcMain.handle(IpcChannels.ai.hasGoogleApiKey, async (): Promise<boolean> => {
    return hasGoogleApiKey()
  })

  ipcMain.handle(IpcChannels.ai.googleKeyCount, async (): Promise<number> => {
    return keyCount()
  })

  ipcMain.handle(
    IpcChannels.ai.googleSpeak,
    async (_event, text: string, voiceName: string): Promise<GoogleSpeakResult> => {
      return googleSpeak(text, voiceName)
    }
  )

  ipcMain.handle(
    IpcChannels.ai.googleTranscribe,
    async (_event, audioBase64: string, languageCode: string): Promise<GoogleTranscribeResult> => {
      return googleTranscribe(audioBase64, languageCode)
    }
  )

  ipcMain.handle(
    IpcChannels.ai.inspectImage,
    async (_event, imagePath: string, question: string, requestId?: string) => {
      const capability = getCapability('vision.inspectImage')
      if (!capability) return { success: false, message: 'Vision is not available.' }
      return capability.run({ path: imagePath, question, requestId })
    }
  )
  ipcMain.handle(
    IpcChannels.ai.inspectFolderImages,
    async (_event, dirPath: string, question: string, requestId?: string) => {
      const capability = getCapability('vision.inspectFolder')
      if (!capability) return { success: false, message: 'Vision is not available.' }
      return capability.run({ path: dirPath, question, requestId })
    }
  )
  ipcMain.handle(
    IpcChannels.ai.inspectZipImages,
    async (_event, zipPath: string, question: string, requestId?: string) => {
      const capability = getCapability('vision.inspectZip')
      if (!capability) return { success: false, message: 'Vision is not available.' }
      return capability.run({ path: zipPath, question, requestId })
    }
  )

  ipcMain.handle(IpcChannels.ai.setZapierMcpUrl, async (_event, url: string): Promise<void> => {
    await setZapierMcpUrl(url)
    resetZapierClient()
  })

  ipcMain.handle(IpcChannels.ai.hasZapierMcpUrl, async (): Promise<boolean> => {
    return hasZapierMcpUrl()
  })

  ipcMain.handle(IpcChannels.ai.listZapierTools, async (): Promise<ZapierToolInfo[]> => {
    try {
      return await listToolSummaries()
    } catch {
      return []
    }
  })
}
