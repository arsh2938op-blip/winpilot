import { promises as fs } from 'fs'
import path from 'path'
import { withGoogleKeyRotation, KeyLevelError, isKeyLevelHttpError } from './googleKeyRotation'
import { getVisionModel, isVisionEnabled } from './googleKeyStore'
import { emitAgentActivity } from '../../utils/broadcast'

const GENERATIVE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

export async function inspectImage(imagePath: string, question: string, requestId?: string): Promise<string> {
  if (!(await isVisionEnabled())) throw new Error('Vision is disabled — enable it in AI Network settings.')

  const model = await getVisionModel()
  if (!model) throw new Error('No vision model configured yet — add one in AI Network → Vision.')
  emitAgentActivity(requestId, '[Vision] Opening image…')

  const ext = path.extname(imagePath).toLowerCase()
  const mimeType = MIME_BY_EXT[ext]
  if (!mimeType) throw new Error(`Unsupported image type "${ext}".`)

  const data = (await fs.readFile(imagePath)).toString('base64')

  emitAgentActivity(requestId, '[Vision] Sending to Gemini…')
  return withGoogleKeyRotation(async (apiKey) => {
    const res = await fetch(`${GENERATIVE_URL}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }, { inline_data: { mime_type: mimeType, data } }] }]
      })
    })

    if (!res.ok) {
      if (isKeyLevelHttpError(res.status)) throw new KeyLevelError(`Vision request failed (${res.status})`)
      throw new Error(`Vision request failed: model "${model}" returned ${res.status}.`)
    }

    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text.trim()) throw new Error('Vision model returned an empty response.')
    emitAgentActivity(requestId, '[Vision] Response received')
    return text.trim()
  })
}
