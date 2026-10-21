import { useEffect, useState } from 'react'
import { Sun, Moon, Laptop, Info, Sparkles } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { Switch } from '@renderer/components/ui/switch'
import { Separator } from '@renderer/components/ui/separator'
import { useThemeStore, ACCENT_THEMES } from '@renderer/store/useThemeStore'
import { useOrbStore } from '@renderer/store/useOrbStore'
import { cn } from '@renderer/lib/utils'
import type { OrbAccent, PlatformInfo } from '@shared/types'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop }
] as const

// The companion is deliberately limited to two colours.
const ORB_ACCENTS: { id: OrbAccent; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: 'radial-gradient(circle at 40% 35%, #7cc4ff, #1b3b6f)' },
  { id: 'black', label: 'Black', swatch: 'radial-gradient(circle at 40% 35%, #3a3f45, #0a0b0c)' }
]

/**
 * Settings page. The theme switcher is real and functional — the theme
 * system is core app infrastructure the project explicitly asked for, not
 * a product "feature" to be placeholder-only. Everything else here
 * (notifications, startup behavior, updates) is a TODO placeholder.
 */
export default function Settings(): React.JSX.Element {
  const { mode, setMode, accent, setAccent } = useThemeStore()
  const orbVisible = useOrbStore((s) => s.visible)
  const orbAlwaysOnTop = useOrbStore((s) => s.alwaysOnTop)
  const orbTransparency = useOrbStore((s) => s.transparencySupported)
  const orbAccent = useOrbStore((s) => s.accent)
  const orbAlwaysListening = useOrbStore((s) => s.alwaysListening)
  const orb = useOrbStore()
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)

  useEffect(() => {
    // Guard: window.api is only present inside the real Electron window.
    if (!window.api?.app) return
    window.api.app.getPlatformInfo().then(setPlatformInfo).catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader title="Settings" description="Appearance, preferences, and app information." />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how WinPilot looks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-md border px-4 py-3 text-sm transition-colors',
                    mode === option.value
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border hover:bg-secondary'
                  )}
                >
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium">Colour theme</p>
              <div className="flex flex-wrap gap-2">
                {ACCENT_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setAccent(theme.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                      accent === theme.id
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border hover:bg-secondary'
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/10"
                      style={{ background: theme.swatch }}
                    />
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Not implemented yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Launch on startup, notification preferences, and update settings will live here.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> PET mode
            </CardTitle>
            <CardDescription>A small frameless FlameAGI orb that lives on your desktop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">PET mode</p>
                <p className="text-xs text-muted-foreground">
                  Drag it anywhere. Click it for a quick chat — it uses the conversation
                  currently open in the main window.
                </p>
              </div>
              <Switch
                checked={orbVisible}
                onCheckedChange={(v) => void (v ? orb.enable() : orb.disable())}
                aria-label="PET mode"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Always on top</p>
                <p className="text-xs text-muted-foreground">
                  Keep the orb above ordinary windows.
                </p>
              </div>
              <Switch
                checked={orbAlwaysOnTop}
                onCheckedChange={(v) => void orb.setAlwaysOnTop(v)}
                aria-label="Always on top"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Companion colour</p>
                <p className="text-xs text-muted-foreground">
                  Blue or black only, applied live — no restart needed.
                </p>
              </div>
              <div className="flex gap-2">
                {ORB_ACCENTS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => void orb.setAccent(option.id)}
                    aria-pressed={orbAccent === option.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                      orbAccent === option.id
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border hover:bg-secondary'
                    )}
                  >
                    <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: option.swatch }} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Always Listening</p>
                <p className="text-xs text-muted-foreground">
                  The orb keeps a microphone monitor open and listens for speech. Speech
                  detection runs locally on your device; only a detected phrase is sent for
                  transcription. Turn it off for an immediate, silent mute.
                </p>
              </div>
              <Switch
                checked={orbAlwaysListening}
                onCheckedChange={(v) => void orb.setAlwaysListening(v)}
                aria-label="Always Listening"
              />
            </div>

            {orbAlwaysListening && !orbVisible && (
              <p className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
                Always Listening takes effect once PET mode is shown.
              </p>
            )}

            {!orbTransparency && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-300">
                This platform can&apos;t give the orb a truly transparent window, so it falls
                back to an opaque surface.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4" /> About
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Version" value={platformInfo?.appVersion ?? '—'} />
              <Separator />
              <Row label="Windows version" value={platformInfo?.osVersion ?? '—'} />
              <Separator />
              <Row label="Architecture" value={platformInfo?.arch ?? '—'} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  )
}