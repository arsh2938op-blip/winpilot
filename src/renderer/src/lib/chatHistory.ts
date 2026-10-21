export interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  actionSuccess?: boolean
  agent?: 'flame' | 'gemini'
  activity?: { label: string }[]
  promptArtifact?: { forTool: string; prompt: string }
}

export interface StoredChat {
  id: string
  title: string
  timestamp: number
  messages: StoredChatMessage[]
}

// Renderer-only persistence via localStorage — fine for a single-user
// local Electron app; no server or database involved.
const STORAGE_KEY = 'flame-agi:chats'

export function loadChats(): StoredChat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as StoredChat[]).sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

export function saveChat(chat: StoredChat): void {
  const chats = loadChats().filter((c) => c.id !== chat.id)
  chats.unshift({ ...chat, timestamp: Date.now() })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
}

export function deleteChat(id: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadChats().filter((c) => c.id !== id)))
}

export function titleFromFirstMessage(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed || 'New chat'
}

const PENDING_OPEN_KEY = 'flame-agi:pending-open-chat'

/** History page sets this right before navigating to Chat; Chat reads
 * and clears it on mount. Avoids adding a global state library for one
 * cross-page handoff. */
export function setPendingOpenChat(id: string): void {
  try {
    localStorage.setItem(PENDING_OPEN_KEY, id)
  } catch {
    /* non-fatal */
  }
}

export function getAndClearPendingOpenChat(): string | null {
  try {
    const id = localStorage.getItem(PENDING_OPEN_KEY)
    if (id) localStorage.removeItem(PENDING_OPEN_KEY)
    return id
  } catch {
    return null
  }
}

const OPEN_CHAT_EVENT = 'flame:open-chat'

/**
 * Opens a stored conversation.
 *
 * The localStorage handoff alone only works if Chat mounts afterwards. If
 * the user is already on the Chat page, nothing would remount it and the
 * click silently did nothing, so we also emit an in-page event that an
 * already-mounted Chat listens for.
 */
export function requestOpenChat(id: string): void {
  setPendingOpenChat(id)
  window.dispatchEvent(new CustomEvent<string>(OPEN_CHAT_EVENT, { detail: id }))
}

export function onOpenChat(handler: (id: string) => void): () => void {
  const listener = (e: Event): void => handler((e as CustomEvent<string>).detail)
  window.addEventListener(OPEN_CHAT_EVENT, listener)
  return () => window.removeEventListener(OPEN_CHAT_EVENT, listener)
}