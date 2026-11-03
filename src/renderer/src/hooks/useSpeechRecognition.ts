import { useState, useEffect, useRef, useCallback } from 'react'

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: {
    readonly length: number
    readonly [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface UseSpeechRecognitionOptions {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
  onTranscriptChange?: (interim: string, isFinal: boolean) => void
  onFinalResult?: (finalText: string) => void
  onError?: (error: string) => void
}

export interface UseSpeechRecognitionResult {
  isSupported: boolean
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
}

export function useSpeechRecognition({
  lang = 'en-US',
  continuous = false,
  interimResults = true,
  onTranscriptChange,
  onFinalResult,
  onError
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const isSupported = typeof window !== 'undefined' && getRecognitionConstructor() !== null

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterimTranscript('')
  }, [])

  const startListening = useCallback(() => {
    const Recognition = getRecognitionConstructor()
    if (!Recognition) {
      const msg = 'Speech recognition is not supported in this browser environment.'
      setError(msg)
      onError?.(msg)
      return
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // ignore
      }
    }

    try {
      const instance = new Recognition()
      instance.lang = lang
      instance.continuous = continuous
      instance.interimResults = interimResults

      instance.onresult = (event: SpeechRecognitionEventLike) => {
        let currentInterim = ''
        let currentFinal = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i]
          const piece = item[0]?.transcript || ''
          if (item.isFinal) {
            currentFinal += piece
          } else {
            currentInterim += piece
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim)
          onTranscriptChange?.(currentInterim, false)
        }

        if (currentFinal) {
          const trimmed = currentFinal.trim()
          setTranscript((prev) => (prev ? `${prev} ${trimmed}` : trimmed))
          setInterimTranscript('')
          onTranscriptChange?.(trimmed, true)
          onFinalResult?.(trimmed)
        }
      }

      instance.onerror = (event: SpeechRecognitionErrorEventLike) => {
        const errCode = event.error || 'unknown'
        if (errCode === 'no-speech') {
          return
        }
        const message =
          errCode === 'not-allowed'
            ? 'Microphone permission denied.'
            : errCode === 'network'
              ? 'Speech recognition service is currently unavailable.'
              : `Speech recognition error: ${errCode}`
        setError(message)
        onError?.(message)
        setIsListening(false)
      }

      instance.onend = () => {
        setIsListening(false)
        setInterimTranscript('')
      }

      recognitionRef.current = instance
      setError(null)
      setIsListening(true)
      instance.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      onError?.(msg)
      setIsListening(false)
    }
  }, [lang, continuous, interimResults, onTranscriptChange, onFinalResult, onError])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
  }, [])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    }
  }, [])

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript
  }
}

