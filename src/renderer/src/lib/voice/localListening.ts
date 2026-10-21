/**
 * Always Listening — a real, local voice-activity detector.
 *
 * Speech *detection* happens on the device: the microphone stream is
 * analysed with the Web Audio API and only an utterance that crosses an
 * energy threshold is captured. The captured clip is then transcribed by
 * whichever provider is configured — Google's Speech-to-Text when a key
 * is saved (audio leaves the machine), or Chromium's built-in recogniser
 * otherwise. Nothing "pretends" to listen: if neither is available the
 * listener reports an error instead of staying quietly active.
 */

export type LocalListenerState = 'idle' | 'listening' | 'speech' | 'error'

export interface LocalListenerOptions {
  languageCode: string
  hasGoogleKey: boolean
  onTranscript: (text: string) => void
  onStateChange: (state: LocalListenerState) => void
  onError: (message: string) => void
}

export interface LocalListener {
  start: () => void
  stop: () => void
  /** Pause capture (e.g. while the orb is speaking) without giving up the mic. */
  suspend: (suspended: boolean) => void
}

// Tunables for the on-device detector. Deliberately conservative so a
// quiet room does not trigger recordings.
const SPEECH_RMS = 0.045
const START_FRAMES = 4
const SILENCE_MS = 1100
const MIN_SPEECH_MS = 350
const MAX_UTTERANCE_MS = 12_000

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function createLocalListener(options: LocalListenerOptions): LocalListener {
  let started = false
  let suspended = false
  let stream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let recorder: MediaRecorder | null = null
  let chunks: BlobPart[] = []
  let rafId: number | null = null
  let recognition: SpeechRecognitionLike | null = null

  let speechFrames = 0
  let utteranceStart = 0
  let lastSpeechAt = 0
  let recording = false

  const setState = (state: LocalListenerState): void => options.onStateChange(state)

  const cleanupAudio = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    void audioContext?.close().catch(() => undefined)
    audioContext = null
    analyser = null
    recorder = null
    recording = false
    speechFrames = 0
  }

  const finishUtterance = (): void => {
    if (recorder && recorder.state === 'recording') recorder.stop()
  }

  const tick = (): void => {
    rafId = requestAnimationFrame(tick)
    if (!analyser || !started) return
    if (suspended) {
      if (recording) finishUtterance()
      speechFrames = 0
      return
    }

    const buffer = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(buffer)
    let sum = 0
    for (let i = 0; i < buffer.length; i += 1) {
      const centred = (buffer[i] - 128) / 128
      sum += centred * centred
    }
    const rms = Math.sqrt(sum / buffer.length)
    const now = Date.now()

    if (rms >= SPEECH_RMS) {
      speechFrames += 1
      lastSpeechAt = now
      if (!recording && speechFrames >= START_FRAMES) {
        recording = true
        utteranceStart = now
        chunks = []
        try {
          recorder = new MediaRecorder(stream!, { mimeType: 'audio/webm;codecs=opus' })
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }
          recorder.onstop = () => {
            const duration = Date.now() - utteranceStart
            recording = false
            setState('listening')
            if (duration >= MIN_SPEECH_MS && chunks.length > 0) {
              void transcribe(new Blob(chunks, { type: 'audio/webm;codecs=opus' }))
            }
          }
          recorder.start()
          setState('speech')
        } catch {
          recording = false
          options.onError('Could not start recording from the microphone.')
        }
      }
    } else if (recording) {
      if (now - lastSpeechAt >= SILENCE_MS) finishUtterance()
      else if (now - utteranceStart >= MAX_UTTERANCE_MS) finishUtterance()
    } else {
      speechFrames = 0
    }
  }

  const transcribe = async (blob: Blob): Promise<void> => {
    try {
      const base64 = await blobToBase64(blob)
      const { text } = await window.api.ai.googleTranscribe(base64, options.languageCode)
      if (text.trim()) options.onTranscript(text.trim())
    } catch (err) {
      options.onError(err instanceof Error ? err.message : 'Transcription failed.')
    }
  }

  const startGoogleVad = async (): Promise<void> => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      options.onError('Microphone access was denied or unavailable.')
      setState('error')
      return
    }
    if (!started) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContext = new Ctor()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    setState('listening')
    rafId = requestAnimationFrame(tick)
  }

  const startBrowserRecognition = (): void => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      options.onError('Voice input is not supported in this app.')
      setState('error')
      return
    }
    const create = (): void => {
      recognition = new Ctor()
      recognition.lang = options.languageCode
      recognition.continuous = true
      recognition.interimResults = false
      recognition.onresult = (event) => {
        const results = event.results
        const last = results && results[results.length - 1]
        const transcript = last && last[0] && last[0].transcript
        if (transcript && !suspended) options.onTranscript(transcript.trim())
      }
      recognition.onerror = (event) => {
        if (event?.error === 'no-speech' || event?.error === 'aborted') return
        options.onError(
          event?.error === 'network'
            ? "Always Listening needs the Google speech service, which Electron doesn't include by default. Add a Google API key to use it."
            : `Always Listening error: ${event?.error || 'unknown'}.`
        )
        setState('error')
      }
      recognition.onend = () => {
        // Chromium ends recognition on silence; restart while still enabled.
        if (started && !suspended) {
          try {
            recognition?.start()
          } catch {
            /* already starting */
          }
        }
      }
      try {
        recognition.start()
        setState('listening')
      } catch {
        /* ignore double-start */
      }
    }
    create()
  }

  return {
    start(): void {
      if (started) return
      started = true
      suspended = false
      if (options.hasGoogleKey) void startGoogleVad()
      else startBrowserRecognition()
    },
    stop(): void {
      started = false
      suspended = false
      setState('idle')
      if (recognition) {
        recognition.onend = null
        try {
          recognition.stop()
        } catch {
          /* ignore */
        }
        recognition = null
      }
      cleanupAudio()
      // No tracks are retained after this point — capture truly stops.
    },
    suspend(value: boolean): void {
      suspended = value
      if (value) {
        if (recording) finishUtterance()
        if (recognition) {
          try {
            recognition.stop()
          } catch {
            /* ignore */
          }
        }
      } else if (started && !options.hasGoogleKey && !recognition) {
        startBrowserRecognition()
      } else if (started && options.hasGoogleKey && !stream) {
        void startGoogleVad()
      }
    }
  }
}
