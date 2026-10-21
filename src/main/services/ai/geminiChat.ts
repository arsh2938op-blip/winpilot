import { withGoogleKeyRotation, KeyLevelError, isKeyLevelHttpError } from './googleKeyRotation'
import { getActiveGeminiModel } from './googleKeyStore'

const GENERATIVE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Uses EXACTLY the model the user configured in Flame Chat Settings —
 * no discovery, no auto-pick, no hardcoded fallback. If nothing is
 * configured, this fails with a precise, actionable message rather than
 * guessing at a model id (which is exactly what produced the earlier 404).
 */
export async function askGemini(prompt: string): Promise<string> {
  const model = await getActiveGeminiModel()
  if (!model) {
    throw new Error('No Gemini model configured. Add a model ID in Flame Chat Settings.')
  }

  return withGoogleKeyRotation(async (apiKey) => {
    const res = await fetch(`${GENERATIVE_URL}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })

    if (!res.ok) {
      if (isKeyLevelHttpError(res.status)) throw new KeyLevelError(`Gemini request failed (${res.status})`)
      throw new Error(`Gemini request failed: model "${model}" returned ${res.status}.`)
    }

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text.trim()) throw new Error('Gemini returned an empty response.')
    return text.trim()
  })
}
