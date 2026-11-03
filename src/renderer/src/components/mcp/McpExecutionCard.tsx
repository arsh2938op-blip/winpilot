import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe,
  FolderTree,
  Terminal,
  MessageSquare,
  CheckCircle2,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Cpu,
  Monitor
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface McpExecutionStep {
  tool: string
  status: 'running' | 'completed' | 'error'
  durationMs?: number
  input?: Record<string, unknown>
  output?: string
  error?: string
}

function getToolMeta(toolName: string): { label: string; icon: React.ComponentType<{ className?: string }>; categoryColor: string } {
  const lower = toolName.toLowerCase()
  if (lower.startsWith('computer.')) {
    return { label: toolName, icon: Monitor, categoryColor: 'text-rose-400 border-rose-500/30 bg-rose-500/10' }
  }
  if (lower.startsWith('browser.')) {
    return { label: toolName, icon: Globe, categoryColor: 'text-sky-400 border-sky-500/30 bg-sky-500/10' }
  }
  if (lower.startsWith('fs.')) {
    return { label: toolName, icon: FolderTree, categoryColor: 'text-amber-400 border-amber-500/30 bg-amber-500/10' }
  }
  if (lower.startsWith('os.')) {
    return { label: toolName, icon: Terminal, categoryColor: 'text-purple-400 border-purple-500/30 bg-purple-500/10' }
  }
  if (lower.startsWith('whatsapp.')) {
    return { label: toolName, icon: MessageSquare, categoryColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' }
  }
  return { label: toolName, icon: Cpu, categoryColor: 'text-primary border-primary/30 bg-primary/10' }
}

export function McpExecutionCard({
  step,
  defaultExpanded = false
}: {
  step: McpExecutionStep
  defaultExpanded?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const meta = getToolMeta(step.tool)
  const IconComponent = meta.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'my-2 overflow-hidden rounded-xl border bg-card/80 backdrop-blur-md transition-all shadow-sm',
        step.status === 'running'
          ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/20'
          : step.status === 'completed'
            ? 'border-border/60 hover:border-border'
            : 'border-destructive/40 bg-destructive/5'
      )}
    >
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs', meta.categoryColor)}>
            <IconComponent className="h-3.5 w-3.5" />
          </span>

          <div className="flex items-center gap-1.5 truncate">
            <span className="font-mono text-xs font-semibold text-foreground truncate">
              {step.tool}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
              MCP
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {step.status === 'running' && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              <span className="text-[11px]">Running...</span>
            </span>
          )}

          {step.status === 'completed' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              {step.durationMs !== undefined && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {step.durationMs}ms
                </span>
              )}
            </span>
          )}

          {step.status === 'error' && (
            <span className="flex items-center gap-1 text-xs text-destructive font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-[11px]">Error</span>
            </span>
          )}

          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </motion.div>
        </div>
      </button>

      {/* Collapsible live detail drawer */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50 bg-background/50 px-3 py-2.5 text-xs"
          >
            {step.input && Object.keys(step.input).length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Parameters
                </div>
                <pre className="rounded-md bg-muted/50 p-2 font-mono text-[11px] text-foreground/90 overflow-x-auto max-h-36">
                  {JSON.stringify(step.input, null, 2)}
                </pre>
              </div>
            )}

            {step.output && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Output / Result
                </div>
                <pre className="rounded-md bg-muted/60 p-2 font-mono text-[11px] text-foreground/90 overflow-x-auto max-h-48 whitespace-pre-wrap">
                  {step.output}
                </pre>
              </div>
            )}

            {step.error && (
              <div className="rounded-md bg-destructive/10 p-2 text-destructive font-mono text-[11px]">
                {step.error}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
