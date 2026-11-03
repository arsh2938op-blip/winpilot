import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Send, CircleDot, Trash2, Check, X, Loader2, Mic, MicOff,
  Volume2, VolumeX, Zap, Pencil, Copy, RefreshCw, Cpu,
  MemoryStick, HardDrive, Gauge, Paperclip, Square,
  MessageSquare, Wrench, ShieldCheck, Download, Package,
  Clock, CheckCircle2, ChevronDown, ChevronUp, Sparkles, Flame,
  ZoomIn, ExternalLink
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ModeSwitcher } from '@renderer/components/shared/ModeSwitcher'
import { AgentModeHud } from '@renderer/components/minecraft/AgentModeHud'
import { McpServerStatusPills } from '@renderer/components/mcp/McpServerStatusPills'
import { McpExecutionCard, type McpExecutionStep } from '@renderer/components/mcp/McpExecutionCard'
import { ImageLightbox, type LightboxImage } from '@renderer/components/shared/ImageLightbox'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useSpeechRecognition } from '@renderer/hooks/useSpeechRecognition'
import { useTextToSpeech } from '@renderer/hooks/useTextToSpeech'
import { useNavStore } from '@renderer/store/useNavStore'
import { useChatModeStore } from '@renderer/store/useChatModeStore'
import { FlameIcon } from '@renderer/components/shared/FlameIcon'
import { BlackFlamePet, type PetModeState } from '@renderer/components/pet/BlackFlamePet'
import { ModelEffortMenu, type EffortChoice } from '@renderer/components/shared/ModelEffortMenu'
import {
  loadChats, saveChat, titleFromFirstMessage, getAndClearPendingOpenChat,
  onOpenChat, type StoredChat, type StoredChatMessage
} from '@renderer/lib/chatHistory'
import { formatKbps, formatUptime } from '@renderer/lib/format'
import type {
  AiStatus, AiPendingAction, SystemSnapshot, MemoryEntry, ChatModelId,
  AgentActivityEvent, DebateTurnEvent, TaskRunResult, DueMessage
} from '@shared/types'

interface Attachment { type: 'image' | 'file' | 'folder'; path: string; name: string }

interface ChatMessage extends StoredChatMessage {
  pendingAction?: AiPendingAction
  pendingResolved?: boolean
  at?: number
  tookMs?: number
  activity?: { label: string }[]
  agent?: 'flame' | 'gemini'
  promptArtifact?: { forTool: string; prompt: string }
  task?: TaskRunResult
  generatedImage?: {
    dataUri?: string
    filePath?: string
    prompt: string
    fileName?: string
  }
  images?: LightboxImage[]
  isQueued?: boolean
  queueIndex?: number
  isError?: boolean
}

const LANGUAGES = [
  { code: 'en-US', label: 'English' }, { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' }, { code: 'de-DE', label: 'German' },
  { code: 'hi-IN', label: 'Hindi' }
]
const GOOGLE_VOICES = [
  { id: 'Aoede', label: 'Aoede (bright)' }, { id: 'Kore', label: 'Kore (firm)' },
  { id: 'Puck', label: 'Puck (upbeat)' }, { id: 'Charon', label: 'Charon (deep)' }
]
function getGreetings(name: string): string[] {
  const n = name || 'Arsh'
  return [
    `Welcome, ${n}`, `Good to see you, ${n}`, `Welcome back, ${n}`,
    `Hey ${n}, what are we building today?`, `Ready when you are, ${n}`,
    `What are we cooking today, ${n}?`, `Flame is online. What's the mission?`,
    `Back again, ${n}?`, `Let's build something, ${n}.`,
    `What's today's challenge, ${n}?`, `Systems warm. Your move, ${n}.`, `Standing by, ${n}.`
  ]
}
const THINKING_WORDS = ['Pondering', 'Generating response', 'Thinking']
const THINKING_DELAY_MS = 5000

function formatTime(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ReviewActionIcon({
  icon,
  name,
  type
}: {
  icon?: string
  name?: string
  type?: string
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (icon && !failed) {
    return (
      <img
        src={icon}
        alt={name || 'app'}
        className="h-9 w-9 shrink-0 rounded-md object-contain bg-background/80 p-0.5 border border-border/40 shadow-sm"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-border/40 font-semibold text-xs uppercase shadow-sm">
      {type === 'uninstall' ? (
        <Trash2 className="h-4 w-4 text-destructive" />
      ) : type === 'update' ? (
        <RefreshCw className="h-4 w-4" />
      ) : type === 'selfHeal' ? (
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
      ) : name ? (
        name.trim().substring(0, 2)
      ) : (
        <Download className="h-4 w-4" />
      )}
    </div>
  )
}

function CodeBlock({ code, lang }: { code: string; lang?: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await window.api?.app?.copyText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border bg-background/60">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1">
        <span className="text-[10px] uppercase text-muted-foreground">{lang || 'code'}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={copy}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="overflow-x-auto p-2.5 text-xs"><code>{code}</code></pre>
    </div>
  )
}

function renderInlineImagesAndText(rawText: string, blockKey: number): React.ReactNode[] {
  const imgRegex = /!\[([\s\S]*?)\]\(([\s\S]*?)\)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = imgRegex.exec(rawText)) !== null) {
    const textBefore = rawText.substring(lastIndex, match.index)
    if (textBefore) {
      nodes.push(
        <p key={`${blockKey}-text-${lastIndex}`} className="whitespace-pre-wrap">
          {textBefore}
        </p>
      )
    }

    const alt = match[1] || 'Generated Image'
    const src = match[2]
    nodes.push(
      <div
        key={`${blockKey}-img-${match.index}`}
        className="my-3 overflow-hidden rounded-xl border border-border bg-card/80 shadow-md transition-all hover:border-primary/40"
      >
        <div className="relative group max-h-[500px] overflow-hidden bg-black/40 flex items-center justify-center">
          <img
            src={src}
            alt={alt}
            className="w-full h-auto max-h-[480px] object-contain rounded-t-xl"
            loading="lazy"
          />
          <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const a = document.createElement('a')
                a.href = src
                a.download = `flame-${Date.now()}.${src.startsWith('data:image/svg') ? 'svg' : 'jpg'}`
                a.click()
              }}
              className="flex items-center gap-1 rounded-md bg-background/90 backdrop-blur-md px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-background shadow-sm"
              title="Download generated asset"
            >
              <Download className="h-3 w-3" /> Download
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2 border-t border-border/40 bg-card">
          <span className="text-xs font-semibold text-foreground truncate max-w-[75%]">{alt}</span>
          <span className="text-[10px] uppercase font-mono font-medium tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Flame Asset
          </span>
        </div>
      </div>
    )
    lastIndex = imgRegex.lastIndex
  }

  const textAfter = rawText.substring(lastIndex)
  if (textAfter) {
    nodes.push(
      <p key={`${blockKey}-text-${lastIndex}`} className="whitespace-pre-wrap">
        {textAfter}
      </p>
    )
  }

  return nodes
}

function renderMessageBody(text: string): React.ReactNode {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g)
  const nodes: React.ReactNode[] = []
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) {
      nodes.push(...renderInlineImagesAndText(parts[i], i))
    }
    if (parts[i + 2] !== undefined) {
      nodes.push(<CodeBlock key={i + 1} lang={parts[i + 1]} code={parts[i + 2]} />)
    }
  }
  return nodes
}

