import { getNextGoogleApiKey, markKeyFailed, getAllGoogleApiKeys } from './googleKeyStore'

export class KeyLevelError extends Error {}

export function isKeyLevelHttpError(status: number): boolean {
  return status === 401 || status === 403 || status === 429
}

/** Shared by every Google-backed feature (TTS, STT, Gemini chat) — one
 * rotation implementation instead of one per feature. */
export async function withGoogleKeyRotation<T>(attempt: (key: string) => Promise<T>): Promise<T> {
  const total = (await getAllGoogleApiKeys()).length
  if (total === 0) {
    throw new Error('No Google API key set yet — add one in Flame AGI settings.')
  }

  let lastError: unknown
  for (let i = 0; i < total; i++) {
    const key = await getNextGoogleApiKey()
    if (!key) break
    try {
      return await attempt(key)
    } catch (err) {
      lastError = err
      if (err instanceof KeyLevelError) {
        await markKeyFailed(key)
        continue
      }
      throw err
    }
  }

  throw new Error(
    `All ${total} configured Google API key(s) are currently unavailable: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}
