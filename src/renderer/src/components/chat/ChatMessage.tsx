import React from 'react'
import {
  Zap,
  Pencil,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ShieldCheck,
  Download,
  ExternalLink,
  ZoomIn,
  Package
} from 'lucide-react'
import { FlameIcon } from '@renderer/components/shared/FlameIcon'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { LightboxImage } from '@renderer/components/shared/ImageLightbox'
import type { TaskRunResult, AiPendingAction } from '@shared/types'

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  at?: number
  tookMs?: number
  actionSuccess?: boolean
  agent?: 'flame' | 'gemini'
  isQueued?: boolean
  queueIndex?: number
  isError?: boolean
  task?: TaskRunResult
  pendingAction?: AiPendingAction
  pendingResolved?: boolean
  promptArtifact?: { forTool: string; prompt: string }
  images?: LightboxImage[]
  generatedImage?: {
    dataUri?: string
    filePath?: string
    prompt: string
    fileName?: string
  }
}

export interface ChatMessageProps {
  message: ChatMessageData
  editingId?: string | null
  editDraft?: string
  copiedId?: string | null
  resolvingId?: string | null
  onEditChange?: (val: string) => void
  onSaveEdit?: (id: string) => void
  onCancelEdit?: () => void
  onStartEdit?: (id: string, text: string) => void
  onCopyText?: (id: string, text: string) => void
  onRetry?: (text: string) => void
  onOpenLightbox?: (image: LightboxImage) => void
  onResolvePendingAction?: (message: ChatMessageData, approve: boolean) => void
  onApplyHeal?: (message: ChatMessageData) => void
  renderBody?: (text: string) => React.ReactNode
}

