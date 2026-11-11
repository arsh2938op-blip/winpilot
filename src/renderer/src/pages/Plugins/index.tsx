import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Puzzle,
  Monitor,
  Zap,
  ArrowRight,
  Crown,
  Search,
  Sparkles,
  Clock,
  ShieldCheck,
  Binary,
  FolderTree,
  Terminal,
  Layers,
  Gamepad2,
  Bot,
  Github,
  MessageSquare,
  QrCode,
  RefreshCw,
  CheckCircle2,
  Phone
} from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import type { FlamePluginMeta, FlamePluginCategory } from '@shared/types'

const PLUGIN_ICONS: Record<string, typeof Puzzle> = {
  windows: Monitor,
  osint: ShieldCheck,
  rea: Binary,
  chess: Crown,
  image: Sparkles,
  dueMessages: Clock,
  zapier: Zap,
  memory: Layers,
  files: FolderTree,
  coder: Terminal,
  minecraft: Gamepad2,
  github: Github,
  whatsapp: MessageSquare,
  robot: Bot
}

const CATEGORY_LABELS: Record<FlamePluginCategory | 'all', string> = {
  all: 'All Modules',
  system: 'System',
  analysis: 'Analysis',
  ai: 'AI & Vision',
  developer: 'Developer',
  tools: 'Tools',
  communication: 'Communication'
}

