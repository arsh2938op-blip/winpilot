import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ImageGenerationOptions, GeneratedImageResult } from '@shared/types'
import { generateImage } from '../services/image'

export function registerImageIpc(): void {
  ipcMain.handle(
    IpcChannels.image.generate,
    async (
      _event,
      input: ImageGenerationOptions | string
    ): Promise<GeneratedImageResult> => {
      return generateImage(input)
    }
  )
}

