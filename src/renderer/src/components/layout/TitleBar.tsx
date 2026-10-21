import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Minus, Square, Copy, X, Compass, Sparkles } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useOrbStore } from '@renderer/store/useOrbStore'

/**
 * Custom title bar replacing the native Windows chrome (see
 * titleBarStyle: 'hidden' in src/main/index.ts). Keeping this consistent
 * with the rest of the UI is what makes WinPilot feel like a single
 * designed surface rather than "a webpage in a window".
 */
export function TitleBar(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  const orbVisible = useOrbStore((s) => s.visible)
  const toggleOrb = useOrbStore((s) => s.toggle)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const onToggleOrb = (): void => {
    // The orb talks to whichever conversation the chat page owns, so
    // turning floating mode on from another page also brings the chat up.
    if (!orbVisible && pathname !== '/') navigate('/')
    void toggleOrb()
  }

  // window.api only exists inside the real Electron window (injected by
  // preload). If it's missing — e.g. this got opened in a plain browser
  // tab instead of the actual app window, or the preload script failed to
  // load — we skip wiring window controls instead of crashing the app.
  const hasApi = typeof window !== 'undefined' && !!window.api?.window

  useEffect(() => {
    if (!hasApi) {
      console.warn(
        '[WinPilot] window.api is not available. If you are viewing this in a ' +
          'regular browser tab, open the actual Electron app window instead. ' +
          'Otherwise, check the terminal running `npm run dev` for preload errors.'
      )
      return
    }
    return window.api.window.onMaximizedChange(setIsMaximized)
  }, [hasApi])

  return (
    <div className="app-drag flex h-9 shrink-0 items-center justify-between border-b border-border bg-sidebar pl-3 pr-0 text-sidebar-foreground">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-primary" strokeWidth={2.25} />
        <span className="text-xs font-semibold tracking-wide">FlameAGI</span>
        <button
          onClick={onToggleOrb}
          aria-pressed={orbVisible}
          title={orbVisible ? 'Hide PET mode' : 'Show PET mode on the desktop'}
          className={cn(
            'app-no-drag ml-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors',
            orbVisible ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          <Sparkles className="h-3 w-3" />
          {orbVisible ? 'PET on' : 'PET'}
        </button>
      </div>

      <div className="app-no-drag flex h-full items-stretch">
        <TitleBarButton label="Minimize" onClick={() => window.api?.window.minimize()}>
          <Minus className="h-3.5 w-3.5" />
        </TitleBarButton>
        <TitleBarButton
          label={isMaximized ? 'Restore' : 'Maximize'}
          onClick={() => window.api?.window.maximizeToggle()}
        >
          {isMaximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </TitleBarButton>
        <TitleBarButton label="Close" danger onClick={() => window.api?.window.close()}>
          <X className="h-3.5 w-3.5" />
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({
  children,
  label,
  onClick,
  danger
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex w-12 items-center justify-center text-muted-foreground transition-colors',
        danger ? 'hover:bg-destructive hover:text-destructive-foreground' : 'hover:bg-secondary'
      )}
    >
      {children}
    </button>
  )
}