import type { VoiceProvider } from './types'

/**
 * Google-backed voice provider: TTS via Gemini's TTS endpoint, STT via
 * Google Cloud Speech-to-Text — both proxied through the main process so
 * the API key stays out of renderer memory. Requires a key to already be
 * saved (see Flame AGI's settings panel); calls reject with a clear
 * message otherwise.
 *
 * TTS is chunked and strictly serialised: a new utterance cancels the one
 * playing, so two replies can never talk over each other, and long text
 * is split at sentence boundaries instead of being sent in one oversized
 * request.
 */
const MAX_CHUNK_CHARS = 220

function chunkText(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  // Split on paragraph/sentence boundaries first, then hard-wrap anything
  // still too long so a single run-on sentence is still sent.
  const sentences = trimmed.split(/(?<=[.!?])\s+|\n+/)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > MAX_CHUNK_CHARS && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
    while (current.length > MAX_CHUNK_CHARS) {
      chunks.push(current.slice(0, MAX_CHUNK_CHARS))
      current = current.slice(MAX_CHUNK_CHARS)
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function createGoogleVoiceProvider(voiceName: string, languageCode: string): VoiceProvider {
  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let currentAudio: HTMLAudioElement | null = null
  // Bumped on every new speak()/stopSpeaking() so an in-flight sequence
  // can tell it has been superseded and stop queueing more audio.
  let generation = 0
  let submitted = false

  const stopAudio = (): void => {
    if (currentAudio) {
      currentAudio.onended = null
      currentAudio.onerror = null
      currentAudio.pause()
      currentAudio = null
    }
  }

  const playChunk = (audioBase64: string, gen: number): Promise<void> =>
    new Promise((resolve) => {
      if (gen !== generation) return resolve()
      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`)
      currentAudio = audio
      const done = (): void => {
        if (currentAudio === audio) currentAudio = null
        resolve()
      }
      audio.onended = done
      audio.onerror = done
      audio.play().catch(() => done())
    })

  return {
    isSupported(): boolean {
      return !!window.api?.ai?.googleSpeak && typeof MediaRecorder !== 'undefined'
    },

    speak(text: string, onEnd?: () => void): void {
      const gen = ++generation
      stopAudio()
      const chunks = chunkText(text)
      if (chunks.length === 0) {
        onEnd?.()
        return
      }
      void (async () => {
        for (const chunk of chunks) {
          if (gen !== generation) return
          try {
            const { audioBase64 } = await window.api.ai.googleSpeak(chunk, voiceName)
            if (gen !== generation) return
            await playChunk(audioBase64, gen)
          } catch (err) {
            if (gen === generation) {
              console.error('[Flame AGI] Google TTS failed:', err)
              onEnd?.()
            }
            return
          }
        }
        if (gen === generation) onEnd?.()
      })()
    },

    stopSpeaking(): void {
      generation += 1
      stopAudio()
    },

    startListening(onResult, onEnd, onError): void {
      submitted = false
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((mic) => {
          stream = mic
          const chunks: BlobPart[] = []
          mediaRecorder = new MediaRecorder(mic, { mimeType: 'audio/webm;codecs=opus' })

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }

          mediaRecorder.onstop = async () => {
            stream?.getTracks().forEach((t) => t.stop())
            stream = null

            const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
            const base64 = await blobToBase64(blob)

            try {
              const { text } = await window.api.ai.googleTranscribe(base64, languageCode)
              // One recording → at most one result, even if stop() is hit
              // twice while transcription is in flight.
              if (!submitted) {
                submitted = true
                onResult(text)
              }
            } catch (err) {
              onError(err instanceof Error ? err.message : 'Transcription failed.')
            } finally {
              onEnd()
            }
          }

          mediaRecorder.start()
          // Auto-stop so a spoken command doesn't need a manual "stop" tap.
          setTimeout(() => {
            if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
          }, 8000)
        })
        .catch(() => {
          onError('Microphone access was denied or unavailable.')
          onEnd()
        })
    },

    stopListening(): void {
      if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
