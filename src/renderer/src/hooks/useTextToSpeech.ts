import { useState, useEffect, useCallback } from 'react'

export interface UseTextToSpeechOptions {
  rate?: number
  pitch?: number
  lang?: string
  preferredVoiceName?: string
}

export interface UseTextToSpeechResult {
  isSupported: boolean
  isSpeaking: boolean
  speak: (text: string, onEnd?: () => void) => void
  stop: () => void
  pause: () => void
  resume: () => void
  voices: SpeechSynthesisVoice[]
}

function cleanTextForSpeech(raw: string): string {
  return raw
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, ' [code block] ')
    .replace(/`([^`]+)`/g, '$1')
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove bold/italics
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // Remove links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove blockquotes & list markers
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    // Remove non-pronounceable decorative symbols
    .replace(/🛡️|⚡|✨|🎮|👑|🤖|💬|📸|📱|✅|❌|⚠️|🔍/gu, '')
    .trim()
}

export function useTextToSpeech({
  rate = 1.05,
  pitch = 1.0,
  lang = 'en-US',
  preferredVoiceName
}: UseTextToSpeechOptions = {}): UseTextToSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    if (!isSupported) return

    const loadVoices = (): void => {
      const avail = window.speechSynthesis.getVoices()
      if (avail.length > 0) setVoices(avail)
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    const timer = setInterval(() => {
      if (window.speechSynthesis.speaking !== isSpeaking) {
        setIsSpeaking(window.speechSynthesis.speaking)
      }
    }, 120)

    return () => {
      clearInterval(timer)
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [isSupported, isSpeaking])

  const speak = useCallback(
    (rawText: string, onEnd?: () => void) => {
      if (!isSupported) {
        onEnd?.()
        return
      }

      const text = cleanTextForSpeech(rawText)
      if (!text) {
        onEnd?.()
        return
      }

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.lang = lang

      if (voices.length > 0) {
        const pickedVoice =
          (preferredVoiceName && voices.find((v) => v.name.toLowerCase().includes(preferredVoiceName.toLowerCase()))) ||
          voices.find((v) => v.lang.startsWith(lang.slice(0, 2)) && (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('David') || v.name.includes('Zira'))) ||
          voices[0]

        if (pickedVoice) utterance.voice = pickedVoice
      }

      utterance.onstart = () => {
        setIsSpeaking(true)
      }

      utterance.onend = () => {
        setIsSpeaking(false)
        onEnd?.()
      }

      utterance.onerror = () => {
        setIsSpeaking(false)
        onEnd?.()
      }

      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [isSupported, rate, pitch, lang, preferredVoiceName, voices]
  )

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [isSupported])

  const pause = useCallback(() => {
    if (isSupported) window.speechSynthesis.pause()
  }, [isSupported])

  const resume = useCallback(() => {
    if (isSupported) window.speechSynthesis.resume()
  }, [isSupported])

  return {
    isSupported,
    isSpeaking,
    speak,
    stop,
    pause,
    resume,
    voices
  }
}

