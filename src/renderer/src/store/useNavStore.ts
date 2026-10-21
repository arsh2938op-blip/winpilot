import { create } from 'zustand'

interface NavState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  newChatSignal: number
  requestNewChat: () => void
  activeChatId: string | null
  setActiveChatId: (id: string | null) => void
  chatsVersion: number
  bumpChatsVersion: () => void
}

export const useNavStore = create<NavState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  newChatSignal: 0,
  requestNewChat: () => set((s) => ({ newChatSignal: s.newChatSignal + 1 })),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
  chatsVersion: 0,
  bumpChatsVersion: () => set((s) => ({ chatsVersion: s.chatsVersion + 1 }))
}))
