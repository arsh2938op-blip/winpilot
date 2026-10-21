import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Send, CircleDot, AlertCircle, Trash2, Check, X, Loader2, Mic, MicOff,
  Volume2, VolumeX, Zap, Pencil, Copy, RefreshCw, BrainCircuit, Cpu,
  MemoryStick, HardDrive, Gauge, Settings2, Paperclip
} from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { useVoice, type VoiceProviderKind } from '@renderer/hooks/useVoice'
import { useNavStore } from '@renderer/store/useNavStore'
import { FlameIcon } from '@renderer/components/shared/FlameIcon'
import { ModelEffortMenu, type EffortChoice } from '@renderer/components/shared/ModelEffortMenu'
import {
  loadChats, saveChat, titleFromFirstMessage, getAndClearPendingOpenChat,
  onOpenChat, type StoredChat, type StoredChatMessage
} from '@renderer/lib/chatHistory'
import { formatKbps, formatUptime } from '@renderer/lib/format'
import type {
  AiStatus, AiPendingAction, SystemSnapshot, MemoryEntry, ChatModelId,
  AgentActivityEvent, DebateTurnEvent
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
const GREETINGS = [
  'Welcome, Arsh', 'Good to see you, Arsh', 'Welcome back, Arsh',
  'Hey Arsh, what are we building today?', 'Ready when you are, Arsh',
  'What are we cooking today, Arsh?', "Flame is online. What's the mission?",
  'Back again, Arsh?', "Let's build something, Arsh.",
  "What's today's challenge, Arsh?", 'Systems warm. Your move, Arsh.', 'Standing by, Arsh.'
]
const THINKING_WORDS = ['Pondering', 'Generating response', 'Thinking']
const THINKING_DELAY_MS = 5000

function formatTime(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
function renderMessageBody(text: string): React.ReactNode {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g)
  const nodes: React.ReactNode[] = []
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) nodes.push(<p key={i} className="whitespace-pre-wrap">{parts[i]}</p>)
    if (parts[i + 2] !== undefined) nodes.push(<CodeBlock key={i + 1} lang={parts[i + 1]} code={parts[i + 2]} />)
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

export default function AIAssistant(): React.JSX.Element {
  const { newChatSignal, setActiveChatId, bumpChatsVersion } = useNavStore()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>(() => crypto.randomUUID())
  const [showSettings, setShowSettings] = useState(false)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showThinking, setShowThinking] = useState(false)
  const [thinkingIndex, setThinkingIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [chatModel, setChatModel] = useState<ChatModelId>('gemma')
  const [effort, setEffort] = useState<EffortChoice>('auto')
  const [attachment, setAttachment] = useState<Attachment | null>(null)

  const [voiceReplies, setVoiceReplies] = useState(false)
  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderKind>('browser')
  const [language, setLanguage] = useState('en-US')
  const [googleVoiceName, setGoogleVoiceName] = useState('Aoede')
  const [hasGoogleKey, setHasGoogleKey] = useState(false)
  const [googleKeyInput, setGoogleKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [geminiKeyCount, setGeminiKeyCount] = useState(0)

  const [geminiModels, setGeminiModels] = useState<string[]>([])
  const [activeGeminiModel, setActiveGeminiModelState] = useState<string | null>(null)
  const [newModelId, setNewModelId] = useState('')

  const [visionEnabled, setVisionEnabledState] = useState(true)
  const [visionModel, setVisionModelState] = useState('')
  const [visionModelInput, setVisionModelInput] = useState('')

  const [zapierUrlInput, setZapierUrlInput] = useState('')
  const [hasZapierUrl, setHasZapierUrl] = useState(false)
  const [savingZapierUrl, setSavingZapierUrl] = useState(false)
  const [zapierTools, setZapierTools] = useState<{ name: string; description: string }[]>([])

  const [hwSnapshot, setHwSnapshot] = useState<SystemSnapshot | null>(null)
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [debateActive, setDebateActive] = useState(false)
  const [liveActivity, setLiveActivity] = useState<{ label: string }[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(new Set())

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

  const [greeting, setGreeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)])

  const { supported: voiceSupported, listening, voiceError, speak, startListening, stopListening } =
    useVoice({ provider: voiceProvider, googleVoiceName, languageCode: language })

  const persist = (next: ChatMessage[]): void => {
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
  }

  const startNewChat = (): void => {
    if (messages.length > 0) persist(messages)
    setCurrentChatId(crypto.randomUUID())
    setMessages([])
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)])
    setInput('')
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
    window.api.ai.checkStatus().then(setStatus).catch(() => setStatus({ running: false, modelReady: false }))
    window.api.ai.hasGoogleApiKey().then(setHasGoogleKey).catch(() => {})
    window.api.ai.googleKeyCount?.().then(setGeminiKeyCount).catch(() => {})
    window.api.ai.hasZapierMcpUrl().then(setHasZapierUrl).catch(() => {})
    window.api.ai.listZapierTools().then(setZapierTools).catch(() => {})
    window.api.memory.list().then(setMemories).catch(() => {})
    window.api.aiNetwork?.listConfiguredGeminiModels().then(setGeminiModels).catch(() => {})
    window.api.aiNetwork?.getActiveGeminiModel().then(setActiveGeminiModelState).catch(() => {})
    window.api.aiNetwork?.isVisionEnabled().then(setVisionEnabledState).catch(() => {})
    window.api.aiNetwork?.getVisionModel().then((m) => setVisionModelState(m || '')).catch(() => {})
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
    if (voiceError) setMessages((p) => [...p, { id: crypto.randomUUID(), role: 'system', text: voiceError, at: Date.now() }])
  }, [voiceError])

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
    if (!attachment && (!trimmed || !window.api?.ai || sending)) return
    if (sending) return

    if (attachment) {
      const attachedFile = attachment
      setAttachment(null)
      const history = base ?? messages
      const label = trimmed || `Look at this ${attachedFile.type}: ${attachedFile.name}`
      const withUser: ChatMessage[] = [...history, { id: crypto.randomUUID(), role: 'user', text: label, at: Date.now() }]
      setMessages(withUser); setInput(''); setSending(true)
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
      } finally { setSending(false); activeRequestIdRef.current = null }
      return
    }

    const history = base ?? messages
    const withUser: ChatMessage[] = [...history, { id: crypto.randomUUID(), role: 'user', text: trimmed, at: Date.now() }]
    setMessages(withUser); setInput(''); setSending(true)
    setLiveActivity([])
    const requestId = crypto.randomUUID()
    activeRequestIdRef.current = requestId
    const started = performance.now()

    try {
      const result = await window.api.ai.sendPrompt(trimmed, chatModel, requestId, effort)
      const tookMs = Math.round(performance.now() - started)
      const withReply: ChatMessage[] = [...withUser, {
        id: crypto.randomUUID(), role: 'assistant', text: result.reply,
        actionSuccess: result.actionSuccess, pendingAction: result.pendingAction, at: Date.now(), tookMs,
        activity: liveActivity.length > 0 ? liveActivity : undefined,
        promptArtifact: result.promptArtifact
      }]
      setMessages(withReply); persist(withReply)
      window.api.memory.list().then(setMemories).catch(() => {})
      if (voiceReplies) speak(result.reply)
    } catch (err) {
      const withError: ChatMessage[] = [...withUser, {
        id: crypto.randomUUID(), role: 'assistant', at: Date.now(),
        tookMs: Math.round(performance.now() - started),
        text: err instanceof Error ? `Something went wrong: ${err.message}` : "Couldn't reach the local AI model."
      }]
      setMessages(withError); persist(withError)
    } finally { setSending(false); activeRequestIdRef.current = null }
  }

  const toggleMic = (): void => {
    if (listening) { stopListening(); return }
    startListening((t) => { setInput(t); send(t) })
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
    const marked = messages.map((m) => (m.id === messageId ? { ...m, pendingResolved: true } : m))
    setMessages(marked)

    if (!confirmed) {
      const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text: 'Cancelled.', at: Date.now() }]
      setMessages(next); persist(next); return
    }

    setResolvingId(messageId)
    try {
      if (message.pendingAction.type === 'fileOperation' && message.pendingAction.operationId) {
        const result = await window.api!.files.confirmOperation(message.pendingAction.operationId)
        const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text: result.message, actionSuccess: result.success, at: Date.now() }]
        setMessages(next); persist(next)
      } else if (message.pendingAction.type === 'uninstall') {
        if (!message.pendingAction.packageId) {
          const next = [...marked, {
            id: crypto.randomUUID(), role: 'assistant' as const, text: 'The uninstall request is missing its package identifier.', actionSuccess: false, at: Date.now()
          }]
          setMessages(next); persist(next)
          return
        }
        await window.api!.winget.uninstall(message.pendingAction.packageId)
        const text = `Uninstalled ${message.pendingAction.packageName ?? message.pendingAction.packageId}.`
        const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, text, actionSuccess: true, at: Date.now() }]
        setMessages(next); persist(next)
        if (voiceReplies) speak(text)
      }
    } catch (err) {
      const next = [...marked, { id: crypto.randomUUID(), role: 'assistant' as const, at: Date.now(), actionSuccess: false, text: err instanceof Error ? err.message : String(err) }]
      setMessages(next); persist(next)
    } finally { setResolvingId(null) }
  }

  const saveGoogleKey = async (): Promise<void> => {
    if (!googleKeyInput.trim() || !window.api?.ai) return
    setSavingKey(true)
    try {
      await window.api.ai.setGoogleApiKey(googleKeyInput.trim())
      setHasGoogleKey(true); setGoogleKeyInput('')
      window.api.ai.googleKeyCount?.().then(setGeminiKeyCount).catch(() => {})
    } finally { setSavingKey(false) }
  }
  const addModel = async (): Promise<void> => {
    if (!newModelId.trim() || !window.api?.aiNetwork) return
    const next = await window.api.aiNetwork.addGeminiModel(newModelId.trim())
    setGeminiModels(next); setNewModelId('')
    window.api.aiNetwork.getActiveGeminiModel().then(setActiveGeminiModelState).catch(() => {})
  }
  const removeModel = async (id: string): Promise<void> => {
    if (!window.api?.aiNetwork) return
    setGeminiModels(await window.api.aiNetwork.removeGeminiModel(id))
    window.api.aiNetwork.getActiveGeminiModel().then(setActiveGeminiModelState).catch(() => {})
  }
  const selectModel = async (id: string): Promise<void> => {
    if (!window.api?.aiNetwork) return
    await window.api.aiNetwork.setActiveGeminiModel(id)
    setActiveGeminiModelState(id)
  }
  const saveVisionModel = async (): Promise<void> => {
    if (!visionModelInput.trim() || !window.api?.aiNetwork) return
    await window.api.aiNetwork.setVisionModel(visionModelInput.trim())
    setVisionModelState(visionModelInput.trim()); setVisionModelInput('')
  }
  const toggleVision = async (v: boolean): Promise<void> => {
    setVisionEnabledState(v)
    await window.api?.aiNetwork?.setVisionEnabled(v)
  }
  const saveZapierUrl = async (): Promise<void> => {
    if (!zapierUrlInput.trim() || !window.api?.ai) return
    setSavingZapierUrl(true)
    try {
      await window.api.ai.setZapierMcpUrl(zapierUrlInput.trim())
      setHasZapierUrl(true); setZapierUrlInput('')
      window.api.ai.listZapierTools().then(setZapierTools).catch(() => {})
    } finally { setSavingZapierUrl(false) }
  }

  const statusReady = status?.running && status?.modelReady

  return (
    <div className="flex h-full flex-col">
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
              <FlameIcon size={44} />
              <p className="font-display text-xl font-semibold">{greeting}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                I can launch, install, update and remove apps, remember things, inspect files and images, and run your Zapier actions.
              </p>

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

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', statusReady ? 'bg-success' : 'bg-destructive')} />
                  {statusReady ? 'Flame ready' : status?.running ? 'Model not pulled' : 'Ollama offline'}
                </span>
                <span>·</span>
                <span>{memories.length} memories</span>
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

                    {m.promptArtifact && (
                      <div className="mt-2 rounded-md border border-border bg-background/60 p-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Prompt for {m.promptArtifact.forTool}</p>
                        <CodeBlock code={m.promptArtifact.prompt} />
                      </div>
                    )}

                    {m.pendingAction && !m.pendingResolved && (
                      <div className="mt-2.5 flex gap-2">
                        <Button size="sm" variant="destructive" disabled={resolvingId === m.id} onClick={() => resolvePending(m.id, true)}>
                          {resolvingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Confirm
                        </Button>
                        <Button size="sm" variant="outline" disabled={resolvingId === m.id} onClick={() => resolvePending(m.id, false)}>
                          <X className="h-3.5 w-3.5" /> Cancel
                        </Button>
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
                        {m.role === 'assistant' && <button onClick={() => speak(m.text)} title="Read aloud" className="rounded p-0.5 hover:text-foreground"><Volume2 className="h-3 w-3" /></button>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-end gap-2">
                <FlameIcon size={20} className="mb-1 opacity-0" />
                <ThinkingBadge label={showThinking ? THINKING_WORDS[thinkingIndex] : null} activity={liveActivity} open={activityOpen} onToggle={toggleActivityPanel} />
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border/40 px-4 pb-4 pt-3">
        <div className="relative mx-auto max-w-3xl">
          {showSettings && (
            <div className="absolute bottom-full left-0 z-30 mb-2 max-h-[70vh] w-full overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-fluent-lg">
              {status && !statusReady && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-xs">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  {!status.running ? 'Ollama isn\'t running.' : <>Ollama is running, but <code className="font-mono">gemma2:2b</code> isn&apos;t pulled yet.</>}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Voice provider</label>
                  <div className="mt-1.5 flex gap-2">
                    <Button size="sm" variant={voiceProvider === 'browser' ? 'default' : 'outline'} onClick={() => setVoiceProvider('browser')}>Browser</Button>
                    <Button size="sm" variant={voiceProvider === 'google' ? 'default' : 'outline'} onClick={() => setVoiceProvider('google')}>Google</Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Language (STT)</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm">
                    {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
                {voiceProvider === 'google' && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Google voice</label>
                      <select value={googleVoiceName} onChange={(e) => setGoogleVoiceName(e.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm">
                        {GOOGLE_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Google API key(s) {hasGoogleKey && <span className="text-success">({geminiKeyCount} saved)</span>}</label>
                      <div className="mt-1.5 flex gap-2">
                        <Input type="password" value={googleKeyInput} onChange={(e) => setGoogleKeyInput(e.target.value)} placeholder="KEY_1, KEY_2…" />
                        <Button size="sm" onClick={saveGoogleKey} disabled={savingKey || !googleKeyInput.trim()}>{savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}</Button>
                      </div>
                    </div>
                  </>
                )}

                <div className="sm:col-span-2 border-t border-border pt-3">
                  <label className="text-xs font-medium text-muted-foreground">Gemini models</label>
                  <div className="mt-1.5 flex gap-2">
                    <Input value={newModelId} onChange={(e) => setNewModelId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModel()} placeholder="e.g. gemini-2.0-flash" />
                    <Button size="sm" onClick={addModel} disabled={!newModelId.trim()}>Add</Button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {geminiModels.map((id) => (
                      <div key={id} className="flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-xs">
                        <span className="flex items-center gap-1.5">{activeGeminiModel === id && <Check className="h-3 w-3 text-success" />} {id}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant={activeGeminiModel === id ? 'secondary' : 'outline'} onClick={() => selectModel(id)} disabled={activeGeminiModel === id}>{activeGeminiModel === id ? 'Active' : 'Use'}</Button>
                          <Button size="sm" variant="outline" onClick={() => removeModel(id)}>Remove</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Vision (Gemini)</label>
                    <Switch checked={visionEnabled} onCheckedChange={toggleVision} />
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <Input value={visionModelInput} onChange={(e) => setVisionModelInput(e.target.value)} placeholder={visionModel || 'e.g. gemini-2.0-flash'} />
                    <Button size="sm" onClick={saveVisionModel} disabled={!visionModelInput.trim()}>Save</Button>
                  </div>
                  {visionModel && <p className="mt-1 text-xs text-muted-foreground">Active: {visionModel}</p>}
                </div>

                <div className="sm:col-span-2 border-t border-border pt-3">
                  <label className="text-xs font-medium text-muted-foreground">Zapier MCP URL {hasZapierUrl && <span className="text-success">(connected)</span>}</label>
                  <div className="mt-1.5 flex gap-2">
                    <Input type="password" value={zapierUrlInput} onChange={(e) => setZapierUrlInput(e.target.value)} placeholder="Paste connect URL…" />
                    <Button size="sm" onClick={saveZapierUrl} disabled={savingZapierUrl || !zapierUrlInput.trim()}>{savingZapierUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}</Button>
                  </div>
                  {zapierTools.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{zapierTools.length} action(s) available.</p>}
                </div>

                {hwSnapshot && (
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> {hwSnapshot.cpuPercent}%</span>
                    <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" /> {hwSnapshot.ramPercent}%</span>
                    <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {hwSnapshot.diskPercent}%</span>
                    <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> {hwSnapshot.gpuPercent ?? 0}%</span>
                  </div>
                )}

                <div className="sm:col-span-2 border-t border-border pt-3">
                  <Link to="/memory" className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs hover:bg-muted/70">
                    <span className="flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5" /> {memories.length} memories saved</span>
                    <span className="text-muted-foreground">Manage →</span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center gap-2">
            <ModelEffortMenu model={chatModel} onModelChange={setChatModel} effort={effort} onEffortChange={setEffort} />
            <button onClick={() => setShowSettings((v) => !v)} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary">
              <Settings2 className="h-3 w-3" /> Configure
            </button>
            {status && (
              <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]', statusReady ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                <CircleDot className="h-2.5 w-2.5" /> {statusReady ? 'Flame ready' : status.running ? 'Model not pulled' : 'Ollama offline'}
              </span>
            )}
            {debateActive && (
              <Button size="sm" variant="destructive" className="ml-auto h-6 px-2 text-[11px]" onClick={() => window.api?.ai?.stopDebate()}>
                Stop debate
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
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder="Message FlameAGI…"
              disabled={sending}
              className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
            />
            {voiceSupported && (
              <button onClick={toggleMic} title={listening ? 'Stop listening' : 'Speak'} className={cn('flex h-8 w-8 items-center justify-center rounded-full', listening ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-secondary')}>
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => setVoiceReplies((v) => !v)}
              title={voiceReplies ? 'Voice replies on' : 'Voice replies off'}
              className={cn('flex h-8 w-8 items-center justify-center rounded-full', voiceReplies ? 'text-primary' : 'text-muted-foreground hover:bg-secondary')}
            >
              {voiceReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <Button size="icon" className="h-8 w-8 rounded-full" onClick={() => send(input)} disabled={sending || (!input.trim() && !attachment)}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