function formatTime(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatMessage({
  message: m,
  editingId,
  editDraft = '',
  copiedId,
  resolvingId,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onCopyText,
  onRetry,
  onOpenLightbox,
  onResolvePendingAction,
  onApplyHeal,
  renderBody
}: ChatMessageProps): React.JSX.Element {
  const displayImages: LightboxImage[] = (m.images && m.images.length > 0)
    ? m.images
    : (m.generatedImage?.dataUri ? [{
        src: m.generatedImage.dataUri,
        caption: m.generatedImage.prompt,
        filePath: m.generatedImage.filePath,
        fileName: m.generatedImage.fileName
      }] : [])

  return (
    <div className={cn('flex items-end gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
      {m.role !== 'user' && (
        m.agent === 'gemini' ? (
          <span className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Zap className="h-3.5 w-3.5" />
          </span>
        ) : (
          <FlameIcon size={20} className="mb-1" />
        )
      )}
      <div className="group max-w-[80%]">
        {m.isQueued && (
          <div className="mb-1.5 flex items-center justify-end gap-1.5 text-[11px] font-medium text-amber-400">
            <Clock className="h-3 w-3 animate-pulse" />
            <span>Due • Queued #{m.queueIndex || 1} (executes once Flame is ready)</span>
          </div>
        )}
        {m.agent === 'gemini' && <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">Gemini</p>}

        <div className={cn(
          'relative rounded-2xl px-3.5 py-2 text-sm',
          m.role === 'user' ? 'bg-primary text-primary-foreground'
            : m.role === 'system' ? 'bg-muted text-muted-foreground italic'
            : m.actionSuccess === false ? 'bg-destructive/10 text-destructive'
            : 'bg-secondary text-secondary-foreground'
        )}>
          {editingId === m.id ? (
            <div className="flex flex-col gap-2 py-1">
              <Input
                value={editDraft}
                onChange={(e) => onEditChange?.(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSaveEdit?.(m.id)}
                className="bg-background text-foreground text-xs"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onSaveEdit?.(m.id)}>Save &amp; resend</Button>
                <Button size="sm" variant="outline" onClick={() => onCancelEdit?.()}>Cancel</Button>
              </div>
            </div>
          ) : (
            renderBody ? renderBody(m.text) : <p className="whitespace-pre-wrap">{m.text}</p>
          )}

          {/* Inline Image Rendering Gallery */}
          {displayImages.length > 0 && (
            <div className="my-2.5 space-y-2">
              {displayImages.map((img, idx) => (
                <div
                  key={idx}
                  className="group/img relative max-w-[400px] overflow-hidden rounded-[10px] border border-[rgba(255,140,0,0.3)] bg-black/40 shadow-md backdrop-blur-sm transition-all duration-200 hover:border-[rgba(255,140,0,0.6)]"
                >
                  <div
                    className="relative flex items-center justify-center bg-black/25 overflow-hidden cursor-zoom-in min-h-[120px] max-h-[300px]"
                    onClick={() => onOpenLightbox?.(img)}
                  >
                    <img
                      src={img.src}
                      alt={img.caption || img.fileName || 'Image asset'}
                      className="w-full h-auto max-h-[300px] object-contain transition-transform duration-200 group-hover/img:scale-[1.02]"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                      <span className="flex items-center gap-1.5 rounded-full bg-black/75 backdrop-blur-md px-2.5 py-1 text-[11px] font-medium text-amber-400 border border-amber-500/40 shadow-sm">
                        <ZoomIn className="h-3 w-3" /> Click to Zoom
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-3 py-1.5 border-t border-[rgba(255,140,0,0.2)] bg-background/70 backdrop-blur-sm">
                    <span className="text-xs font-semibold text-foreground truncate max-w-[65%]" title={img.caption || img.fileName}>
                      {img.caption || img.fileName || 'Image Preview'}
                    </span>
                    <div className="flex items-center gap-1">
                      {img.filePath && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (img.filePath && window.api?.app?.openPath) {
                              window.api.app.openPath(img.filePath)
                            }
                          }}
                          className="flex items-center gap-1 rounded bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted transition-colors"
                          title="Open File in Windows"
                        >
                          <ExternalLink className="h-3 w-3" /> Open
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const a = document.createElement('a')
                          a.href = img.src
                          a.download = img.fileName || `flame-${Date.now()}.jpg`
                          a.click()
                        }}
                        className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 hover:bg-amber-500/30 transition-colors"
                        title="Download image"
                      >
                        <Download className="h-3 w-3" /> Save
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error Recovery / Self-Heal */}
          {m.role === 'assistant' && (m.actionSuccess === false || m.isError || m.text.includes('⚠️')) && !m.pendingAction && (
            <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                Issue detected
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2 py-0 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                onClick={() => onApplyHeal?.(m)}
                disabled={resolvingId === m.id}
              >
                <ShieldCheck className="h-3 w-3 mr-1" />
                {resolvingId === m.id ? 'Healing...' : 'Self-Heal'}
              </Button>
            </div>
          )}

          {/* Pending Action Confirmation Card */}
          {m.pendingAction && !m.pendingResolved && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-foreground">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold capitalize">
                  Confirm {m.pendingAction.type}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {m.pendingAction.operationLabel || `Proceed with ${m.pendingAction.type}?`}
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onResolvePendingAction?.(m, false)}
                  disabled={resolvingId === m.id}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  onClick={() => onResolvePendingAction?.(m, true)}
                  disabled={resolvingId === m.id}
                >
                  {resolvingId === m.id ? 'Executing...' : 'Approve'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Message Footer Meta (time, tookMs, copy, edit, retry) */}
        <div className={cn(
          'mt-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground select-none',
          m.role === 'user' ? 'justify-end' : 'justify-start'
        )}>
          {m.at && <span>{formatTime(m.at)}</span>}
          {m.tookMs !== undefined && <span>• {m.tookMs}ms</span>}

          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={() => onCopyText?.(m.id, m.text)}
              className="rounded p-0.5 hover:bg-muted hover:text-foreground"
              title="Copy message"
            >
              {copiedId === m.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
            {m.role === 'user' && (
              <button
                type="button"
                onClick={() => onStartEdit?.(m.id, m.text)}
                className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                title="Edit message"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {m.role === 'assistant' && (
              <button
                type="button"
                onClick={() => onRetry?.(m.text)}
                className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                title="Regenerate"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

