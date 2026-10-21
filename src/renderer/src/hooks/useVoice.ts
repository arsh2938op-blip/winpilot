import { useCallback, useEffect, useRef, useState } from 'react'
import { createWebSpeechProvider } from '@renderer/lib/voice/webSpeechProvider'
import { createGoogleVoiceProvider } from '@renderer/lib/voice/googleVoiceProvider'
import type { VoiceProvider } from '@renderer/lib/voice/types'

export type VoiceProviderKind = 'browser' | 'google'

interface UseVoiceOptions {
  provider: VoiceProviderKind
  googleVoiceName?: string
  languageCode?: string
}

interface UseVoiceResult {
  supported: boolean
  listening: boolean
  voiceError: string | null
  speak: (text: string, onEnd?: () => void) => void
  stopSpeaking: () => void
  startListening: (onResult: (transcript: string) => void) => void
  stopListening: () => void
}

/**
 * Wraps whichever VoiceProvider is currently selected. Switching
 * `provider` swaps the implementation underneath without any component
 * needing to know the difference.
 */
export function useVoice({
  provider,
  googleVoiceName = 'Aoede',
  languageCode = 'en-US'
}: UseVoiceOptions): UseVoiceResult {
  const providerRef = useRef<VoiceProvider | null>(null)
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  useEffect(() => {
    providerRef.current =
      provider === 'google'
        ? createGoogleVoiceProvider(googleVoiceName, languageCode)
        : createWebSpeechProvider()
    setSupported(providerRef.current.isSupported())
    setVoiceError(null)
  }, [provider, googleVoiceName, languageCode])

  const speak = useCallback((text: string, onEnd?: () => void) => providerRef.current?.speak(text, onEnd), [])
  const stopSpeaking = useCallback(() => providerRef.current?.stopSpeaking(), [])

  const startListening = useCallback((onResult: (transcript: string) => void) => {
    if (!providerRef.current) return
    setVoiceError(null)
    setListening(true)
    providerRef.current.startListening(
      (transcript) => onResult(transcript),
      () => setListening(false),
      (message) => setVoiceError(message)
    )
  }, [])

  const stopListening = useCallback(() => {
    providerRef.current?.stopListening()
    setListening(false)
  }, [])

  return { supported, listening, voiceError, speak, stopSpeaking, startListening, stopListening }
}