interface ParsedActivity { category: string; detail: string }
function parseActivity(label: string): ParsedActivity {
  const m = label.match(/^\[(\w+)\]\s*(.*)$/)
  return m ? { category: m[1], detail: m[2] } : { category: 'Work', detail: label }
}
const META_CATEGORIES = new Set(['Flame', 'Effort'])
function groupActivity(items: { label: string }[]): { category: string; details: string[] }[] {
  const parsed = items.map((a) => parseActivity(a.label)).filter((p) => !META_CATEGORIES.has(p.category))
  const groups: { category: string; details: string[] }[] = []
  for (const p of parsed) {
    const last = groups[groups.length - 1]
    if (last && last.category === p.category) last.details.push(p.detail)
    else groups.push({ category: p.category, details: [p.detail] })
  }
  return groups
}
function ActivityTree({ groups }: { groups: { category: string; details: string[] }[] }): React.JSX.Element {
  return (
    <div className="mt-1.5 space-y-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs">
      {groups.map((g, i) => (
        <div key={i}>
          <div className="font-medium text-foreground">└─ {g.category}</div>
          {g.details.map((d, j) => <div key={j} className="ml-4 text-muted-foreground">└─ {d}</div>)}
        </div>
      ))}
    </div>
  )
}
function ThinkingBadge({
  label, activity, open, onToggle
}: { label: string | null; activity: { label: string }[]; open: boolean; onToggle: () => void }): React.JSX.Element {
  const groups = groupActivity(activity)
  const isPureConversation = groups.length === 0 || groups.every((g) => g.category === 'AI')
  return (
    <div className="max-w-[85%]">
      <div className="flex items-center gap-2.5 rounded-lg bg-secondary px-3 py-2">
        <FlameIcon size={16} active />
        {label && <span className="text-sm text-muted-foreground">{label}…</span>}
        {!isPureConversation && (
          <button onClick={onToggle} className="ml-1 text-xs text-muted-foreground hover:text-foreground">
            {open ? '▲' : '▼'}
          </button>
        )}
      </div>
      {!isPureConversation && open && <ActivityTree groups={groups} />}
    </div>
  )
}

function AttachMenu({ onAttach }: { onAttach: (a: Attachment) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const pick = async (type: Attachment['type']): Promise<void> => {
    setOpen(false)
    const path =
      type === 'image' ? await window.api?.app?.pickImage()
      : type === 'file' ? await window.api?.app?.pickAnyFile()
      : await window.api?.app?.pickAnyFolder()
    if (path) onAttach({ type, path, name: path.split(/[\\/]/).pop() || path })
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Attach" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
        <Paperclip className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-36 rounded-md border border-border bg-card p-1 shadow-fluent-lg">
          <button onClick={() => pick('image')} className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary">Image</button>
          <button onClick={() => pick('file')} className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary">File</button>
          <button onClick={() => pick('folder')} className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary">Folder</button>
        </div>
      )}
    </div>
  )
}

function extractMcpSteps(
  activities?: { label: string }[],
  fallbackTookMs?: number,
  messageText?: string
): McpExecutionStep[] {
  const steps: McpExecutionStep[] = []

  if (activities && activities.length > 0) {
    for (const act of activities) {
      const mcpMatch = act.label.match(
        /\[MCP:([a-zA-Z0-9_.-]+)\]\s*(Running tool|Completed in (\d+)ms|Failed in (\d+)ms(?::\s*(.+))?)/i
      )
      if (mcpMatch) {
        const tool = mcpMatch[1]
        const action = mcpMatch[2]
        const completedMs = mcpMatch[3] ? parseInt(mcpMatch[3], 10) : undefined
        const failedMs = mcpMatch[4] ? parseInt(mcpMatch[4], 10) : undefined
        const errorMsg = mcpMatch[5]

        let existing = steps.find((s) => s.tool === tool)
        if (!existing) {
          existing = {
            tool,
            status: 'running',
            durationMs: completedMs || failedMs || fallbackTookMs,
            output: messageText
          }
          steps.push(existing)
        }

        if (action.startsWith('Completed')) {
          existing.status = 'completed'
          existing.durationMs = completedMs || existing.durationMs
        } else if (action.startsWith('Failed')) {
          existing.status = 'error'
          existing.durationMs = failedMs || existing.durationMs
          existing.error = errorMsg
        }
      } else {
        const directMatch = act.label.match(
          /\[(computer\.[a-zA-Z0-9_-]+|browser\.[a-zA-Z0-9_-]+|fs\.[a-zA-Z0-9_-]+|os\.[a-zA-Z0-9_-]+|whatsapp\.[a-zA-Z0-9_-]+)\]/i
        )
        if (directMatch) {
          const tool = directMatch[1]
          if (!steps.some((s) => s.tool === tool)) {
            steps.push({
              tool,
              status: 'completed',
              durationMs: fallbackTookMs,
              output: messageText
            })
          }
        }
      }
    }
  }

  // Fallback check for direct tool output strings
  if (steps.length === 0 && messageText) {
    if (messageText.includes('Opened') && messageText.includes('in Windows browser')) {
      steps.push({ tool: 'browser.open_url', status: 'completed', durationMs: fallbackTookMs, output: messageText })
    } else if (messageText.includes('Cleaned %TEMP%')) {
      steps.push({ tool: 'fs.clean_temp', status: 'completed', durationMs: fallbackTookMs, output: messageText })
    } else if (messageText.includes('Archived WhatsApp Media')) {
      steps.push({ tool: 'whatsapp.get_archived_media', status: 'completed', durationMs: fallbackTookMs, output: messageText })
    }
  }

  return steps
}

