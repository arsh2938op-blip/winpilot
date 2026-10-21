import { withGoogleKeyRotation, KeyLevelError, isKeyLevelHttpError } from './googleKeyRotation'

const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const GENERATIVE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const SPEECH_URL = 'https://speech.googleapis.com/v1/speech:recognize'

export interface GoogleSpeakResult {
  audioBase64: string
}
export interface GoogleTranscribeResult {
  text: string
}

/** Wraps raw PCM audio (what Gemini TTS returns) in a WAV header so the
 * renderer can just play it as a normal audio file — no Web Audio API
 * buffer decoding needed on the frontend. */
function pcmToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64')
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * 2

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmBuffer.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcmBuffer.length, 40)

  return Buffer.concat([header, pcmBuffer]).toString('base64')
}

/**
 * Text-to-speech via Gemini's TTS endpoint. Runs in the main process so
 * the API key never has to live in renderer memory/DevTools.
 */
export async function googleSpeak(text: string, voiceName: string): Promise<GoogleSpeakResult> {
  return withGoogleKeyRotation(async (apiKey) => {
    const res = await fetch(`${GENERATIVE_URL}/${TTS_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
        },
        model: TTS_MODEL
      })
    })

    if (!res.ok) {
      if (isKeyLevelHttpError(res.status)) throw new KeyLevelError(`Google TTS request failed (${res.status}).`)
      throw new Error(`Google TTS request failed (${res.status}).`)
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
    }
    const part = data.candidates?.[0]?.content?.parts?.[0]
    const audioB64 = part?.inlineData?.data
    const mimeType = part?.inlineData?.mimeType

    if (!audioB64 || !mimeType) throw new Error('Google TTS returned no audio.')

    const rateMatch = mimeType.match(/rate=(\d+)/)
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000

    return { audioBase64: pcmToWavBase64(audioB64, sampleRate) }
  })
}

/**
 * Speech-to-text via Google Cloud Speech-to-Text — a DIFFERENT Google
 * product/API from Gemini, usually needing its own enablement (and
 * billing) on your Google Cloud project. If this errors with a
 * permission/billing message, that's the API to check in your console.
 */
export async function googleTranscribe(
  audioBase64: string,
  languageCode: string
): Promise<GoogleTranscribeResult> {
  return withGoogleKeyRotation(async (apiKey) => {
    const res = await fetch(`${SPEECH_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: { encoding: 'WEBM_OPUS', languageCode },
        audio: { content: audioBase64 }
      })
    })

    if (!res.ok) {
      if (isKeyLevelHttpError(res.status)) throw new KeyLevelError(`Google Speech-to-Text request failed (${res.status}).`)
      throw new Error(`Google Speech-to-Text request failed (${res.status}).`)
    }

    const data = (await res.json()) as {
      results?: { alternatives?: { transcript?: string }[] }[]
    }
    const text = data.results?.[0]?.alternatives?.[0]?.transcript
    if (!text) throw new Error("Couldn't transcribe that — try speaking more clearly.")

    return { text }
  })
}