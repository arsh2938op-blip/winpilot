import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMode } from '@shared/types'

interface ChatModeState {
  mode: ChatMode
  setMode: (mode: ChatMode) => void
  toggleMode: () => void
}

export const useChatModeStore = create<ChatModeState>()(
  persist(
    (set, get) => ({
      mode: 'chat',
      setMode: (mode) => set({ mode }),
      toggleMode: () => set({ mode: get().mode === 'chat' ? 'task' : 'chat' })
    }),
    { name: 'flame:chat-mode' }
  )
)
