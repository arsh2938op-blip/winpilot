import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@renderer/components/layout/AppShell'
import { navItems, pluginRoutes } from '@renderer/routes'
import NotFound from '@renderer/pages/NotFound'
import { useTheme } from '@renderer/hooks/useTheme'
import { initOrbStore } from '@renderer/store/useOrbStore'
import { Sparkles, X } from 'lucide-react'

export default function App(): React.JSX.Element {
  // Keeps the `.dark` class on <html> in sync with the theme store,
  // including reacting to OS theme changes when mode is 'system'.
  useTheme()

  // The floating orb is created by the main process on demand; this only
  // mirrors its real state so the title bar and settings stay truthful.
  useEffect(() => initOrbStore(), [])

  // 'New Skill Unlocked' UI Toast listener
  const [skillToast, setSkillToast] = useState<{ featureName: string; id: number } | null>(null)

  useEffect(() => {
    if (!window.api?.agent?.onSkillUnlocked) return
    return window.api.agent.onSkillUnlocked((evt) => {
      setSkillToast({ featureName: evt.featureName, id: Date.now() })
    })
  }, [])

  useEffect(() => {
    if (!skillToast) return
    const timer = setTimeout(() => setSkillToast(null), 5000)
    return () => clearTimeout(timer)
  }, [skillToast])

  useEffect(() => {
    const handleGlobalEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalEsc)
    return () => window.removeEventListener('keydown', handleGlobalEsc)
  }, [])

  // Tells the main process the user is still here, so PET mode stays quiet
  // while they are actually working in Flame. Throttled hard: pointermove
  // fires constantly and this only needs to be true, not precise.
  useEffect(() => {
    let last = 0
    const ping = (): void => {
      const now = Date.now()
      if (now - last < 10_000) return
      last = now
      window.api?.orb?.noteActivity?.()
    }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'pointermove']
    for (const e of events) window.addEventListener(e, ping, { passive: true })
    window.addEventListener('focus', ping)
    return () => {
      for (const e of events) window.removeEventListener(e, ping)
      window.removeEventListener('focus', ping)
    }
  }, [])

  return (
    <>
      {skillToast && (
        <div className="fixed top-12 right-6 z-50 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <p className="text-xs font-semibold text-amber-400">✨ New Skill Unlocked</p>
            <p className="text-sm font-medium text-foreground">{skillToast.featureName}</p>
          </div>
          <button
            onClick={() => setSkillToast(null)}
            className="ml-2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Routes>
        <Route element={<AppShell />}>
          {[...navItems, ...pluginRoutes].map((item) => (
            <Route key={item.path} path={item.path} element={<item.element />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}
