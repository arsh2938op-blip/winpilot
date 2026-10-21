import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Loader2, Mic, MicOff, Minus, Plus, Send, Square, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useTheme } from '@renderer/hooks/useTheme'
import { useVoice } from '@renderer/hooks/useVoice'
import { createLocalListener, type LocalListener, type LocalListenerState } from '@renderer/lib/voice/localListening'
import { CodeBlock } from '@renderer/components/shared/CodeBlock'
import { FlamePet } from '@renderer/components/shared/FlamePet'
import {
  loadChats,
  saveChat,
  titleFromFirstMessage
} from '@renderer/lib/chatHistory'
import type { AiStatus, ChatModelId, OrbAccent, OrbChatMessage } from '@shared/types'

/**
 * The floating orb renderer surface.
 *
 * The orb is its own surface, not a view of the main window's chat. It
 * owns a transcript of its own (persisted alongside the app's other chats)
 * and talks to the very same main-process AI service, provider keys and
 * persistent memory as the main window. Nothing here depends on the main
 * window being mounted, so the companion keeps working — and recovers
 * cleanly — while the full app is closed or reloading.
 */

/** A drag below this total movement counts as a click, not a drag. */
const CLICK_SLOP_PX = 4

const MODEL_KEY = 'flame-agi:orb-model'
const TTS_KEY = 'flame-agi:orb-tts'
const CHAT_KEY = 'flame-agi:orb-active-chat'
const LANGUAGE = 'en-US'

const MODELS: { id: ChatModelId; label: string }[] = [
  { id: 'gemma', label: 'Gemma (local)' },
  { id: 'gemini', label: 'Gemini' }
]

type OrbState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

const STATE_LABEL: Record<OrbState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
  error: 'Error'
}

/** What the pet says when it has noticed the user has gone quiet. Rotated
 *  locally — this is a check-in, not an AI call, so it must never cost
 *  tokens or hit the network. */
const NUDGES = [
  'Still there?',
  'Just checking in.',
  'Take a break whenever you need one.',
  'I will be right here.',
  'Picking anything up?'
]

const NUDGE_MS = 9000

