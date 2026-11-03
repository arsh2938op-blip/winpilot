import { getNextGoogleApiKey, markKeyFailed, getAllGoogleApiKeys, resetFailedKeys } from './googleKeyStore'

export class KeyLevelError extends Error {}

/**
 * Returns true only if the error represents a permanent invalidation of the API key
 * (e.g. 401 Unauthorized / Invalid API Key).
 * 429 is a temporary rate limit or quota per model, NOT an invalid key.
 */
export function isKeyLevelHttpError(status: number): boolean {
  return status === 401
}

/** Shared by every Google-backed feature (TTS, STT, Gemini chat) — one
 * rotation implementation instead of one per feature. */
export async function withGoogleKeyRotation<T>(attempt: (key: string) => Promise<T>): Promise<T> {
  const allKeys = await getAllGoogleApiKeys()
  const total = allKeys.length
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

  // If we exhausted keys due to transient errors, reset failed list so subsequent calls work
  await resetFailedKeys().catch(() => {})

  throw new Error(
    `All ${total} configured Google API key(s) encountered an error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}
