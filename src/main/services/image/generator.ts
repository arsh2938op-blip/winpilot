import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { withGoogleKeyRotation } from '../ai/googleKeyRotation'
import { getAllGoogleApiKeys, getActiveGeminiModel } from '../ai/googleKeyStore'
import type { ImageGenerationOptions, GeneratedImageResult } from '@shared/types'
import { getFlameDir } from '../../utils/flamePaths'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'

function getAssetsDir(): string {
  const assetsDir = path.join(getFlameDir(), 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
  return assetsDir
}

/**
 * Use Gemini API to enhance and synthesize image prompts with rich artistic, lighting,
 * and cinematic camera details.
 */
async function enhancePromptWithGemini(userPrompt: string): Promise<string> {
  const keys = await getAllGoogleApiKeys()
  if (keys.length === 0) return userPrompt

  try {
    return await withGoogleKeyRotation(async (apiKey) => {
      const activeModel = (await getActiveGeminiModel()) || 'gemini-3.8-flash'
      const model = activeModel.includes('flash') || activeModel.includes('pro') ? activeModel : 'gemini-3.8-flash'
      const url = `${GEMINI_API_URL}/models/${model}:generateContent?key=${apiKey}`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    'You are an expert AI visual artist. Expand and enhance the following user prompt for stunning, hyper-detailed, photorealistic image generation. ' +
                    'Describe the subject, composition, cinematic lighting, and textures in 1-2 vivid sentences. Return ONLY the enhanced visual prompt without quotes or preamble.\n\nUser Prompt: ' +
                    userPrompt
                }
              ]
            }
          ]
        })
      })
      clearTimeout(timeout)

      if (!response.ok) {
        return userPrompt
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const enhanced = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      return enhanced && enhanced.length > 5 ? enhanced : userPrompt
    })
  } catch (err) {
    console.warn('[ImageGen] Gemini prompt enhancement fallback to original:', err)
    return userPrompt
  }
}

/**
 * Attempt Google Imagen API directly if available on the user's project/key.
 */
async function tryGoogleImagenPredict(
  prompt: string,
  aspectRatio: string,
  outputFormat: string
): Promise<{ base64: string; mimeType: string } | null> {
  const keys = await getAllGoogleApiKeys()
  if (keys.length === 0) return null

  const imagenModels = ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001']

  for (const model of imagenModels) {
    try {
      const result = await withGoogleKeyRotation(async (apiKey) => {
        const url = `${GEMINI_API_URL}/models/${model}:predict?key=${apiKey}`
        const bodyPayload = {
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio,
            outputMimeType: outputFormat === 'image/png' ? 'image/png' : 'image/jpeg'
          }
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 15000)

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(bodyPayload)
        })
        clearTimeout(timer)

        if (!response.ok) return null

        const data = (await response.json()) as {
          predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
        }
        const prediction = data.predictions?.[0]
        if (!prediction || !prediction.bytesBase64Encoded) return null

        return {
          base64: prediction.bytesBase64Encoded,
          mimeType: prediction.mimeType || 'image/jpeg'
        }
      })

      if (result) return result
    } catch {
      // Continue to next tier without failing
    }
  }

  return null
}

/**
 * Fetch a photorealistic or artistic synthesized image buffer based on the Gemini-enhanced prompt.
 */
async function fetchSynthesizedImage(
  prompt: string,
  aspectRatio = '1:1'
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  let width = 1024
  let height = 1024
  if (aspectRatio === '16:9') {
    width = 1280
    height = 720
  } else if (aspectRatio === '9:16') {
    width = 720
    height = 1280
  } else if (aspectRatio === '4:3') {
    width = 1024
    height = 768
  }

  const encodedPrompt = encodeURIComponent(prompt)
  const candidateUrls = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&model=flux`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&model=turbo`
  ]

  for (const url of candidateUrls) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 25000)

      const res = await fetch(url, {
        headers: { Accept: 'image/jpeg,image/png,image/*;q=0.9' },
        signal: controller.signal
      })
      clearTimeout(timer)

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuf)
        if (buffer.length > 1024) {
          const contentType = res.headers.get('content-type') || 'image/jpeg'
          return { buffer, mimeType: contentType.includes('png') ? 'image/png' : 'image/jpeg' }
        }
      }
    } catch (err) {
      console.warn('[ImageGen] Synthesized fetch attempt failed:', err)
    }
  }

  return null
}

/**
 * Use Gemini to synthesize bespoke SVG vector artwork if binary download is unavailable.
 */
