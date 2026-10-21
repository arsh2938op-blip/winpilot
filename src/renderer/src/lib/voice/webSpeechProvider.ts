import type { VoiceProvider } from './types'

/** One final transcript inside a SpeechRecognition result list. */
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string
}

/** The result list for a single recognition event (index 0 = newest). */
interface SpeechRecognitionResultLike {
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  readonly results: {
    readonly length: number
    readonly [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Base voice provider using the browser's built-in Web Speech API.
 *
 * TTS (speak): works reliably — Chromium's speechSynthesis uses your
 * OS's own installed voices, no network/API key required.
 *
 * STT (startListening): Chrome's SpeechRecognition normally routes audio
 * to Google's speech servers using a private API key baked into Chrome
 * itself. Electron does NOT include that key, so this frequently fails
 * with a generic "network" error here — that's an Electron platform
 * limitation, not a bug in this code. We surface that clearly via
 * onError rather than failing silently. Swapping to Gemini STT later
 * means writing a GeminiVoiceProvider with the same interface and
 * nothing else in the app needs to change.
 */
export function createWebSpeechProvider(): VoiceProvider {
  let recognition: SpeechRecognitionLike | null = null

  return {
    isSupported(): boolean {
      return getRecognitionConstructor() !== null && 'speechSynthesis' in window
    },

    speak(text: string, onEnd?: () => void): void {
      if (!('speechSynthesis' in window)) {
        onEnd?.()
        return
      }
      window.speechSynthesis.cancel() // don't let utterances overlap
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1
      utterance.pitch = 1
      utterance.onend = () => onEnd?.()
      utterance.onerror = () => onEnd?.()
      window.speechSynthesis.speak(utterance)
    },

    stopSpeaking(): void {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },

    startListening(onResult, onEnd, onError): void {
      const Recognition = getRecognitionConstructor()
      if (!Recognition) {
        onError('Voice input is not supported in this app.')
        return
      }

      recognition = new Recognition()
      recognition.lang = 'en-US'
      recognition.continuous = false
      recognition.interimResults = false

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        const transcript = event.results?.[0]?.[0]?.transcript
        if (transcript) onResult(transcript)
      }

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        const code = event?.error
        const message =
          code === 'network'
            ? "Voice input needs a speech service Electron doesn't include by default — this is a known limitation, not a bug. Text chat still works, and real voice input arrives with the Gemini integration."
            : `Voice input error: ${code || 'unknown'}.`
        onError(message)
        onEnd()
      }

      recognition.onend = () => {
        onEnd()
      }

      recognition.start()
    },

    stopListening(): void {
      recognition?.stop()
      recognition = null
    }
  }
}