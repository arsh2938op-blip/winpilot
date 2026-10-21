import type { GeminiModelInfo } from '@shared/types'

const LIST_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Live model discovery via Gemini's own ListModels endpoint. This
 * replaces the previous hardcoded model id — which is exactly what
 * produced the 404 — with the actual list the API says is usable for
 * this key, filtered to models that support generateContent.
 */
export async function listGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const res = await fetch(`${LIST_URL}?key=${apiKey}`)
  if (!res.ok) throw new Error(`Could not list Gemini models (${res.status}).`)
  const data = (await res.json()) as {
    models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
  }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), displayName: m.displayName }))
}
