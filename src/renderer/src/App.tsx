import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@renderer/components/layout/AppShell'
import { navItems, pluginRoutes } from '@renderer/routes'
import NotFound from '@renderer/pages/NotFound'
import { useTheme } from '@renderer/hooks/useTheme'
import { initOrbStore } from '@renderer/store/useOrbStore'

export default function App(): React.JSX.Element {
  // Keeps the `.dark` class on <html> in sync with the theme store,
  // including reacting to OS theme changes when mode is 'system'.
  useTheme()

  // The floating orb is created by the main process on demand; this only
  // mirrors its real state so the title bar and settings stay truthful.
  useEffect(() => initOrbStore(), [])

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
    <Routes>
      <Route element={<AppShell />}>
        {[...navItems, ...pluginRoutes].map((item) => (
          <Route key={item.path} path={item.path} element={<item.element />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}