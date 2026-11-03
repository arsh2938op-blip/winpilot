import { useEffect, useState } from 'react'
import {
  Workflow,
  Plus,
  Play,
  Loader2,
  Trash2,
  Pencil,
  Terminal,
  ExternalLink,
  Power,
  Focus,
  Sparkles,
  X,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { PlaceholderCard } from '@renderer/components/shared/PlaceholderCard'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { Combo, ComboStep, ComboProgressEvent, ComboActionType } from '@shared/types'
import { parseMacroSteps } from '@shared/combosParser'

export default function Combos(): React.JSX.Element {
  const [combos, setCombos] = useState<Combo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Execution state
  const [runningComboId, setRunningComboId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ComboProgressEvent | null>(null)
  const [lastRunNotice, setLastRunNotice] = useState<{
    comboId: string
    success: boolean
    message: string
  } | null>(null)

  // Edit / Create Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingComboId, setEditingComboId] = useState<string | null>(null)
  const [comboName, setComboName] = useState('')
  const [comboDesc, setComboDesc] = useState('')
  const [comboToDo, setComboToDo] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Combo | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadCombos = async (): Promise<void> => {
    if (!window.api?.combos) return
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.combos.list()
      setCombos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Combos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCombos()

    if (!window.api?.combos?.onProgress) return
    const unsubscribe = window.api.combos.onProgress((evt: ComboProgressEvent) => {
      setProgress(evt)
      if (evt.status === 'success' || evt.status === 'error') {
        setLastRunNotice({
          comboId: evt.comboId,
          success: evt.status === 'success',
          message: evt.message
        })
        setTimeout(() => {
          setProgress(null)
        }, 3000)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleOpenCreate = (): void => {
    setEditingComboId(null)
    setComboName('')
    setComboDesc('')
    setComboToDo('')
    setDialogOpen(true)
  }

  const handleOpenEdit = (combo: Combo): void => {
    setEditingComboId(combo.id)
    setComboName(combo.name)
    setComboDesc(combo.description || '')
    setComboToDo(combo.toDo || combo.steps.map((s) => s.target).join(', '))
    setDialogOpen(true)
  }

  const handleInsertQuickMacro = (text: string): void => {
    setComboToDo((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return text
      if (trimmed.endsWith(',') || trimmed.endsWith(';')) return `${trimmed} ${text}`
      return `${trimmed}, ${text}`
    })
  }

  const handleSaveCombo = async (): Promise<void> => {
    if (!window.api?.combos || !comboName.trim()) return
    setSaving(true)
    try {
      const parsedSteps = parseMacroSteps(comboToDo)
      const saved = await window.api.combos.save({
        id: editingComboId || undefined,
        name: comboName.trim(),
        description: comboDesc.trim() || undefined,
        toDo: comboToDo.trim(),
        steps: parsedSteps
      })
      setCombos((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = saved
          return next
        }
        return [...prev, saved]
      })
      setDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save combo.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCombo = async (): Promise<void> => {
    if (!window.api?.combos || !deleteTarget) return
    setDeleting(true)
    try {
      await window.api.combos.delete(deleteTarget.id)
      setCombos((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete combo.')
    } finally {
      setDeleting(false)
    }
  }

  const handleRunCombo = async (combo: Combo): Promise<void> => {
    if (!window.api?.combos || runningComboId) return
    setRunningComboId(combo.id)
    setLastRunNotice(null)
    setProgress({
      comboId: combo.id,
      stepIndex: 0,
      totalSteps: combo.steps.length,
      stepTarget: combo.name,
      status: 'running',
      message: `Starting "${combo.name}"...`
    })

    try {
      const res = await window.api.combos.execute(combo.id)
      setLastRunNotice({
        comboId: combo.id,
        success: res.success,
        message: res.message
      })
      await loadCombos()
    } catch (err) {
      setLastRunNotice({
        comboId: combo.id,
        success: false,
        message: err instanceof Error ? err.message : 'Execution failed.'
      })
    } finally {
      setRunningComboId(null)
    }
  }

  // Live parsed preview of steps in dialog
  const previewSteps = parseMacroSteps(comboToDo)

  return (
    <div>
      <PageHeader
        title="Combos"
        description="Automate repetitive desktop tasks by chaining actions into reusable one-click macro sequences."
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            New Combo
          </Button>
        }
      />

      {/* Real-time execution progress banner */}
      {progress && (
        <Card className="mb-4 border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between p-3.5 text-sm">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <div>
                <p className="font-semibold text-foreground">
                  Running Combo: {progress.stepTarget}
                </p>
                <p className="text-xs text-muted-foreground">{progress.message}</p>
              </div>
            </div>
            {progress.totalSteps > 0 && (
              <Badge variant="secondary" className="font-mono text-xs">
                Step {progress.stepIndex} of {progress.totalSteps}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Completion feedback */}
      {lastRunNotice && !progress && (
        <Card
          className={cn(
            'mb-4 border',
            lastRunNotice.success
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-destructive/40 bg-destructive/10'
          )}
        >
          <CardContent className="flex items-center justify-between p-3 text-sm">
            <div className="flex items-center gap-2">
              {lastRunNotice.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <span className={lastRunNotice.success ? 'text-emerald-300' : 'text-destructive'}>
                {lastRunNotice.message}
              </span>
            </div>
            <button
              onClick={() => setLastRunNotice(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {loading && combos.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Combos...
        </div>
      ) : combos.length === 0 ? (
        <PlaceholderCard
          icon={Workflow}
          title="No combos yet"
          description="Create your first combo like 'Game Mode' (Open sk launcher, launch minecraft, close yourself) to trigger multiple desktop actions with one click."
        >
          <Button onClick={handleOpenCreate} className="mt-2">
            <Plus className="h-4 w-4" /> Create Combo
          </Button>
        </PlaceholderCard>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {combos.map((combo) => {
            const isRunning = runningComboId === combo.id
            const steps = combo.steps && combo.steps.length > 0
              ? combo.steps
              : parseMacroSteps(combo.toDo || '')

            return (
              <Card key={combo.id} className="overflow-hidden transition-all hover:border-border/80">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Workflow className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground text-base leading-none">
                            {combo.name}
                          </h3>
                          {combo.description && (
                            <p className="mt-1 text-xs text-muted-foreground">{combo.description}</p>
                          )}
                        </div>
                      </div>

                      {combo.toDo && (
                        <div className="mt-3 rounded bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground font-mono">
                          <span className="text-primary/70 font-sans font-medium uppercase text-[10px] tracking-wider block">
                            Sequence:
                          </span>
                          {combo.toDo}
                        </div>
                      )}

                      {/* Visual Step Pills */}
                      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                        {steps.map((step, idx) => (
                          <div key={step.id || idx} className="flex items-center">
                            <div
                              className={cn(
                                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
                                step.action === 'system_command'
                                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                  : step.action === 'focus_window'
                                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                                  : step.action === 'command'
                                  ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                                  : 'border-border bg-secondary/50 text-foreground'
                              )}
                            >
                              <StepIcon action={step.action} target={step.target} />
                              <span className="truncate max-w-[140px]">{step.target}</span>
                            </div>
                            {idx < steps.length - 1 && (
                              <span className="mx-1 text-muted-foreground text-xs">→</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {combo.lastRunAt && (
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          Last run: {new Date(combo.lastRunAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 sm:self-center">
                      <Button
                        size="sm"
                        disabled={isRunning || !!runningComboId}
                        onClick={() => handleRunCombo(combo)}
                      >
                        {isRunning ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current" />
                        )}
                        {isRunning ? 'Running…' : 'Run'}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isRunning}
                        onClick={() => handleOpenEdit(combo)}
                        title="Edit combo"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isRunning}
                        onClick={() => setDeleteTarget(combo)}
                        title="Delete combo"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* New / Edit Combo Dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-fluent-lg">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <Dialog.Title className="text-base font-semibold text-foreground flex items-center gap-2">
                <Workflow className="h-4 w-4 text-primary" />
                {editingComboId ? 'Edit Combo' : 'Create New Combo'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded p-1 text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Combo Name
                </label>
                <Input
                  value={comboName}
                  onChange={(e) => setComboName(e.target.value)}
                  placeholder="e.g. Game Mode, Dev Session"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Description (optional)
                </label>
                <Input
                  value={comboDesc}
                  onChange={(e) => setComboDesc(e.target.value)}
                  placeholder="What does this combo do?"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    To Do / Sequence Actions
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    Comma or newline separated
                  </span>
                </div>
                <textarea
                  value={comboToDo}
                  onChange={(e) => setComboToDo(e.target.value)}
                  placeholder="e.g. Open sk launcher, launch minecraft, close yourself"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />

                {/* Quick-insert Macro Pills */}
                <div className="mt-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    Special System Commands (click to insert):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleInsertQuickMacro('close yourself')}
                      className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 transition-colors"
                      title="Shuts down FlameAGI entirely"
                    >
                      + close yourself
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertQuickMacro('close flame')}
                      className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 transition-colors"
                      title="Closes the main Flame interface"
                    >
                      + close flame
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertQuickMacro('close pet mode')}
                      className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 transition-colors"
                      title="Terminates Pet Mode companion"
                    >
                      + close pet mode
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertQuickMacro('focus <app>')}
                      className="rounded bg-blue-500/10 border border-blue-500/30 px-2 py-1 text-[11px] font-mono text-blue-300 hover:bg-blue-500/20 transition-colors"
                      title="Brings window to front"
                    >
                      + focus &lt;app&gt;
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time Parsed Preview */}
              {previewSteps.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Live Parsed Step Execution ({previewSteps.length})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {previewSteps.map((s, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded bg-card/60 border border-border/50 px-2.5 py-1 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground w-4">
                            {idx + 1}.
                          </span>
                          <StepIcon action={s.action} target={s.target} />
                          <span className="font-medium">{s.target}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {s.action}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSaveCombo} disabled={saving || !comboName.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {editingComboId ? 'Save Changes' : 'Create Combo'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete combo "${deleteTarget?.name}"?`}
        description="Are you sure you want to remove this automation combo? This action cannot be undone."
        confirmLabel="Delete Combo"
        destructive
        loading={deleting}
        onConfirm={handleDeleteCombo}
      />
    </div>
  )
}

function StepIcon({ action, target }: { action: ComboActionType; target: string }): React.JSX.Element {
  if (action === 'system_command' || target.includes('close')) {
    return <Power className="h-3.5 w-3.5 text-amber-400 shrink-0" />
  }
  if (action === 'focus_window') {
    return <Focus className="h-3.5 w-3.5 text-blue-400 shrink-0" />
  }
  if (action === 'command') {
    return <Terminal className="h-3.5 w-3.5 text-purple-400 shrink-0" />
  }
  return <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
}

