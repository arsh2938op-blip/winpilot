import { registerCapability, type CapabilityResult } from '../../flameCore/capabilities'
import { generateImage } from '../../services/image'
import type { ImageGenerationOptions } from '@shared/types'

export function registerImageCapabilities(): void {
  registerCapability(
    {
      id: 'image.generate',
      name: 'image.generate',
      label: 'Gemini Image Generation',
      description: 'Generate high-fidelity visual assets and illustrations using Gemini Imagen-3.',
      pluginId: 'image',
      parameters: {
        prompt: { type: 'string', description: 'Detailed visual description of the image to generate' },
        aspectRatio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          description: 'Desired aspect ratio (default 1:1)'
        }
      },
      run: async (args: Record<string, unknown>): Promise<CapabilityResult> => {
        const prompt = String(args.prompt || args.instruction || args.text || args.query || '').trim()
        if (!prompt) {
          return {
            success: false,
            message: 'Please provide a prompt describing the image you want to generate.'
          }
        }

        const aspectRatio = (args.aspectRatio as ImageGenerationOptions['aspectRatio']) || '1:1'
        const result = await generateImage({
          prompt,
          aspectRatio
        })

        return {
          success: result.success,
          message: result.message,
          data: result
        }
      }
    },
    'image'
  )
}