export function OrbApp(): React.JSX.Element {
  useTheme()

  const [accent, setAccent] = useState<OrbAccent>('blue')
  const [alwaysListening, setAlwaysListening] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [micState, setMicState] = useState<LocalListenerState>('idle')
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [hasGoogleKey, setHasGoogleKey] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  // The main process watches system idle time and pings us after a minute;
  // we own what the pet actually says.
  useEffect(() => {
    const off = window.api?.orb?.onProactive?.(() => {
      setNudge(NUDGES[Math.floor(Math.random() * NUDGES.length)])
    })
    return () => off?.()
  }, [])

  useEffect(() => {
    if (!nudge) return
    const t = setTimeout(() => setNudge(null), NUDGE_MS)
    return () => clearTimeout(t)
  }, [nudge])

  const [model, setModel] = useState<ChatModelId>(() =>
    localStorage.getItem(MODEL_KEY) === 'gemini' ? 'gemini' : 'gemma'
  )
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem(TTS_KEY) === 'true')

  const [chatId, setChatId] = useState<string>(() => {
    const existing = localStorage.getItem(CHAT_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(CHAT_KEY, id)
    return id
  })
  const [messages, setMessages] = useState<OrbChatMessage[]>(() => {
    const id = localStorage.getItem(CHAT_KEY)
    if (!id) return []
    const chat = loadChats().find((c) => c.id === id)
    return chat ? chat.messages.map((m) => ({ ...m })) : []
  })

  const drag = useRef<{ id: number; lastX: number; lastY: number; moved: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const listenerRef = useRef<LocalListener | null>(null)

  const voiceProvider = hasGoogleKey ? 'google' : 'browser'
  const {
    supported: voiceSupported,
    listening,
    speak,
    stopSpeaking,
    startListening,
    stopListening
  } = useVoice({ provider: voiceProvider, googleVoiceName: 'Aoede', languageCode: LANGUAGE })

  // Latest-value refs so the (stable) send callback registered with the
  // always-listening listener never reads stale state.
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const busyRef = useRef(busy)
  busyRef.current = busy
  const modelRef = useRef(model)
  modelRef.current = model
  const ttsRef = useRef(ttsEnabled)
  ttsRef.current = ttsEnabled

  const speakReply = useCallback(
    (text: string): void => {
      setSpeaking(true)
      speak(text, () => setSpeaking(false))
    },
    [speak]
  )

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim()
      if (!trimmed || busyRef.current) return
      const withUser: OrbChatMessage[] = [
        ...messagesRef.current,
        { id: crypto.randomUUID(), role: 'user', text: trimmed, at: Date.now() }
      ]
      setMessages(withUser)
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        const res = await window.api.ai.sendPrompt(trimmed, modelRef.current, crypto.randomUUID(), 'auto')
        setMessages([
          ...withUser,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: res.reply,
            actionSuccess: res.actionSuccess,
            at: Date.now()
          }
        ])
        if (ttsRef.current && res.reply) speakReply(res.reply)
      } catch (err) {
        setMessages([
          ...withUser,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: err instanceof Error ? `Something went wrong: ${err.message}` : "Couldn't reach the AI.",
            actionSuccess: false,
            at: Date.now()
          }
        ])
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [speakReply]
  )
  const sendRef = useRef(send)
  sendRef.current = send

  // --- session sync ------------------------------------------------------
  useEffect(() => {
    const api = window.api?.orb
    if (!api) return
    void api
      .getState()
      .then((state) => {
        setAccent(state.accent)
        setAlwaysListening(state.alwaysListening)
      })
      .catch(() => {})
    return api.onPrefsChange(({ accent: a, alwaysListening: l }) => {
      setAccent(a)
      setAlwaysListening(l)
    })
  }, [])

  useEffect(() => {
    const api = window.api?.ai
    if (!api) return
    let cancelled = false
    void api.hasGoogleApiKey().then((has) => !cancelled && setHasGoogleKey(has)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // The orb shows the local model's status only when Gemma is selected;
  // Gemini is governed by whether a key is configured at all.
  useEffect(() => {
    if (model !== 'gemma') return
    const api = window.api?.ai
    if (!api) return
    let cancelled = false
    const poll = (): void => {
      api
        .checkStatus()
        .then((s) => !cancelled && setStatus(s))
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [model])

  // Persist to the shared chat history so a renderer reload (or the main
  // window's history list) still sees this conversation.
  useEffect(() => {
    if (messages.length === 0) return
    const firstUser = messages.find((m) => m.role === 'user')
    saveChat({
      id: chatId,
      title: titleFromFirstMessage(firstUser?.text ?? 'New chat'),
      timestamp: Date.now(),
      messages: messages.map(({ id, role, text, actionSuccess }) => ({ id, role, text, actionSuccess }))
    })
  }, [messages, chatId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // --- panel window sizing (native, in the main process) ----------------
  const setPanelOpen = useCallback((next: boolean): void => {
    setOpen(next)
    setError(null)
    setModelOpen(false)
    void window.api?.orb?.setPanelOpen(next)
    if (next) window.setTimeout(() => inputRef.current?.focus(), 60)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setPanelOpen])

  // A renderer reload must not leave the window stuck at panel size.
  useEffect(() => {
    setPanelOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- always listening (local VAD) -------------------------------------
  useEffect(() => {
    const listener = createLocalListener({
      languageCode: LANGUAGE,
      hasGoogleKey,
      onTranscript: (text) => {
        setDraft(text)
        void sendRef.current(text)
      },
      onStateChange: setMicState,
      onError: (message) => {
        setError(message)
        setMicState('error')
      }
    })
    listenerRef.current = listener
    if (alwaysListening) listener.start()
    return () => {
      listener.stop()
      listenerRef.current = null
    }
  }, [alwaysListening, hasGoogleKey])

  // Never let the orb transcribe its own voice, or capture while thinking.
  useEffect(() => {
    listenerRef.current?.suspend(speaking || busy)
  }, [speaking, busy])

  // --- dragging ----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    if (open) return
    drag.current = { id: e.pointerId, lastX: e.screenX, lastY: e.screenY, moved: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.screenX - d.lastX
    const dy = e.screenY - d.lastY
    d.lastX = e.screenX
    d.lastY = e.screenY
    d.moved += Math.abs(dx) + Math.abs(dy)
    if (dx || dy) void window.api?.orb?.moveBy(dx, dy)
  }
  const onPointerUp = (_e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved <= CLICK_SLOP_PX) setPanelOpen(true)
    void window.api?.orb?.dragEnd()
  }

  // --- actions -----------------------------------------------------------
  const submit = (): void => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void send(text)
  }

  const chooseModel = (id: ChatModelId): void => {
    setModel(id)
    localStorage.setItem(MODEL_KEY, id)
    setModelOpen(false)
  }

  const toggleMic = (): void => {
    if (listening) {
      stopListening()
      return
    }
    setError(null)
    startListening((transcript) => {
      if (transcript.trim()) {
        setDraft(transcript)
        void send(transcript)
      }
    })
  }

  const toggleSpeaker = (): void => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setTtsEnabled((v) => {
      const next = !v
      localStorage.setItem(TTS_KEY, String(next))
      return next
    })
  }

  const startNewChat = (): void => {
    stopSpeaking()
    setSpeaking(false)
    const id = crypto.randomUUID()
    localStorage.setItem(CHAT_KEY, id)
    setChatId(id)
    setMessages([])
    setDraft('')
    setError(null)
  }

  const orbState: OrbState =
    error || micState === 'error'
      ? 'error'
      : speaking
        ? 'speaking'
        : busy
          ? 'processing'
          : listening || (alwaysListening && micState !== 'idle')
            ? 'listening'
            : 'idle'
  const stateLabel = STATE_LABEL[orbState]

  const statusLabel = useMemo(() => {
    if (model === 'gemini') return hasGoogleKey ? 'Gemini ready' : 'Gemini — add a key'
    if (!status) return 'Connecting'
    if (!status.running) return 'Ollama offline'
    return status.modelReady ? 'Ready' : 'Model not pulled'
  }, [model, hasGoogleKey, status])

  const voiceAvailable = voiceSupported || hasGoogleKey

  // --- collapsed orb -----------------------------------------------------
  if (!open) {
    return (
      <div className="pet-root flex h-full w-full flex-col items-center justify-center" data-accent={accent}>
        <button
          type="button"
          aria-label={`FlameAGI companion — ${stateLabel}. Drag to move, click to open.`}
          title={`FlameAGI — ${stateLabel}. Drag to move, click to open.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          className={cn(
            'relative flex h-[120px] w-[120px] items-center justify-center rounded-full outline-none',
            'transition-transform duration-150 ease-out',
            hovered && 'scale-105'
          )}
        >
          <span className="pet-halo" />
          <div className={cn('pet-stage', `pet-state-${orbState}`)}>
            <FlamePet className="pet-svg" talking={speaking || orbState === 'processing'} />
          </div>
        </button>
        {/* Idle check-in. Sits between the pet and the mic so it never
            pushes the button around. */}
        <p
          className={cn(
            'mt-1 h-4 max-w-[140px] px-1 text-center text-[10px] leading-4 text-white',
            'transition-opacity duration-300',
            nudge ? 'opacity-100' : 'opacity-0'
          )}
        >
          {nudge ?? ''}
        </p>
        {/* Push-to-talk, so the pet can be talked to without opening the panel. */}
        <button
          type="button"
          onClick={toggleMic}
          aria-pressed={listening}
          aria-label={listening ? 'Stop talking to Flame' : 'Talk to Flame'}
          title={listening ? 'Listening…' : 'Talk to Flame'}
          className={cn(
            'mt-1 flex h-10 w-10 items-center justify-center rounded-full transition-colors',
            listening
              ? 'bg-white/25 text-white ring-1 ring-inset ring-white/70'
              : 'bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20'
          )}
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      </div>
    )
  }

  // --- quick panel -------------------------------------------------------
  return (
    <div
      className="pet-root flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0d0f]/95 text-white shadow-2xl backdrop-blur-md"
      data-accent={accent}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-2.5">
        <div className={cn('pet-stage pet-stage--sm', `pet-state-${orbState}`)}>
          <FlamePet compact className="pet-svg" talking={speaking || orbState === 'processing'} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-tight">FlameAGI</p>
          <p className="truncate text-[10px] leading-tight text-white">{statusLabel}</p>
        </div>
        <span
          role="status"
          aria-live="polite"
          className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white"
        >
          {stateLabel}
        </span>
        <button
          type="button"
          onClick={startNewChat}
          title="New conversation"
          aria-label="Start a new conversation"
          className="rounded-md p-1.5 text-white transition-colors hover:bg-white/10"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void window.api?.orb?.openMain()}
          title="Open the full app"
          aria-label="Open the full FlameAGI window"
          className="rounded-md p-1.5 text-white transition-colors hover:bg-white/10"
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          title="Collapse to the orb"
          aria-label="Collapse to the orb"
          className="rounded-md p-1.5 text-white transition-colors hover:bg-white/10"
        >
          <Minus className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} data-selectable className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-xs text-white">
            This is the companion&apos;s own conversation. It shares FlameAGI&apos;s memory and AI
            with the full app.
          </p>
        )}
        {messages.map((m) => (
          <OrbBubble key={m.id} message={m} />
        ))}
        {busy && (
          <p className="flex items-center gap-1.5 text-[11px] text-white">
            <Loader2 className="h-3 w-3 animate-spin" /> Flame is working…
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="shrink-0 border-t border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] text-white"
        >
          {error}
        </p>
      )}

      <div className="shrink-0 border-t border-white/10 px-2 pt-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div ref={modelMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={modelOpen}
              aria-label={`Model: ${model === 'gemini' ? 'Gemini' : 'Gemma'}`}
              className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white transition-colors hover:bg-white/10"
            >
              {model === 'gemini' ? 'Gemini' : 'Gemma'}
              <ChevronDown className="h-3 w-3" />
            </button>
            {modelOpen && (
              <div
                role="listbox"
                className="absolute bottom-full left-0 z-50 mb-1 w-40 rounded-md border border-white/10 bg-[#12151a] p-1 shadow-xl"
              >
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    role="option"
                    aria-selected={model === m.id}
                    onClick={() => chooseModel(m.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-white/10',
                      model === m.id && 'bg-white/10'
                    )}
                  >
                    {m.label}
                    {model === m.id && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] text-white">
            {alwaysListening ? 'Always Listening on' : 'Memory shared with the app'}
          </span>
        </div>

        <form
          className="flex items-end gap-1.5 pb-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {voiceAvailable && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : 'Speak to Flame'}
              title={listening ? 'Stop listening' : 'Speak'}
              className={cn(
                'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg transition-colors',
                listening
                  ? 'bg-white/25 text-white ring-1 ring-inset ring-white/70'
                  : 'text-white hover:bg-white/10'
              )}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={toggleSpeaker}
            aria-pressed={ttsEnabled}
            aria-label={speaking ? 'Stop speaking' : ttsEnabled ? 'Turn voice replies off' : 'Turn voice replies on'}
            title={speaking ? 'Stop speaking' : ttsEnabled ? 'Voice replies on' : 'Voice replies off'}
            className={cn(
              'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg transition-colors',
              speaking
                ? 'bg-white/25 text-white ring-1 ring-inset ring-white/70'
                : ttsEnabled
                  ? 'text-white'
                  : 'text-white hover:bg-white/10'
            )}
          >
            {speaking ? <Square className="h-3.5 w-3.5" /> : ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={busy}
            placeholder={busy ? 'Flame is working…' : 'Message Flame…'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter makes a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            className="max-h-24 min-h-[34px] w-full flex-1 resize-none rounded-lg bg-white/5 px-2.5 py-2 text-sm text-white placeholder:text-white focus:outline-none focus:ring-1 focus:ring-white/25 disabled:bg-white/[0.02]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label="Send to Flame"
            title="Send"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-white/25 text-white ring-1 ring-inset ring-white/60 transition-colors hover:bg-white/35 disabled:bg-white/10 disabled:ring-white/20"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

function OrbBubble({ message }: { message: OrbChatMessage }): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <p className="ml-8 whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-white/12 px-2.5 py-1.5 text-[13px] leading-snug">
        {message.text}
      </p>
    )
  }
  return (
    <div className="mr-6">
      <p
        className={cn(
          'whitespace-pre-wrap break-words rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[13px] leading-snug',
          message.role === 'system'
            ? 'italic text-white'
            : message.actionSuccess === false
              ? 'bg-amber-400/10 text-white'
              : 'bg-white/[0.06] text-white'
        )}
      >
        {renderCompact(message.text)}
      </p>
    </div>
  )
}

/** Same markdown-ish handling as the main chat, minus the rich extras the
 *  quick panel has no room for. */
function renderCompact(text: string): React.ReactNode {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g)
  const nodes: React.ReactNode[] = []
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) nodes.push(<span key={`t${i}`}>{parts[i]}</span>)
    if (parts[i + 2] !== undefined) {
      nodes.push(<CodeBlock key={`c${i}`} lang={parts[i + 1]} code={parts[i + 2]} />)
    }
  }
  return nodes
}
