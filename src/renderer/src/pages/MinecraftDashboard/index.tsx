import { useEffect, useRef, useState } from 'react'
import { Gamepad2, FolderOpen, Play, Square, Terminal } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import type { MinecraftConfig, MinecraftStatus, MinecraftLogLine } from '@shared/types'

const STATE_LABEL: Record<MinecraftStatus['state'], string> = {
  offline: 'Offline',
  starting: 'Starting',
  online: 'Online',
  stopping: 'Stopping',
  error: 'Error',
  needs_keys: 'Needs API keys'
}
const STATE_COLOR: Record<MinecraftStatus['state'], string> = {
  offline: 'bg-muted-foreground',
  starting: 'bg-yellow-500',
  online: 'bg-success',
  stopping: 'bg-yellow-500',
  error: 'bg-destructive',
  needs_keys: 'bg-destructive'
}

export default function MinecraftDashboard(): React.JSX.Element {
  const [config, setConfig] = useState<MinecraftConfig | null>(null)
  const [status, setStatus] = useState<MinecraftStatus>({ state: 'offline', bots: [], serverOnline: false, mindserverOnline: false })
  const [presets, setPresets] = useState<Record<string, string[]>>({})
  const [logLines, setLogLines] = useState<string[]>([])
  const [launchMsg, setLaunchMsg] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api?.minecraft?.getConfig().then(setConfig)
    window.api?.minecraft?.getStatus().then(setStatus)
    window.api?.minecraft?.listModelPresets().then(setPresets)
  }, [])

  useEffect(() => {
    if (!window.api?.minecraft) return
    const offLog = window.api.minecraft.onLog((line: MinecraftLogLine) => {
      setLogLines((prev) => [...prev.slice(-199), line.text])
    })
    const offStatus = window.api.minecraft.onStatus(setStatus)
    return () => {
      offLog()
      offStatus()
    }
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logLines])

  const update = (patch: Partial<MinecraftConfig>): void => {
    if (!config) return
    const next = { ...config, ...patch }
    setConfig(next)
    window.api?.minecraft?.saveConfig(next)
  }

  const pickFolder = async (): Promise<void> => {
    const path = await window.api?.minecraft?.pickFolder()
    if (path && config) setConfig({ ...config, projectPath: path })
  }

  const launch = async (): Promise<void> => {
    setLogLines([])
    const result = await window.api?.minecraft?.start()
    setLaunchMsg(result?.message ?? null)
  }
  const stop = async (): Promise<void> => {
    const result = await window.api?.minecraft?.stop()
    setLaunchMsg(result?.message ?? null)
  }

  const running = status.state === 'starting' || status.state === 'online'

  if (!config) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="flex h-[calc(100vh-4.5rem)] flex-col overflow-y-auto">
      <PageHeader title="MindCraft Control Centre" description="Configure and launch MindCraft — no run.bat required." />

      <Card className="mb-3">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', STATE_COLOR[status.state])} />
            <span className="text-sm font-medium">MindCraft: {STATE_LABEL[status.state]}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Minecraft server: {status.serverOnline ? 'Online' : 'Offline'}</span>
            <span>MindServer: {status.mindserverOnline ? 'Online' : 'Offline'}</span>
            <span>Bots: {status.bots.length} / {config.botCount}</span>
          </div>
          {!running ? (
            <Button onClick={launch} disabled={!config.projectPath}>
              <Play className="h-4 w-4" /> Launch MindCraft
            </Button>
          ) : (
            <Button variant="destructive" onClick={stop}>
              <Square className="h-4 w-4" /> Stop MindCraft
            </Button>
          )}
        </CardContent>
      </Card>

      {status.state === 'needs_keys' && (
        <Card className="mb-3 border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            MindCraft just created <code>keys.json</code> from <code>keys.example.json</code> — fill in your API
            keys in that file, then click Launch again.
          </CardContent>
        </Card>
      )}

      {status.bots.length > 0 && (
        <Card className="mb-3">
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Bots</p>
            <div className="flex flex-wrap gap-2">
              {status.bots.map((b) => (
                <span key={b} className="rounded-full bg-muted px-2.5 py-1 text-xs">{b}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {launchMsg && <p className="mb-3 text-xs text-muted-foreground">{launchMsg}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium">Minecraft</p>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={pickFolder}>
                  <FolderOpen className="h-3.5 w-3.5" /> {config.projectPath ? 'Change folder' : 'Choose MindCraft folder'}
                </Button>
              </div>
              {config.projectPath && <p className="truncate text-muted-foreground">{config.projectPath}</p>}
              <label className="block">Server IP
                <Input className="mt-1" value={config.serverIp} onChange={(e) => update({ serverIp: e.target.value })} />
              </label>
              <label className="block">Server Port
                <Input className="mt-1" type="number" value={config.serverPort} onChange={(e) => update({ serverPort: Number(e.target.value) })} />
              </label>
              <label className="block">MindServer Port
                <Input className="mt-1" type="number" value={config.mindserverPort} onChange={(e) => update({ mindserverPort: Number(e.target.value) })} />
              </label>
              <div className="flex items-center justify-between pt-1">
                <span>Auto-open dashboard UI</span>
                <Switch checked={config.autoOpenUi} onCheckedChange={(v) => update({ autoOpenUi: v })} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium">Bots</p>
            <div className="space-y-2.5 text-xs">
              <label className="block">Bot count
                <Input className="mt-1" type="number" min={1} value={config.botCount} onChange={(e) => update({ botCount: Number(e.target.value) })} />
              </label>
              <label className="block">Bot names (optional, comma-separated)
                <Input className="mt-1" value={config.botNames} onChange={(e) => update({ botNames: e.target.value })} />
              </label>
              <label className="block">Models / preset (blank = models.json default)
                <Input
                  className="mt-1"
                  value={config.modelsOrPreset}
                  onChange={(e) => update({ modelsOrPreset: e.target.value })}
                  placeholder={Object.keys(presets).length ? `e.g. ${Object.keys(presets)[0]}` : 'e.g. ollama/gemma2:2b'}
                />
              </label>
              {Object.keys(presets).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.keys(presets).map((name) => (
                    <button
                      key={name}
                      onClick={() => update({ modelsOrPreset: name })}
                      className={cn(
                        'rounded-full px-2.5 py-1',
                        config.modelsOrPreset === name ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <label className="block">Spawn delay (seconds)
                <Input className="mt-1" type="number" value={config.spawnDelaySeconds} onChange={(e) => update({ spawnDelaySeconds: Number(e.target.value) })} />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium">Advanced</p>
            <div className="space-y-2.5 text-xs">
              {([
                ['viewer', 'Viewer'],
                ['apiRotation', 'API key rotation'],
                ['speakjs', 'Speak.js STT/TTS'],
                ['ownership', 'Ownership system'],
                ['essentials', 'Essentials-style commands']
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{label}</span>
                  <Switch checked={config[key]} onCheckedChange={(v) => update({ [key]: v } as Partial<MinecraftConfig>)} />
                </div>
              ))}
              <p className="pt-1 text-muted-foreground">
                API rotation / Speak.js / Ownership / Essentials are written to .env for compatibility, but their
                consumer wasn&apos;t found in launcher.js/settings.js — unverified whether they currently do anything.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Terminal className="h-3.5 w-3.5" /> Live Output</p>
            <div ref={logRef} className="flex-1 overflow-y-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
              {logLines.length === 0 && <p className="text-muted-foreground">No output yet.</p>}
              {logLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </CardContent>
        </Card>
      </div>

      {status.mindserverOnline && (
        <Card className="mt-4">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border p-3 text-sm font-medium">
              <Gamepad2 className="h-4 w-4" /> MindCraft Dashboard
            </div>
            <div className="h-[600px]">
              <webview src={`http://localhost:${config.mindserverPort}`} style={{ width: '100%', height: '100%' }} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
