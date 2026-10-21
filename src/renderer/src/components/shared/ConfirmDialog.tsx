import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  destructive?: boolean
  onConfirm: () => void
}

/**
 * Reusable confirmation dialog for anything destructive or system-changing
 * — per the project's core safety rule ("always ask for confirmation
 * before deleting files, uninstalling software, changing important
 * settings, running admin commands"). Winget uninstall is the first user,
 * but Windows Controls and future features should reuse this too rather
 * than each building their own confirm UI.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  loading = false,
  destructive = false,
  onConfirm
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-fluent-lg">
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
            )}
            <div className="flex-1">
              <Dialog.Title className="font-display text-base font-semibold">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={loading}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={loading}
              onClick={onConfirm}
            >
              {loading ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}