export default function AIAssistant(): React.JSX.Element {
  const { newChatSignal, setActiveChatId, bumpChatsVersion } = useNavStore()
  const { mode, setMode, toggleMode } = useChatModeStore()
  const [statusBarDismissed, setStatusBarDismissed] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>(() => crypto.randomUUID())

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const queuedPromptsRef = useRef<{ id: string; text: string; attachment?: Attachment | null }[]>([])
  const [queuedCount, setQueuedCount] = useState(0)
  const [healingMessageId, setHealingMessageId] = useState<string | null>(null)
  const [showThinking, setShowThinking] = useState(false)
  const [thinkingIndex, setThinkingIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [activeLocalModel, setActiveLocalModel] = useState<string>('qwen2.5-coder:1.5b')
  const [chatModel, setChatModel] = useState<ChatModelId>('gemma')
  const [effort, setEffort] = useState<EffortChoice>('auto')
  const [attachment, setAttachment] = useState<Attachment | null>(null)

  const [voiceReplies, setVoiceReplies] = useState(false)
  const [language, setLanguage] = useState('en-US')
  const [googleVoiceName, setGoogleVoiceName] = useState('Aoede')

  const [hwSnapshot, setHwSnapshot] = useState<SystemSnapshot | null>(null)
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [debateActive, setDebateActive] = useState(false)
  const [liveActivity, setLiveActivity] = useState<{ label: string }[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(new Set())
  const [wingetProgress, setWingetProgress] = useState<Record<string, string>>({})
  const [dueMessages, setDueMessages] = useState<DueMessage[]>([])
  const [dueDrawerOpen, setDueDrawerOpen] = useState(false)
  const [gameAgentActive, setGameAgentActive] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null)

  useEffect(() => {
    let unmounted = false
    const loadDue = async (): Promise<void> => {
      try {
        if (window.api?.dueMessages?.list) {
          const list = await window.api.dueMessages.list({ status: 'pending' })
          if (!unmounted) setDueMessages(list)
        }
      } catch (err) {
        console.error('Failed to load due messages:', err)
      }
    }
    void loadDue()

    const unsub = window.api?.dueMessages?.onUpdate?.((updated) => {
      if (!unmounted) setDueMessages(updated.filter((m) => m.status === 'pending'))
    })
    return () => {
      unmounted = true
      unsub?.()
    }
  }, [])

  const completeDue = async (id: string): Promise<void> => {
    try {
      if (window.api?.dueMessages?.complete) {
        await window.api.dueMessages.complete(id)
        setDueMessages((prev) => prev.filter((m) => m.id !== id))
      }
    } catch (err) {
      console.error('Failed to complete due message:', err)
    }
  }

  const dismissDue = async (id: string): Promise<void> => {
    try {
      if (window.api?.dueMessages?.dismiss) {
        await window.api.dueMessages.dismiss(id)
        setDueMessages((prev) => prev.filter((m) => m.id !== id))
      }
    } catch (err) {
      console.error('Failed to dismiss due message:', err)
    }
  }

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Whether the transcript is currently scrolled to (near) the bottom.
  // Updated on user scroll so new messages don't yank the view down while
  // the user is reading older messages.
  const nearBottomRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRequestIdRef = useRef<string | null>(null)
  const userCollapsedActivityRef = useRef<boolean>(localStorage.getItem('flame:activity-collapsed') === 'true')
  const isFirstNewChatSignal = useRef(true)

  const [userNickname, setUserNickname] = useState('Arsh')
  const [greeting, setGreeting] = useState(() => {
    const list = getGreetings('Arsh')
    return list[Math.floor(Math.random() * list.length)]
  })

  useEffect(() => {
    if (window.api?.profile?.get) {
      window.api.profile.get().then((prof) => {
        if (prof?.nickname) {
          setUserNickname(prof.nickname)
          const list = getGreetings(prof.nickname)
          setGreeting(list[Math.floor(Math.random() * list.length)])
        }
      }).catch(() => {})
    }

    const unsub = window.api?.profile?.onUpdated?.((prof) => {
      if (prof?.nickname) {
        setUserNickname(prof.nickname)
        const list = getGreetings(prof.nickname)
        setGreeting(list[Math.floor(Math.random() * list.length)])
      }
    })
    return () => {
      unsub?.()
    }
  }, [])

  const tts = useTextToSpeech({
    lang: language,
    preferredVoiceName: googleVoiceName
  })

  const stt = useSpeechRecognition({
    lang: language,
    interimResults: true,
    onTranscriptChange: (interim, isFinal) => {
      if (!isFinal && interim) {
        setInput(interim)
      }
    },
    onFinalResult: (finalText) => {
      if (finalText.trim()) {
        setInput(finalText)
        if (gameAgentActive) {
          handleVoiceInput(finalText)
        } else {
          void send(finalText)
        }
      }
    },
    onError: (err) => {
      console.warn('[Flame STT] Error:', err)
    }
  })

  const petState: PetModeState = tts.isSpeaking
    ? 'speaking'
    : (stt.isListening || gameAgentActive)
    ? 'listening'
    : 'idle'

  const persist = useCallback((next: ChatMessage[]): void => {
    if (next.length === 0) return
    const firstUser = next.find((m) => m.role === 'user')
    const chat: StoredChat = {
      id: currentChatId,
      title: firstUser ? titleFromFirstMessage(firstUser.text) : 'New chat',
      timestamp: Date.now(),
      messages: next.map(({ id, role, text, actionSuccess, agent }) => ({ id, role, text, actionSuccess, agent }))
    }
    saveChat(chat)
    bumpChatsVersion()
  }, [currentChatId])

  const interrupt = useCallback((): void => {
    if (debateActive) {
      window.api?.ai?.stopDebate?.()
    }
    tts.stop()
    if (stt.isListening) {
      stt.stopListening()
    }
    if (sending) {
      window.api?.ai?.interrupt?.().catch(() => {})
      setSending(false)
      activeRequestIdRef.current = null
      setMessages((prev) => {
        const next: ChatMessage[] = [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            text: 'Interrupted.',
            actionSuccess: false,
            at: Date.now()
          }
        ]
        persist(next)
        return next
      })
    }
  }, [debateActive, tts, stt, sending, persist])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (editingId) {
          e.preventDefault()
          setEditingId(null)
          setEditDraft('')
          return
        }
        if (sending || debateActive || stt.isListening) {
          e.preventDefault()
          interrupt()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingId, sending, debateActive, stt.isListening, interrupt])

  const handleVoiceInput = useCallback((transcript: string): void => {
    const text = transcript.trim()
    if (!text) return
    const lower = text.toLowerCase()
    if (
      lower.includes('exit agent mode') ||
      lower.includes('stop agent mode') ||
      lower.includes('quit agent mode') ||
      lower.includes('close agent mode') ||
      lower.includes('leave agent mode') ||
      lower.includes('stop game agent') ||
      lower.includes('exit minecraft') ||
      lower.includes('stop minecraft') ||
      lower.includes('back to chat')
    ) {
      tts.speak('Exiting agent mode. Back to desktop assistant.')
      setGameAgentActive(false)
      stt.stopListening()
      return
    }
    void send(text)
  }, [tts, stt])

  useEffect(() => {
    if (!window.api?.minecraft?.onToggleAgentMode) return
    const unsub = window.api.minecraft.onToggleAgentMode(() => {
      setGameAgentActive((prev) => !prev)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (gameAgentActive) {
      window.api?.minecraft?.getStatus?.().then((st) => {
        if (st?.state === 'offline') {
          window.api?.minecraft?.start?.().catch(() => {})
        }
      }).catch(() => {})

      stt.startListening()
    } else {
      stt.stopListening()
    }
  }, [gameAgentActive, stt])

  const startNewChat = (): void => {
    if (messages.length > 0) persist(messages)
    setCurrentChatId(crypto.randomUUID())
    setMessages([])
    const list = getGreetings(userNickname)
    setGreeting(list[Math.floor(Math.random() * list.length)])
    setInput('')
    setStatusBarDismissed(false)
    nearBottomRef.current = true
  }

  useEffect(() => {
    if (isFirstNewChatSignal.current) { isFirstNewChatSignal.current = false; return }
    startNewChat()
    // Intentionally keyed on the signal alone: startNewChat closes over
    // `messages`/`currentChatId`, so depending on it would restart the chat
    // on every message instead of only when the user asks for a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newChatSignal])

  useEffect(() => { setActiveChatId(currentChatId) }, [currentChatId, setActiveChatId])

  useEffect(() => {
    const pendingId = getAndClearPendingOpenChat()
    if (pendingId) {
      const chat = loadChats().find((c) => c.id === pendingId)
      if (chat) { setCurrentChatId(chat.id); setMessages(chat.messages); nearBottomRef.current = true }
    }
  }, [])

  // Opening a conversation from the sidebar while this page is already
  // mounted used to be a no-op (nothing remounted to consume the pending
  // id). Listening for the in-page event keeps session switching reliable,
  // which also keeps the floating orb pointed at the right conversation.
  useEffect(
    () =>
      onOpenChat((id) => {
        const chat = loadChats().find((c) => c.id === id)
        if (!chat) return
        setCurrentChatId(chat.id)
        setMessages(chat.messages)
        setInput('')
        nearBottomRef.current = true
      }),
    []
  )

  useEffect(() => {
    if (!window.api?.ai) return
    window.api.ai.checkStatus().then((s) => {
      setStatus(s)
      if (s.activeModel) setActiveLocalModel(s.activeModel)
    }).catch(() => setStatus({ running: false, modelReady: false }))
    window.api.ai.getModelConfig?.().then((cfg) => {
      if (cfg?.localModel) setActiveLocalModel(cfg.localModel)
    }).catch(() => {})
    window.api.memory.list().then(setMemories).catch(() => {})
  }, [])

  useEffect(() => {
    if (!window.api?.system) return
    let cancelled = false
    const poll = (): void => { window.api.system.getSnapshot().then((s) => !cancelled && setHwSnapshot(s)).catch(() => {}) }
    poll()
    const interval = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (stt.error) setMessages((p) => [...p, { id: crypto.randomUUID(), role: 'system', text: stt.error!, at: Date.now() }])
  }, [stt.error])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'f' && e.altKey && e.ctrlKey) { e.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!sending) { setShowThinking(false); setThinkingIndex(0); return }
    const delay = setTimeout(() => setShowThinking(true), THINKING_DELAY_MS)
    const rotate = setInterval(() => setThinkingIndex((i) => (i + 1) % THINKING_WORDS.length), 1600)
    return () => { clearTimeout(delay); clearInterval(rotate) }
  }, [sending])

  useEffect(() => {
    if (!window.api?.winget?.onProgress) return
    const unsub = window.api.winget.onProgress((evt) => {
      setWingetProgress((prev) => ({ ...prev, [evt.packageId]: evt.message }))
    })
    return () => {
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!window.api?.agent) return
    return window.api.agent.onActivity((evt: AgentActivityEvent) => {
      if (evt.requestId === activeRequestIdRef.current) {
        setLiveActivity((prev) => [...prev, { label: evt.label }])
        if (!userCollapsedActivityRef.current) setActivityOpen(true)
      }
    })
  }, [])

  useEffect(() => {
    if (!window.api?.agent) return
    return window.api.agent.onDebateTurn((evt: DebateTurnEvent) => {
      setDebateActive(true)
      setMessages((prev) => {
        const lastIdx = [...prev].reverse().findIndex((m) => m.agent === evt.agent && m.text === 'Awaiting response…')
        if (evt.text === null) return [...prev, { id: crypto.randomUUID(), role: 'assistant', agent: evt.agent, text: 'Awaiting response…', at: evt.at }]
        if (lastIdx !== -1) {
          const realIdx = prev.length - 1 - lastIdx
          const next = [...prev]
          next[realIdx] = { ...next[realIdx], text: evt.text }
          return next
        }
        return [...prev, { id: crypto.randomUUID(), role: 'assistant', agent: evt.agent, text: evt.text, at: evt.at }]
      })
    })
  }, [])

  useEffect(() => {
    if (!window.api?.agent) return
    return window.api.agent.onDebateEnded((evt) => {
      setDebateActive(false)
      setMessages((prev) => {
        const next = [...prev, { id: crypto.randomUUID(), role: 'system' as const, text: evt.reason, at: Date.now() }]
        persist(next)
        return next
      })
    })
    // The debate listener is registered once on mount. `persist` closes over
    // the current chat id, which it reads at call time — depending on it here
    // would tear down and re-register the listener on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!window.api?.agent?.onStatusChange) return
    return window.api.agent.onStatusChange((evt) => {
      setStatus((prev) => (prev ? { ...prev, status: evt.status, message: evt.message } : { running: true, modelReady: true, status: evt.status, message: evt.message }))
    })
  }, [])

  useEffect(() => {
    if (!window.api?.guardian?.onHealProposal) return
    return window.api.guardian.onHealProposal((payload) => {
      const filesCount = payload.proposal.files?.length || 0
      const healMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        at: Date.now(),
        text: `🛡️ **Auto-Healing Staged a Code Repair**\n\n**Issue:** ${payload.errorMessage}\n**Hash:** \`${payload.hash}\`\n\nFlame Coder Engine analyzed the error and prepared a verified patch (${filesCount} file(s) modified). Review and click **Apply Auto-Healing Patch** to update your code.`,
        actionSuccess: true,
        pendingAction: {
          type: 'selfHeal',
          runId: payload.proposal.run_id,
          healHash: payload.hash,
          operationLabel: `Apply Auto-Healing Patch [${payload.hash}]`
        }
      }
      setMessages((prev) => {
        const next = [...prev, healMsg]
        persist(next)
        return next
      })
    })
  }, [])

  const toggleActivityPanel = (): void => {
    setActivityOpen((prev) => {
      const next = !prev
      userCollapsedActivityRef.current = !next
      localStorage.setItem('flame:activity-collapsed', String(!next))
      return next
    })
  }

  const send = async (text: string, base?: ChatMessage[]): Promise<void> => {
    const trimmed = text.trim()
    if (!attachment && !trimmed) return

    // If AI is actively working on the prior turn, queue this message as Due!
    if (sendingRef.current) {
      const queueId = crypto.randomUUID()
      const queueNum = queuedPromptsRef.current.length + 1
      const queueLabel = trimmed || (attachment ? `Look at this ${attachment.type}: ${attachment.name}` : '')
      const queuedMessage: ChatMessage = {
        id: queueId,
        role: 'user',
        text: queueLabel,
        at: Date.now(),
        isQueued: true,
        queueIndex: queueNum
      }

      setMessages((prev) => {
        const next = [...prev, queuedMessage]
        persist(next)
        return next
      })

      queuedPromptsRef.current.push({ id: queueId, text: trimmed, attachment })
      setQueuedCount(queuedPromptsRef.current.length)

      window.api?.dueMessages?.add?.({
        title: queueLabel,
        tags: ['queued', 'auto-due']
      }).catch(() => {})

      setInput('')
      setAttachment(null)
      return
    }

    if (attachment) {
      const attachedFile = attachment
      setAttachment(null)
      const history = base ?? messages
      const label = trimmed || `Look at this ${attachedFile.type}: ${attachedFile.name}`
      const userImages = attachedFile.type === 'image'
        ? [{ src: attachedFile.path, caption: attachedFile.name, filePath: attachedFile.path, fileName: attachedFile.name }]
        : undefined
      const withUser: ChatMessage[] = [
        ...history,
        { id: crypto.randomUUID(), role: 'user', text: label, at: Date.now(), images: userImages }
      ]
      setMessages(withUser); setInput(''); setSending(true)
      sendingRef.current = true
      setLiveActivity([])
      const requestId = crypto.randomUUID()
      activeRequestIdRef.current = requestId
      const started = performance.now()
      const question = trimmed || 'Describe what is shown.'
      try {
        const ext = attachedFile.path.split('.').pop()?.toLowerCase()
        let result: { success: boolean; message: string }
        if (attachedFile.type === 'image') {
          result = await window.api!.ai.inspectImage(attachedFile.path, question, requestId)
        } else if (attachedFile.type === 'folder') {
          const [listing, vision] = await Promise.all([
            window.api!.files.listDirectory(attachedFile.path),
            window.api!.ai.inspectFolderImages(attachedFile.path, question, requestId)
          ])
          result = { success: true, message: `${listing.message}\n\n--- Visual assets ---\n${vision.message}` }
        } else if (ext === 'zip') {
          result = await window.api!.ai.inspectZipImages(attachedFile.path, question, requestId)
        } else if (ext === 'pdf') {
          result = await window.api!.files.readPdfText(attachedFile.path)
        } else {
          result = await window.api!.files.readText(attachedFile.path)
        }
        const withReply: ChatMessage[] = [...withUser, {
          id: crypto.randomUUID(), role: 'assistant', text: result.message, actionSuccess: result.success,
          at: Date.now(), tookMs: Math.round(performance.now() - started),
          activity: liveActivity.length > 0 ? liveActivity : undefined
        }]
        setMessages(withReply); persist(withReply)
      } finally {
        setSending(false)
        sendingRef.current = false
        activeRequestIdRef.current = null
        if (queuedPromptsRef.current.length > 0) {
          const nextPrompt = queuedPromptsRef.current.shift()!
          setQueuedCount(queuedPromptsRef.current.length)
          setMessages((prev) =>
            prev.map((m) => (m.id === nextPrompt.id ? { ...m, isQueued: false } : m))
          )
          setTimeout(() => {
            if (nextPrompt.attachment) setAttachment(nextPrompt.attachment)
            void send(nextPrompt.text)
          }, 300)
        }
      }
      return
    }

    const isGameLaunch = /^\s*(?:come\s+to\s+minecraft|launch\s+minecraft(?:\s+bot)?|hop\s+on\s+(?:mc|minecraft)|start\s+game\s+agent|launch\s+game\s+agent|open\s+game\s+agent|join\s+minecraft)\s*$/i.test(trimmed)
    const isGameExit = /^\s*(?:exit\s+agent\s+mode|leave\s+agent\s+mode|close\s+agent\s+mode|stop\s+game\s+agent|exit\s+minecraft|stop\s+minecraft\s+bot)\s*$/i.test(trimmed)

    if (isGameLaunch) {
      setGameAgentActive(true)
    } else if (isGameExit) {
      setGameAgentActive(false)
    }

    const history = base ?? messages
    const withUser: ChatMessage[] = [...history, {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      at: Date.now()
    }]
    setMessages(withUser); setInput(''); setSending(true)
    sendingRef.current = true
    setLiveActivity([])
    const requestId = crypto.randomUUID()
    activeRequestIdRef.current = requestId
    const started = performance.now()

    try {
      const targetModel = mode === 'task' ? 'gemini' : chatModel
      const result = await window.api.ai.sendPrompt(trimmed, targetModel, requestId, effort, mode)
      const tookMs = Math.round(performance.now() - started)
      const replyImages = result.images || (result.generatedImage?.dataUri ? [{
        src: result.generatedImage.dataUri,
        caption: result.generatedImage.prompt,
        filePath: result.generatedImage.filePath,
        fileName: result.generatedImage.fileName
      }] : undefined)
      const withReply: ChatMessage[] = [...withUser, {
        id: crypto.randomUUID(), role: 'assistant', text: result.reply,
        actionSuccess: result.actionSuccess, pendingAction: result.pendingAction, at: Date.now(), tookMs,
        activity: liveActivity.length > 0 ? liveActivity : undefined,
        promptArtifact: result.promptArtifact, task: result.task,
        generatedImage: result.generatedImage,
        images: replyImages
      }]
      setMessages(withReply); persist(withReply)
      window.api.memory.list().then(setMemories).catch(() => {})
      if (voiceReplies || gameAgentActive) {
        tts.speak(result.reply, () => {
          if (gameAgentActive) {
            stt.startListening()
          }
        })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errStack = err instanceof Error ? err.stack : undefined
      window.api?.guardian?.reportError?.(errMsg, errStack, 'chatWindow').catch(() => {})
      const withError: ChatMessage[] = [...withUser, {
        id: crypto.randomUUID(), role: 'assistant', at: Date.now(),
        isError: true, actionSuccess: false,
        tookMs: Math.round(performance.now() - started),
        text: `⚠️ **Something went wrong:** ${errMsg}`
      }]
      setMessages(withError); persist(withError)
    } finally {
      setSending(false)
      sendingRef.current = false
      activeRequestIdRef.current = null
      if (queuedPromptsRef.current.length > 0) {
        const nextPrompt = queuedPromptsRef.current.shift()!
        setQueuedCount(queuedPromptsRef.current.length)
        setMessages((prev) =>
          prev.map((m) => (m.id === nextPrompt.id ? { ...m, isQueued: false } : m))
        )
        setTimeout(() => {
          if (nextPrompt.attachment) setAttachment(nextPrompt.attachment)
          void send(nextPrompt.text)
        }, 300)
      }
    }
  }

  const handleTriggerSelfHeal = async (m: ChatMessage): Promise<void> => {
    setHealingMessageId(m.id)
    try {
      const cleanError = m.text.replace(/^[⚠️\s*]+/, '').trim()
      await window.api?.guardian?.reportError?.(cleanError, undefined, 'chatBubble')
    } catch (err) {
      console.error('[Flame] Trigger self-heal failed:', err)
    } finally {
      setTimeout(() => setHealingMessageId(null), 2500)
    }
  }

  const toggleMic = (): void => {
    if (stt.isListening) {
      stt.stopListening()
      return
    }
    stt.startListening()
  }
  const resend = (id: string): void => {
    const idx = messages.findIndex((m) => m.id === id)
    if (idx === -1) return
    send(messages[idx].text, messages.slice(0, idx))
  }
  const saveEdit = (id: string): void => {
    const idx = messages.findIndex((m) => m.id === id)
    if (idx === -1 || !editDraft.trim()) return
    const draft = editDraft
    setEditingId(null); setEditDraft('')
    send(draft, messages.slice(0, idx))
  }
  const copyText = async (id: string, text: string): Promise<void> => {
    try {
      await window.api?.app?.copyText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
    } catch (err) { console.error('[Flame] Clipboard write failed:', err) }
  }

  const resolvePending = async (messageId: string, confirmed: boolean): Promise<void> => {
    const message = messages.find((m) => m.id === messageId)
    if (!message?.pendingAction) return

    if (!confirmed) {
      const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
      const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text: 'Cancelled.', at: Date.now() }]
      setMessages(next); persist(next); return
    }

    setResolvingId(messageId)
    try {
      if (message.pendingAction.type === 'fileOperation' && message.pendingAction.operationId) {
        const result = await window.api!.files.confirmOperation(message.pendingAction.operationId)
        const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
        const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text: result.message, actionSuccess: result.success, at: Date.now() }]
        setMessages(next); persist(next)
      } else if (message.pendingAction.type === 'uninstall') {
        if (!message.pendingAction.packageId) {
          const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
          const next = [...marked, {
            id: crypto.randomUUID(), role: 'assistant' as const, text: 'The uninstall request is missing its package identifier.', actionSuccess: false, at: Date.now()
          }]
          setMessages(next); persist(next)
          return
        }
        await window.api!.winget.uninstall(message.pendingAction.packageId)
        const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
        const text = `Uninstalled ${message.pendingAction.packageName ?? message.pendingAction.packageId}.`
        const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text, actionSuccess: true, at: Date.now() }]
        setMessages(next); persist(next)
        if (voiceReplies) tts.speak(text)
      } else if (message.pendingAction.type === 'install') {
        if (!message.pendingAction.packageId) {
          const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
          const next = [...marked, {
            id: crypto.randomUUID(), role: 'assistant' as const, text: 'The install request is missing its package identifier.', actionSuccess: false, at: Date.now()
          }]
          setMessages(next); persist(next)
          return
        }
        await window.api!.winget.install(message.pendingAction.packageId)
        const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
        const text = `Successfully installed ${message.pendingAction.packageName ?? message.pendingAction.packageId}.`
        const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text, actionSuccess: true, at: Date.now() }]
        setMessages(next); persist(next)
        if (voiceReplies) tts.speak(text)
      } else if (message.pendingAction.type === 'update') {
        if (!message.pendingAction.packageId) {
          const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
          const next = [...marked, {
            id: crypto.randomUUID(), role: 'assistant' as const, text: 'The update request is missing its package identifier.', actionSuccess: false, at: Date.now()
          }]
          setMessages(next); persist(next)
          return
        }
        await window.api!.winget.update(message.pendingAction.packageId)
        const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
        const text = `Successfully updated ${message.pendingAction.packageName ?? message.pendingAction.packageId}.`
        const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text, actionSuccess: true, at: Date.now() }]
        setMessages(next); persist(next)
        if (voiceReplies) tts.speak(text)
      } else if (message.pendingAction.type === 'selfHeal') {
        const healRes = await window.api!.guardian.applyHeal(message.pendingAction.runId)
        const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
        const text = healRes.success
          ? `✅ **Auto-Healing Patch Applied Successfully!**\n${healRes.message}`
          : `❌ Failed to apply healing patch: ${healRes.message}`
        const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text, actionSuccess: healRes.success, at: Date.now() }]
        setMessages(next); persist(next)
        if (voiceReplies) tts.speak(text)
      }
    } catch (err) {
      const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
      const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, at: Date.now(), actionSuccess: false, text: err instanceof Error ? err.message : String(err) }]
      setMessages(next); persist(next)
    } finally { setResolvingId(null) }
  }

  const isTask = mode === 'task'
  const statusReady = status?.running && status?.modelReady

  return (
    <div className={cn(
      "flex h-full flex-col relative transition-all duration-300",
      isTask ? "ring-1 ring-amber-500/30" : ""
    )}>
      {gameAgentActive && (
        <AgentModeHud
          listening={stt.isListening}
          onToggleListening={toggleMic}
          onExitAgentMode={() => {
            setGameAgentActive(false)
            stt.stopListening()
          }}
        />
      )}

      {messages.length > 0 && !statusBarDismissed && (
        <div className={cn(
          "sticky top-0 z-30 flex items-center justify-between border-b px-4 py-2 backdrop-blur-md shadow-sm transition-all text-xs",
          isTask
            ? "border-amber-500/40 bg-amber-950/10 shadow-[0_4px_16px_rgba(245,158,11,0.08)]"
            : "border-border/60 bg-background/85"
        )}>
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", statusReady ? (isTask ? "bg-amber-400" : "bg-emerald-400") : "bg-amber-400")} />
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", statusReady ? (isTask ? "bg-amber-500" : "bg-emerald-500") : "bg-amber-500")} />
            </span>
            <span className="font-semibold text-foreground flex items-center gap-1.5 shrink-0">
              Flame {isTask ? <span className="text-amber-400 font-bold flex items-center gap-1">Task <Wrench className="h-3 w-3 text-amber-400" /></span> : 'Active'}
            </span>

            <ModeSwitcher compact />

            <span className="text-muted-foreground hidden xl:inline">
              · {chatModel === 'gemini' ? 'Gemini 2.5' : (status?.activeModel || 'Gemma 2B')}
            </span>
          </div>

          {/* Active MCP Server Status Pills */}
          <div className="hidden sm:flex items-center px-2">
            <McpServerStatusPills />
          </div>

          <div className="flex items-center gap-3">
            {hwSnapshot && (
              <div className="hidden md:flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <Cpu className="h-3 w-3 text-primary/80" /> {hwSnapshot.cpuPercent}%
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <MemoryStick className="h-3 w-3 text-primary/80" /> {hwSnapshot.ramPercent}%
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <HardDrive className="h-3 w-3 text-primary/80" /> {hwSnapshot.diskPercent}%
                </span>
                {hwSnapshot.networkDownKbps !== undefined && (
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    ↓ {formatKbps(hwSnapshot.networkDownKbps)}
                  </span>
                )}
              </div>
            )}

            <button
              onClick={() => setStatusBarDismissed(true)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Dismiss status bar"
              aria-label="Close status bar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {dueMessages.length > 0 && (
        <div className="border-b border-border/60 bg-card/60 backdrop-blur-md px-6 py-2 transition-all">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
                <Clock className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-semibold text-foreground">
                {dueMessages.length} Due Task{dueMessages.length > 1 ? 's' : ''}
              </span>
              {!dueDrawerOpen && dueMessages[0] && (
                <span className="hidden sm:inline-block max-w-[280px] truncate text-[11px] text-muted-foreground">
                  • {dueMessages[0].title}{dueMessages[0].dueHint ? ` (${dueMessages[0].dueHint})` : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!dueDrawerOpen && dueMessages[0] && (
                <button
                  type="button"
                  onClick={() => completeDue(dueMessages[0].id)}
                  className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary/80"
                  title="Mark first task done"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Done
                </button>
              )}
              <button
                type="button"
                onClick={() => setDueDrawerOpen((v) => !v)}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {dueDrawerOpen ? 'Collapse' : 'View all'}
                {dueDrawerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {dueDrawerOpen && (
            <div className="mx-auto mt-2 max-w-3xl space-y-1.5 pt-1">
              {dueMessages.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 px-3 py-1.5 text-xs shadow-xs"
                >
                  <div className="min-w-0 pr-3">
                    <span className="font-medium text-foreground">{item.title}</span>
                    {item.dueHint && (
                      <span className="ml-2 font-mono text-[10px] text-amber-400/90">
                        due: {item.dueHint}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => completeDue(item.id)}
                      className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20"
                      title="Mark as completed"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissDue(item.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Dismiss task"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          const el = e.currentTarget
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl px-6 py-8">
          {messages.length === 0 && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
              <BlackFlamePet
                state={petState}
                size={112}
                statusText={gameAgentActive ? 'Agent Mode' : undefined}
                onToggleMic={toggleMic}
                onTriggerAgentMode={() => setGameAgentActive((prev) => !prev)}
              />
              <p className="font-display text-xl font-semibold">{greeting}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {mode === 'task'
                  ? 'Task mode: I edit the active project through OpenCode, with snapshots, AST/boundary guards, and one-word rollback.'
                  : 'I can launch, install, update and remove apps, remember things, inspect files and images, and run your Zapier actions.'}
              </p>
              {mode === 'task' && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Guarded edits · snapshot → AST check → commit or restore
                </span>
              )}

              {/* Hardware readout — values come straight from system.getSnapshot();
                  nothing is estimated. "—" means the reading isn't available yet. */}
              <div className="grid w-full max-w-md grid-cols-3 gap-2">
                {[
                  { label: 'CPU', value: hwSnapshot ? `${hwSnapshot.cpuPercent}%` : '—', pct: hwSnapshot?.cpuPercent, icon: Cpu },
                  { label: 'RAM', value: hwSnapshot ? `${hwSnapshot.ramPercent}%` : '—', pct: hwSnapshot?.ramPercent, icon: MemoryStick },
                  { label: 'Disk', value: hwSnapshot ? `${hwSnapshot.diskPercent}%` : '—', pct: hwSnapshot?.diskPercent, icon: HardDrive },
                  { label: 'GPU', value: hwSnapshot ? `${hwSnapshot.gpuPercent ?? 0}%` : '—', pct: hwSnapshot?.gpuPercent, icon: Gauge },
                  { label: 'Network', value: hwSnapshot ? `↓ ${formatKbps(hwSnapshot.networkDownKbps ?? 0)}` : '—', pct: undefined, icon: Zap },
                  { label: 'Uptime', value: hwSnapshot ? formatUptime(hwSnapshot.uptimeSeconds) : '—', pct: undefined, icon: CircleDot }
                ].map((tile) => (
                  <div key={tile.label} className="rounded-lg bg-muted/50 px-3 py-2 text-left">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      {tile.label}
                      <tile.icon className="h-3 w-3" />
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold">{tile.value}</div>
                    {typeof tile.pct === 'number' && (
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, tile.pct)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Active MCP Server Status Banner */}
              <div className="flex flex-col items-center gap-1.5 my-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  Active Model Context Protocol (MCP) Servers
                </span>
                <McpServerStatusPills />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className={cn('h-2 w-2 rounded-full', status?.running ? 'bg-emerald-400' : 'bg-muted-foreground')} />
                  Local: {activeLocalModel} ({status?.running ? 'online' : 'offline'})
                </span>
                <span>·</span>
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', statusReady ? 'bg-success' : 'bg-destructive')} />
                  {statusReady ? 'Flame ready' : status?.running ? 'Model not pulled' : 'Ollama offline'}
                </span>
                <span>·</span>
                <span>{memories.length} memories</span>
              </div>

              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setInput('open youtube')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  🌐 open youtube
                </button>
                <button
                  type="button"
                  onClick={() => setInput('explore desktop')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  📁 explore desktop
                </button>
                <button
                  type="button"
                  onClick={() => setInput('clean temporary files')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  🧹 clean temp
                </button>
                <button
                  type="button"
                  onClick={() => setInput('show me all photos and links sent on whatsapp today')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  💬 whatsapp media
                </button>
                <button
                  type="button"
                  onClick={() => setInput('osint: example.com')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  osint: example.com
                </button>
                <button
                  type="button"
                  onClick={() => setInput('osint: +919876543210')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  osint: +919876543210
                </button>
                <button
                  type="button"
                  onClick={() => setInput('osint: 8.8.8.8')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  osint: 8.8.8.8
                </button>
                <button
                  type="button"
                  onClick={() => setInput('/image cybernetic phoenix rising from neon flames')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3 text-primary" /> /image phoenix
                </button>
                <button
                  type="button"
                  onClick={() => setInput('check updates')}
                  className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3 text-cyan-400" /> check updates
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex items-end gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role !== 'user' && (
                  m.agent === 'gemini' ? (
                    <span className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <Zap className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <FlameIcon size={20} className="mb-1" />
                  )
                )}
                <div className="group max-w-[78%]">
                  {m.isQueued && (
                    <div className="mb-1.5 flex items-center justify-end gap-1.5 text-[11px] font-medium text-amber-400">
                      <Clock className="h-3 w-3 animate-pulse" />
                      <span>Due • Queued #{m.queueIndex || 1} (executes once Flame is ready)</span>
                    </div>
                  )}
                  {m.agent === 'gemini' && <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">Gemini</p>}
                  <div className={cn(
                    'relative rounded-2xl px-3.5 py-2 text-sm',
                    m.role === 'user' ? 'bg-primary text-primary-foreground'
                      : m.role === 'system' ? 'bg-muted text-muted-foreground italic'
                      : m.actionSuccess === false ? 'bg-destructive/10 text-destructive'
                      : 'bg-secondary text-secondary-foreground'
                  )}>
                    {editingId === m.id ? (
                      <div className="flex flex-col gap-2 py-1">
                        <Input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit(m.id)} className="bg-background text-foreground" autoFocus />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(m.id)}>Save &amp; resend</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditDraft('') }}>Cancel</Button>
                        </div>
                      </div>
                    ) : renderMessageBody(m.text)}

                    {/* Render Inline Images with Lightbox */}
                    {(() => {
                      const displayImages: LightboxImage[] = (m.images && m.images.length > 0)
                        ? m.images
                        : (m.generatedImage?.dataUri ? [{
                            src: m.generatedImage.dataUri,
                            caption: m.generatedImage.prompt,
                            filePath: m.generatedImage.filePath,
                            fileName: m.generatedImage.fileName
                          }] : [])

                      if (displayImages.length === 0) return null

                      return (
                        <div className="my-3 space-y-2.5">
                          {displayImages.map((img, idx) => (
                            <div
                              key={idx}
                              className="group relative max-w-[420px] overflow-hidden rounded-[12px] border border-amber-500/25 bg-black/40 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-amber-500/50 hover:shadow-[0_4px_20px_rgba(245,158,11,0.15)]"
                            >
                              <div
                                className="relative flex items-center justify-center bg-black/30 overflow-hidden cursor-zoom-in min-h-[140px] max-h-[320px]"
                                onClick={() => setLightboxImage(img)}
                              >
                                <img
                                  src={img.src}
                                  alt={img.caption || img.fileName || 'Image asset'}
                                  className="w-full h-auto max-h-[320px] object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                                  loading="lazy"
                                />

                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                  <span className="flex items-center gap-1.5 rounded-full bg-black/75 backdrop-blur-md px-3 py-1 text-xs font-medium text-amber-400 border border-amber-500/40 shadow-md">
                                    <ZoomIn className="h-3.5 w-3.5" /> Click to Zoom
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between px-3 py-2 border-t border-amber-500/20 bg-background/60 backdrop-blur-sm">
                                <span className="text-xs font-semibold text-foreground truncate max-w-[65%]" title={img.caption || img.fileName}>
                                  {img.caption || img.fileName || 'Image Preview'}
                                </span>
                                <div className="flex items-center gap-1">
                                  {img.filePath && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (img.filePath && window.api?.app?.openPath) {
                                          window.api.app.openPath(img.filePath)
                                        }
                                      }}
                                      className="flex items-center gap-1 rounded-md bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted"
                                      title="Open File in Windows"
                                    >
                                      <ExternalLink className="h-3 w-3" /> Open
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const a = document.createElement('a')
                                      a.href = img.src
                                      a.download = img.fileName || `flame-${Date.now()}.jpg`
                                      a.click()
                                    }}
                                    className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 hover:bg-amber-500/30"
                                    title="Download image"
                                  >
                                    <Download className="h-3 w-3" /> Save
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {m.role === 'assistant' && (m.actionSuccess === false || m.isError || m.text.includes('⚠️')) && !m.pendingAction && (
                      <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                          Issue detected in turn
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTriggerSelfHeal(m)}
                          disabled={healingMessageId === m.id}
                          className="h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 gap-1.5 font-medium shadow-sm"
                        >
                          {healingMessageId === m.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Diagnosing with Flame...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>🛡️ Self-Heal with Flame</span>
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {m.promptArtifact && (
                      <div className="mt-2 rounded-md border border-border bg-background/60 p-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Prompt for {m.promptArtifact.forTool}</p>
                        <CodeBlock code={m.promptArtifact.prompt} />
                      </div>
                    )}

                    {m.pendingAction && !m.pendingResolved && (
                      <div className="mt-3 rounded-lg border border-border bg-card/80 p-3 shadow-sm">
                        <div className="mb-2.5 flex items-center gap-3">
                          <ReviewActionIcon
                            icon={m.pendingAction.icon}
                            name={m.pendingAction.packageName || m.pendingAction.packageId}
                            type={m.pendingAction.type}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {m.pendingAction.packageName ?? m.pendingAction.packageId}
                            </p>
                            {m.pendingAction.packageId && (
                              <p className="text-[11px] font-mono text-muted-foreground truncate">
                                {m.pendingAction.packageId}
                              </p>
                            )}
                            {resolvingId === m.id && m.pendingAction.packageId && wingetProgress[m.pendingAction.packageId] && (
                              <p className="text-[11px] text-primary flex items-center gap-1 font-medium mt-0.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {wingetProgress[m.pendingAction.packageId]}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={m.pendingAction.type === 'uninstall' ? 'destructive' : 'default'}
                            disabled={resolvingId === m.id}
                            onClick={() => resolvePending(m.id, true)}
                          >
                            {resolvingId === m.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {m.pendingAction.type === 'uninstall'
                                  ? 'Uninstalling…'
                                  : m.pendingAction.type === 'update'
                                    ? 'Updating…'
                                    : m.pendingAction.type === 'selfHeal'
                                      ? 'Applying Fix…'
                                      : 'Installing…'}
                              </>
                            ) : (
                              <>
                                {m.pendingAction.type === 'uninstall' ? (
                                  <Trash2 className="h-3.5 w-3.5" />
                                ) : m.pendingAction.type === 'update' ? (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                ) : m.pendingAction.type === 'selfHeal' ? (
                                  <ShieldCheck className="h-3.5 w-3.5 text-white" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                {m.pendingAction.type === 'selfHeal'
                                  ? 'Apply Auto-Healing Patch'
                                  : `Confirm ${m.pendingAction.type === 'uninstall' ? 'Uninstall' : m.pendingAction.type === 'update' ? 'Update' : 'Install'}`}
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resolvingId === m.id}
                            onClick={() => resolvePending(m.id, false)}
                          >
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    {m.pendingAction && m.pendingResolved && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs opacity-70"><Check className="h-3 w-3" /> Resolved</p>
                    )}

                    {m.activity && m.activity.length > 0 && (
                      <div className="mt-1.5">
                        <button
                          onClick={() => setExpandedActivity((prev) => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                          className="text-xs opacity-70 hover:opacity-100"
                        >
                          {expandedActivity.has(m.id) ? '▲' : '▼'} Activity
                        </button>
                        {expandedActivity.has(m.id) && <ActivityTree groups={groupActivity(m.activity)} />}
                      </div>
                    )}
                  </div>

                  {m.role !== 'system' && editingId !== m.id && (
                    <div className={cn('mt-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <span>{formatTime(m.at)}</span>
                      {m.tookMs !== undefined && <span>· {(m.tookMs / 1000).toFixed(1)}s</span>}
                      {m.task && (
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium',
                            m.task.status === 'applied' || m.task.status === 'answered'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : m.task.status === 'noop'
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-destructive/10 text-destructive'
                          )}
                        >
                          {m.task.status} · {m.task.backend}
                        </span>
                      )}
                      <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => copyText(m.id, m.text)} title="Copy" className="rounded p-0.5 hover:text-foreground">
                          {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                        {m.role === 'user' && (
                          <>
                            <button onClick={() => { setEditingId(m.id); setEditDraft(m.text) }} title="Edit &amp; resend" className="rounded p-0.5 hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                            <button onClick={() => resend(m.id)} title="Resend" className="rounded p-0.5 hover:text-foreground"><RefreshCw className="h-3 w-3" /></button>
                          </>
                        )}
                        {m.role === 'assistant' && <button onClick={() => tts.speak(m.text)} title="Read aloud" className="rounded p-0.5 hover:text-foreground"><Volume2 className="h-3 w-3" /></button>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-end gap-2">
                <FlameIcon size={20} className="mb-1 opacity-0" />
                <ThinkingBadge
                  label={status?.status === 'coding' ? (status.message || 'Synthesizing new capability...') : showThinking ? THINKING_WORDS[thinkingIndex] : null}
                  activity={liveActivity}
                  open={activityOpen}
                  onToggle={toggleActivityPanel}
                />
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border/40 px-4 pb-4 pt-3">
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-2 flex items-center gap-2">
            {/* Unified window: Chat and Task live in one transcript; this
                toggle decides which pipeline a prompt is routed to. */}
            <div className="flex items-center rounded-full border border-border bg-muted/40 p-0.5">
              <button
                onClick={() => setMode('chat')}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  mode === 'chat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                title="Conversational assistant (local Ollama / Gemini)"
              >
                <MessageSquare className="h-3 w-3" /> Chat
              </button>
              <button
                onClick={() => setMode('task')}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  mode === 'task' ? 'bg-amber-500 text-black' : 'text-muted-foreground hover:text-foreground'
                )}
                title="Autonomous coding mode (AI Network + guarded edits)"
              >
                <Wrench className="h-3 w-3" /> Task
              </button>
            </div>
            <ModelEffortMenu model={chatModel} onModelChange={setChatModel} effort={effort} onEffortChange={setEffort} />
            
            {/* Active Local Model Tag Badge */}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors',
                status?.running
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-border/60 bg-muted/40 text-muted-foreground'
              )}
              title={status?.running ? `Ollama online - ${activeLocalModel}` : 'Ollama offline'}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  status?.running ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                )}
              />
              Local: {activeLocalModel}
            </span>

            {status && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] transition-colors',
                  status.status === 'coding'
                    ? 'bg-amber-500/15 text-amber-400 animate-pulse font-medium border border-amber-500/30'
                    : statusReady
                    ? 'bg-success/10 text-success'
                    : 'bg-destructive/10 text-destructive'
                )}
              >
                <CircleDot className="h-2.5 w-2.5" />
                {status.status === 'coding'
                  ? (status.message || 'Synthesizing new capability...')
                  : statusReady
                  ? 'Flame ready'
                  : status.running
                  ? 'Model not pulled'
                  : 'Ollama offline'}
              </span>
            )}
            {queuedCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
                <Clock className="h-3 w-3 animate-pulse" />
                {queuedCount} prompt{queuedCount > 1 ? 's' : ''} queued (Due next)
              </span>
            )}
            {sending && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin text-primary" /> Thinking… <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">Esc to interrupt</kbd>
              </span>
            )}
            {debateActive && (
              <Button size="sm" variant="destructive" className="ml-auto h-6 px-2 text-[11px]" onClick={() => window.api?.ai?.stopDebate()}>
                Stop debate (Esc)
              </Button>
            )}
            {attachment && (
              <span className="ml-auto flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                {attachment.name}
                <button onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">✕</button>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1.5">
            <AttachMenu onAttach={setAttachment} />
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder={mode === 'task' ? 'Describe the code change to make…' : 'Message FlameAGI (or osint: <target>)…'}
              className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={() => {
                if (input.trim()) {
                  if (!input.startsWith('/image ') && !input.startsWith('/draw ')) {
                    setInput(`/image ${input}`)
                  }
                } else {
                  setInput('/image ')
                }
                inputRef.current?.focus()
              }}
              title="Generate Image with Gemini (/image)"
              className="hidden sm:flex h-7 items-center gap-1 rounded-full bg-secondary/60 px-2 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              <span>Image</span>
            </button>
            {stt.isSupported && (
              <button
                onClick={toggleMic}
                title={stt.isListening ? 'Stop listening' : 'Speak'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  stt.isListening ? 'bg-destructive text-destructive-foreground animate-pulse' : 'text-muted-foreground hover:bg-secondary'
                )}
              >
                {stt.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => setVoiceReplies((v) => !v)}
              title={voiceReplies ? 'Voice replies on' : 'Voice replies off'}
              className={cn('flex h-8 w-8 items-center justify-center rounded-full', voiceReplies ? 'text-primary' : 'text-muted-foreground hover:bg-secondary')}
            >
              {voiceReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {sending ? (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8 rounded-full"
                  onClick={interrupt}
                  title="Interrupt Flame (Esc)"
                  aria-label="Interrupt Flame (Esc)"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
                <Button
                  size="icon"
                  className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90"
                  onClick={() => send(input)}
                  disabled={!input.trim() && !attachment}
                  title="Queue as Due message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => send(input)}
                disabled={!input.trim() && !attachment}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Image Lightbox Modal */}
      <ImageLightbox
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        image={lightboxImage}
      />
    </div>
  )
}