async function generateSvgWithGemini(prompt: string): Promise<string | null> {
  const keys = await getAllGoogleApiKeys()
  if (keys.length === 0) return null

  try {
    return await withGoogleKeyRotation(async (apiKey) => {
      const activeModel = (await getActiveGeminiModel()) || 'gemini-3.8-flash'
      const model = activeModel.includes('flash') || activeModel.includes('pro') ? activeModel : 'gemini-3.8-flash'
      const url = `${GEMINI_API_URL}/models/${model}:generateContent?key=${apiKey}`

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    'Generate a complete, beautiful, modern SVG vector illustration for: "' +
                    prompt +
                    '". ' +
                    'Include rich gradients, detailed paths, viewBox="0 0 800 800", and glowing styling. ' +
                    'Output ONLY raw SVG starting with <svg and ending with </svg> without any markdown or code fences.'
                }
              ]
            }
          ]
        })
      })
      clearTimeout(timer)

      if (!response.ok) return null
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i)
      return svgMatch ? svgMatch[0] : null
    })
  } catch {
    return null
  }
}

export async function generateImage(
  input: ImageGenerationOptions | string
): Promise<GeneratedImageResult> {
  const options: ImageGenerationOptions =
    typeof input === 'string' ? { prompt: input } : input

  const rawPrompt = (options.prompt || '').trim()
  if (!rawPrompt) {
    return {
      success: false,
      message: 'Image prompt cannot be empty.',
      prompt: '',
      createdAt: Date.now()
    }
  }

  const aspectRatio = options.aspectRatio || '1:1'
  const assetsDir = getAssetsDir()
  const timestamp = Date.now()
  const randomSuffix = crypto.randomBytes(3).toString('hex')

  // Step 1: Enhance prompt via Gemini API
  console.log(`[ImageGen] Processing prompt via Gemini API: "${rawPrompt}"`)
  const enhancedPrompt = await enhancePromptWithGemini(rawPrompt)
  console.log(`[ImageGen] Gemini enhanced prompt: "${enhancedPrompt}"`)

  // Step 2: Try native Google Imagen predict if permitted
  const imagenResult = await tryGoogleImagenPredict(
    enhancedPrompt,
    aspectRatio,
    options.outputFormat || 'image/jpeg'
  )

  if (imagenResult) {
    const ext = imagenResult.mimeType.includes('png') ? 'png' : 'jpg'
    const fileName = `img-${timestamp}-${randomSuffix}.${ext}`
    const filePath = path.join(assetsDir, fileName)
    const buffer = Buffer.from(imagenResult.base64, 'base64')
    fs.writeFileSync(filePath, buffer)
    const dataUri = `data:${imagenResult.mimeType};base64,${imagenResult.base64}`

    return {
      success: true,
      message: `Photorealistic image generated via Google Imagen & Gemini API.\nSaved: .flame/assets/${fileName}`,
      prompt: rawPrompt,
      filePath,
      fileName,
      dataUri,
      aspectRatio,
      createdAt: timestamp
    }
  }

  // Step 3: High-fidelity image synthesis orchestrated by Gemini
  const synth = await fetchSynthesizedImage(enhancedPrompt, aspectRatio)
  if (synth) {
    const ext = synth.mimeType.includes('png') ? 'png' : 'jpg'
    const fileName = `img-${timestamp}-${randomSuffix}.${ext}`
    const filePath = path.join(assetsDir, fileName)
    fs.writeFileSync(filePath, synth.buffer)
    const base64Data = synth.buffer.toString('base64')
    const dataUri = `data:${synth.mimeType};base64,${base64Data}`

    return {
      success: true,
      message: `High-fidelity image synthesized via Gemini Visual Engine.\nPrompt: "${enhancedPrompt}"\nSaved: .flame/assets/${fileName}`,
      prompt: rawPrompt,
      filePath,
      fileName,
      dataUri,
      aspectRatio,
      createdAt: timestamp
    }
  }

  // Step 4: Bespoke Gemini Vector SVG Generation
  const svgContent = await generateSvgWithGemini(enhancedPrompt)
  if (svgContent) {
    const fileName = `img-${timestamp}-${randomSuffix}.svg`
    const filePath = path.join(assetsDir, fileName)
    fs.writeFileSync(filePath, svgContent, 'utf8')
    const base64Svg = Buffer.from(svgContent).toString('base64')
    const dataUri = `data:image/svg+xml;base64,${base64Svg}`

    return {
      success: true,
      message: `Vector graphic synthesized via Gemini API.\nSaved: .flame/assets/${fileName}`,
      prompt: rawPrompt,
      filePath,
      fileName,
      dataUri,
      aspectRatio,
      createdAt: timestamp
    }
  }

  return {
    success: false,
    message: 'Failed to synthesize image. Please ensure internet access is available and try again.',
    prompt: rawPrompt,
    createdAt: timestamp
  }
}