export default function Plugins(): React.JSX.Element {
  const [plugins, setPlugins] = useState<FlamePluginMeta[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<FlamePluginCategory | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [waStatus, setWaStatus] = useState<{
    connected: boolean
    status: 'disconnected' | 'qr_ready' | 'connected'
    qrDataUrl: string | null
  }>({
    connected: false,
    status: 'disconnected',
    qrDataUrl: null
  })
  const [waConnecting, setWaConnecting] = useState(false)

  useEffect(() => {
    let unmounted = false

    const load = async (): Promise<void> => {
      try {
        if (window.api?.plugins?.list) {
          const list = await window.api.plugins.list()
          if (!unmounted) setPlugins(list)
        }
        if (window.api?.whatsapp?.getStatus) {
          const st = await window.api.whatsapp.getStatus()
          if (!unmounted && st) setWaStatus(st)
        }
      } catch (err) {
        console.error('Failed to load plugins:', err)
      } finally {
        if (!unmounted) setLoading(false)
      }
    }

    void load()

    const unsubscribe = window.api?.plugins?.onStateChange?.((updated) => {
      if (!unmounted) setPlugins(updated)
    })

    const unsubWa = window.api?.whatsapp?.onQrUpdated?.((st) => {
      if (!unmounted && st) {
        setWaStatus(st)
        if (st.connected) setWaConnecting(false)
      }
    })

    return () => {
      unmounted = true
      unsubscribe?.()
      unsubWa?.()
    }
  }, [])

  const handleConnectWhatsApp = async (): Promise<void> => {
    setWaConnecting(true)
    try {
      if (window.api?.whatsapp?.connect) {
        const res = await window.api.whatsapp.connect()
        if (res) setWaStatus(res)
      }
    } catch (err) {
      console.error('Failed to start WhatsApp:', err)
    } finally {
      setWaConnecting(false)
    }
  }

  const handleDisconnectWhatsApp = async (): Promise<void> => {
    try {
      if (window.api?.whatsapp?.disconnect) {
        const res = await window.api.whatsapp.disconnect()
        if (res) setWaStatus(res)
      }
    } catch (err) {
      console.error('Failed to disconnect WhatsApp:', err)
    }
  }

  const handleToggle = async (pluginId: string, current: boolean): Promise<void> => {
    // Optimistic UI update
    setPlugins((prev) =>
      prev.map((p) => (p.id === pluginId ? { ...p, enabled: !current } : p))
    )
    try {
      if (window.api?.plugins?.toggle) {
        await window.api.plugins.toggle(pluginId, !current)
      }
    } catch (err) {
      console.error(`Failed to toggle plugin "${pluginId}":`, err)
      // Revert on error
      setPlugins((prev) =>
        prev.map((p) => (p.id === pluginId ? { ...p, enabled: current } : p))
      )
    }
  }

  const filteredPlugins = useMemo(() => {
    return plugins.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false
      if (search.trim()) {
        const query = search.toLowerCase()
        const matchesName = p.name.toLowerCase().includes(query)
        const matchesDesc = p.description.toLowerCase().includes(query)
        const matchesCap = p.capabilities.some((c) => c.toLowerCase().includes(query))
        return matchesName || matchesDesc || matchesCap
      }
      return true
    })
  }, [plugins, search, selectedCategory])

  const totalActive = plugins.filter((p) => p.enabled).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Plugins & Modules"
          description="Manage active runtime capabilities. Toggle modules on or off dynamically without restarting FlameAGI."
        />
        <div className="flex items-center gap-2 self-start rounded-full border border-border bg-card px-3 py-1.5 shadow-sm sm:self-auto">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-foreground">
            {totalActive} of {plugins.length} Active
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'system', 'analysis', 'ai', 'developer', 'communication', 'tools'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search capabilities…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Plugins Grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Loading plugins…
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No plugins match your filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredPlugins.map((plugin) => {
            const Icon = PLUGIN_ICONS[plugin.id] || Puzzle
            return (
              <Card
                key={plugin.id}
                className={`transition-all duration-200 ${
                  plugin.enabled
                    ? 'border-border/80 shadow-sm'
                    : 'border-border/30 bg-card/40 opacity-75'
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        plugin.enabled
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-semibold truncate text-foreground">
                            {plugin.name}
                          </p>
                          <Badge
                            variant={plugin.enabled ? 'success' : 'secondary'}
                            className="text-[10px] py-0 px-1.5 h-4 uppercase tracking-wider font-mono shrink-0"
                          >
                            {plugin.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        <Switch
                          checked={plugin.enabled}
                          onCheckedChange={() => handleToggle(plugin.id, plugin.enabled)}
                          aria-label={`Toggle ${plugin.name}`}
                          className="shrink-0"
                        />
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {plugin.description}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] font-mono text-muted-foreground/80">
                          {plugin.capabilities.length} capabilities
                        </span>
                        <span className="text-muted-foreground/40 text-[10px]">•</span>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          {plugin.category}
                        </span>
                      </div>

                      {plugin.id === 'whatsapp' && (
                        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-primary" />
                              Pairing & Status
                            </span>
                            {waStatus.connected ? (
                              <Badge variant="success" className="text-[10px] py-0 px-2 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Connected
                              </Badge>
                            ) : waStatus.status === 'qr_ready' ? (
                              <Badge variant="secondary" className="text-[10px] py-0 px-2 border-amber-500/40 text-amber-400 flex items-center gap-1">
                                <QrCode className="h-3 w-3" /> Ready to Scan
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] py-0 px-2 text-muted-foreground">
                                Disconnected
                              </Badge>
                            )}
                          </div>

                          {waStatus.connected ? (
                            <div className="space-y-2">
                              <p className="text-[11px] text-muted-foreground">
                                Active phone session authenticated. Desktop + WhatsApp Shared Brain & moderation active.
                              </p>
                              <button
                                type="button"
                                onClick={handleDisconnectWhatsApp}
                                className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                              >
                                Disconnect
                              </button>
                            </div>
                          ) : waStatus.status === 'qr_ready' && waStatus.qrDataUrl ? (
                            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                              <div className="relative group shrink-0 rounded-lg border border-amber-500/40 bg-white p-1.5 shadow-md">
                                <img
                                  src={waStatus.qrDataUrl}
                                  alt="WhatsApp Pairing QR"
                                  className="h-36 w-36 object-contain"
                                />
                              </div>
                              <div className="text-[11px] text-muted-foreground space-y-1.5">
                                <p className="font-medium text-foreground">Scan with your phone:</p>
                                <ol className="list-decimal list-inside space-y-0.5 text-[10px]">
                                  <li>Open WhatsApp on phone</li>
                                  <li>Settings → Linked Devices</li>
                                  <li>Tap <b>Link a Device</b></li>
                                </ol>
                                <button
                                  type="button"
                                  onClick={handleConnectWhatsApp}
                                  disabled={waConnecting}
                                  className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-1"
                                >
                                  <RefreshCw className={`h-2.5 w-2.5 ${waConnecting ? 'animate-spin' : ''}`} /> Refresh Code
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-muted-foreground">
                                Connect phone to enable Shared Brain & auto-replies.
                              </span>
                              <button
                                type="button"
                                onClick={handleConnectWhatsApp}
                                disabled={waConnecting}
                                className="flex items-center gap-1.5 rounded-md bg-primary/20 border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
                              >
                                <QrCode className="h-3.5 w-3.5" />
                                {waConnecting ? 'Starting...' : 'Connect WhatsApp'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {plugin.subSections && plugin.subSections.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-border/50 pt-2.5">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Sub-sections
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {plugin.subSections.map((sub) => (
                              <Link
                                key={sub.to}
                                to={sub.to}
                                className="group flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 p-2.5 transition-colors hover:border-border hover:bg-secondary/60"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground group-hover:text-primary">
                                      {sub.name}
                                    </span>
                                    {sub.status && (
                                      <Badge
                                        variant={sub.status === 'Active' ? 'success' : 'secondary'}
                                        className="text-[10px] py-0 px-1.5 h-4"
                                      >
                                        {sub.status}
                                      </Badge>
                                    )}
                                  </div>
                                  {sub.description && (
                                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                      {sub.description}
                                    </p>
                                  )}
                                </div>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {plugin.links && plugin.links.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {plugin.links.map((link) => (
                            <Link
                              key={link.to}
                              to={link.to}
                              className="flex items-center gap-1 rounded-full bg-secondary/80 px-2.5 py-1 text-xs font-medium hover:bg-secondary hover:text-foreground transition-colors"
                            >
                              {link.label} <ArrowRight className="h-3 w-3" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
