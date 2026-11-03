import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe,
  FolderTree,
  Terminal,
  MessageSquare,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Server,
  Monitor
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface McpServerInfo {
  id: string
  name: string
  online: boolean
  tools: string[]
  toolCount: number
}

const SERVER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  computer: Monitor,
  'flame-computer-use': Monitor,
  'computer-use': Monitor,
  browser: Globe,
  'flame-browser': Globe,
  files: FolderTree,
  filesystem: FolderTree,
  'flame-filesystem': FolderTree,
  os: Terminal,
  oscontrol: Terminal,
  'flame-os': Terminal,
  whatsapp: MessageSquare,
  'flame-whatsapp': MessageSquare
}

function getIcon(nameOrId: string): React.ComponentType<{ className?: string }> {
  const key = nameOrId.toLowerCase().replace(/[^a-z]/g, '')
  for (const [k, Icon] of Object.entries(SERVER_ICONS)) {
    if (key.includes(k) || k.includes(key)) return Icon
  }
  return Server
}

export function McpServerStatusPills(): React.JSX.Element {
  const [servers, setServers] = useState<McpServerInfo[]>([
    { id: 'flame-computer-use', name: 'Computer Use', online: true, tools: ['computer.capture_screen', 'computer.pointer_action', 'computer.keyboard_input', 'computer.window_control'], toolCount: 4 },
    { id: 'flame-browser', name: 'Browser', online: true, tools: ['browser.open_url', 'browser.search_and_open', 'browser.automate_page'], toolCount: 3 },
    { id: 'flame-filesystem', name: 'Files', online: true, tools: ['fs.explore_directory', 'fs.search_files', 'fs.read_write_edit', 'fs.clean_temp'], toolCount: 4 },
    { id: 'flame-os', name: 'OS', online: true, tools: ['os.run_powershell', 'os.manage_processes', 'os.clipboard'], toolCount: 3 },
    { id: 'flame-whatsapp', name: 'WhatsApp', online: true, tools: ['whatsapp.send_message', 'whatsapp.get_archived_media', 'whatsapp.sync_brain_memory'], toolCount: 3 }
  ])
  const [reconnectingId, setReconnectingId] = useState<string | null>(null)
  const [hoveredServer, setHoveredServer] = useState<string | null>(null)

  const fetchStatus = async (): Promise<void> => {
    try {
      const electron = (window as unknown as { electron?: { ipcRenderer: { invoke: (ch: string, ...args: unknown[]) => Promise<McpServerInfo[]> } } })?.electron
      const result = await electron?.ipcRenderer?.invoke('mcp:get-status')
      if (Array.isArray(result) && result.length > 0) {
        setServers(result)
      }
    } catch {
      // Keep optimistic defaults
    }
  }

  useEffect(() => {
    void fetchStatus()
    const timer = setInterval(() => {
      void fetchStatus()
    }, 8000)
    return () => clearInterval(timer)
  }, [])

  const handleReconnect = async (e: React.MouseEvent, server: McpServerInfo): Promise<void> => {
    e.stopPropagation()
    setReconnectingId(server.id)
    try {
      const electron = (window as unknown as { electron?: { ipcRenderer: { invoke: (ch: string, ...args: unknown[]) => Promise<McpServerInfo[]> } } })?.electron
      const result = await electron?.ipcRenderer?.invoke('mcp:reconnect-server', server.id)
      if (Array.isArray(result)) {
        setServers(result)
      } else {
        await fetchStatus()
      }
    } catch (err) {
      console.error('[MCP Pills] Reconnect failed:', err)
    } finally {
      setTimeout(() => setReconnectingId(null), 800)
    }
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
      {servers.map((s) => {
        const IconComponent = getIcon(s.id || s.name)
        const isReconnecting = reconnectingId === s.id
        const isHovered = hoveredServer === s.id

        return (
          <div
            key={s.id}
            className="relative"
            onMouseEnter={() => setHoveredServer(s.id)}
            onMouseLeave={() => setHoveredServer(null)}
          >
            <motion.div
              layout
              className={cn(
                'group flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all select-none',
                s.online
                  ? 'border-border/60 bg-muted/40 hover:bg-muted/70 text-foreground/90'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              )}
            >
              {/* Status indicator dot */}
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                {s.online && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-1.5 w-1.5 rounded-full',
                    s.online ? 'bg-emerald-500' : 'bg-rose-500'
                  )}
                />
              </span>

              <IconComponent className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />

              <span className="font-semibold">{s.name}</span>

              {s.toolCount > 0 && (
                <span className="rounded bg-background/80 px-1 py-0.2 text-[9px] text-muted-foreground border border-border/40 font-mono">
                  {s.toolCount}
                </span>
              )}

              {/* One-click reconnect button */}
              <button
                type="button"
                onClick={(e) => handleReconnect(e, s)}
                disabled={isReconnecting}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground transition-all"
                title={`Reconnect ${s.name} MCP server`}
                aria-label={`Reconnect ${s.name}`}
              >
                <RotateCcw
                  className={cn('h-2.5 w-2.5', isReconnecting && 'animate-spin text-amber-500')}
                />
              </button>
            </motion.div>

            {/* Hover Tooltip / Detail Popover */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full z-50 mt-1.5 w-48 rounded-lg border border-border/80 bg-popover/95 p-2 shadow-xl backdrop-blur-md text-[11px]"
                >
                  <div className="flex items-center justify-between border-b border-border/50 pb-1 mb-1.5">
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <IconComponent className="h-3 w-3 text-primary" /> {s.name} Server
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-0.5 text-[9px] font-medium px-1 rounded',
                        s.online
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-rose-500/10 text-rose-500'
                      )}
                    >
                      {s.online ? (
                        <>
                          <CheckCircle2 className="h-2.5 w-2.5" /> Online
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-2.5 w-2.5" /> Offline
                        </>
                      )}
                    </span>
                  </div>

                  <div className="text-[10px] text-muted-foreground mb-1">
                    Registered MCP Tools:
                  </div>

                  <div className="space-y-0.5 max-h-28 overflow-y-auto pr-1">
                    {s.tools.map((t) => (
                      <div
                        key={t}
                        className="rounded px-1.5 py-0.5 bg-muted/50 font-mono text-[9px] text-foreground/80 truncate"
                        title={t}
                      >
                        {t}
                      </div>
                    ))}
                    {s.tools.length === 0 && (
                      <div className="text-[10px] italic text-muted-foreground">
                        No tools discovered
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
