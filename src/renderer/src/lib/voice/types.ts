/**
 * A VoiceProvider is anything that can turn text into speech and speech
 * into text. The base implementation uses the browser's built-in Web
 * Speech API (free, no key, but STT has real limitations in Electron —
 * see webSpeechProvider.ts). A future GeminiVoiceProvider implementing
 * this exact same interface can be swapped in later without touching
 * any component that uses useVoice().
 */
export interface VoiceProvider {
  isSupported(): boolean
  /** Speaks `text`; `onEnd` fires once playback finishes *or* is stopped. */
  speak(text: string, onEnd?: () => void): void
  stopSpeaking(): void
  startListening(
    onResult: (transcript: string) => void,
    onEnd: () => void,
    onError: (message: string) => void
  ): void
  stopListening(): void
}