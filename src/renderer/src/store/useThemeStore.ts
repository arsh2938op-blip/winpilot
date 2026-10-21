import { create } from 'zustand'
import type { ThemeMode } from '@shared/types'

export type AccentTheme = 'default' | 'magma' | 'purple' | 'emerald' | 'slate'

export const ACCENT_THEMES: { id: AccentTheme; label: string; swatch: string }[] = [
  { id: 'default', label: 'Fluent Blue', swatch: '#0d6ec2' },
  { id: 'magma', label: 'Magma', swatch: '#ea580c' },
  { id: 'purple', label: 'Nebula', swatch: '#7c3aed' },
  { id: 'emerald', label: 'Emerald', swatch: '#059669' },
  { id: 'slate', label: 'Graphite', swatch: '#475569' }
]

interface ThemeState {
  mode: ThemeMode
  accent: AccentTheme
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: AccentTheme) => void
}

// Persisted in localStorage — available in Electron's renderer and the
// simplest store that survives restarts without new IPC plumbing.
const MODE_KEY = 'flame:theme-mode'
const ACCENT_KEY = 'flame:theme-accent'

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: read<ThemeMode>(MODE_KEY, 'system'),
  accent: read<AccentTheme>(ACCENT_KEY, 'default'),
  setMode: (mode) => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* non-fatal */
    }
    set({ mode })
  },
  setAccent: (accent) => {
    try {
      localStorage.setItem(ACCENT_KEY, accent)
    } catch {
      /* non-fatal */
    }
    set({ accent })
  }
}))
