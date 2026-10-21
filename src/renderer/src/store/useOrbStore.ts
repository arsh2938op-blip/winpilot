import { create } from 'zustand'
import type { OrbAccent, OrbWindowState } from '@shared/types'

/**
 * Single source of truth for the floating orb's real state in the main
 * window. The title bar and the settings page both read from here, so
 * there is exactly one owner of each toggle and no chance of the two
 * disagreeing with the real native window (which also pushes changes,
 * e.g. when the orb window is closed directly).
 */

interface OrbState extends OrbWindowState {
  ready: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
  toggle: () => Promise<void>
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>
  setAccent: (accent: OrbAccent) => Promise<void>
  setAlwaysListening: (enabled: boolean) => Promise<void>
}

const UNKNOWN: OrbWindowState = {
  visible: false,
  alwaysOnTop: true,
  transparencySupported: true,
  accent: 'blue',
  alwaysListening: false
}

export const useOrbStore = create<OrbState>((set) => ({
  ...UNKNOWN,
  ready: false,
  enable: async () => set(await safeCall(() => window.api.orb.enable())),
  disable: async () => set(await safeCall(() => window.api.orb.disable())),
  toggle: async () => set(await safeCall(() => window.api.orb.toggle())),
  setAlwaysOnTop: async (alwaysOnTop) => {
    set({ alwaysOnTop })
    set(await safeCall(() => window.api.orb.setAlwaysOnTop(alwaysOnTop)))
  },
  setAccent: async (accent) => {
    // Optimistic so the UI reacts instantly; the native reply is truth.
    set({ accent })
    set(await safeCall(() => window.api.orb.setAccent(accent)))
  },
  setAlwaysListening: async (alwaysListening) => {
    set({ alwaysListening })
    set(await safeCall(() => window.api.orb.setAlwaysListening(alwaysListening)))
  }
}))

async function safeCall(fn: () => Promise<OrbWindowState>): Promise<OrbWindowState> {
  try {
    return await fn()
  } catch (error) {
    console.error('[Flame] Orb command failed:', error)
    return useOrbStore.getState()
  }
}

/** Called once from <App />: reads the real state and keeps it in sync. */
export function initOrbStore(): () => void {
  const api = window.api?.orb
  if (!api) return () => undefined

  void api
    .getState()
    .then((state) => useOrbStore.setState(state))
    .catch(() => useOrbStore.setState({ ready: true }))

  const offVisibility = api.onVisibilityChange((visible) => useOrbStore.setState({ visible }))
  const offPrefs = api.onPrefsChange(({ accent, alwaysListening }) =>
    useOrbStore.setState({ accent, alwaysListening })
  )

  return () => {
    offVisibility()
    offPrefs()
  }
}
