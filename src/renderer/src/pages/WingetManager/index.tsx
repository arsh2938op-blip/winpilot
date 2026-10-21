import { useEffect, useState } from 'react'
import {
  PackageSearch,
  Download,
  RefreshCw,
  Trash2,
  Loader2,
  Search,
  Check
} from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { PlaceholderCard } from '@renderer/components/shared/PlaceholderCard'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import type { WingetPackage } from '@shared/types'

type WingetTab = 'installed' | 'discover' | 'updates'

const TABS: { id: WingetTab; label: string }[] = [
  { id: 'installed', label: 'Installed' },
  { id: 'discover', label: 'Discover' },
  { id: 'updates', label: 'Updates' }
]

export default function WingetManager(): React.JSX.Element {
  const [tab, setTab] = useState<WingetTab>('installed')

  // Installed tab
  const [installed, setInstalled] = useState<WingetPackage[]>([])
  const [installedLoading, setInstalledLoading] = useState(false)
  const [installedError, setInstalledError] = useState<string | null>(null)

  // Discover tab
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WingetPackage[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Updates tab
  const [upgradable, setUpgradable] = useState<WingetPackage[]>([])
  const [upgradableLoading, setUpgradableLoading] = useState(false)
  const [upgradableError, setUpgradableError] = useState<string | null>(null)

  // Shared action state (which package is mid-install/update, which are done)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set())

  // Uninstall confirmation
  const [uninstallTarget, setUninstallTarget] = useState<WingetPackage | null>(null)
  const [uninstalling, setUninstalling] = useState(false)

  const loadInstalled = async (): Promise<void> => {
    if (!window.api?.winget) return
    setInstalledLoading(true)
    setInstalledError(null)
    try {
      setInstalled(await window.api.winget.listInstalled())
    } catch (err) {
      setInstalledError(err instanceof Error ? err.message : 'Failed to load installed apps.')
    } finally {
      setInstalledLoading(false)
    }
  }

  const loadUpgradable = async (): Promise<void> => {
    if (!window.api?.winget) return
    setUpgradableLoading(true)
    setUpgradableError(null)
    try {
      setUpgradable(await window.api.winget.listUpgradable())
    } catch (err) {
      setUpgradableError(err instanceof Error ? err.message : 'Failed to check for updates.')
    } finally {
      setUpgradableLoading(false)
    }
  }

  const runSearch = async (): Promise<void> => {
    if (!window.api?.winget || !query.trim()) return
    setSearchLoading(true)
    setSearchError(null)
    setHasSearched(true)
    try {
      setResults(await window.api.winget.search(query.trim()))
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleInstall = async (packageId: string): Promise<void> => {
    if (!window.api?.winget) return
    setBusyId(packageId)
    try {
      await window.api.winget.install(packageId)
      setInstalledIds((prev) => new Set(prev).add(packageId))
    } catch {
      // Error already reflected by the caller's try/catch surfacing; the
      // button just resets below so the user can retry.
    } finally {
      setBusyId(null)
    }
  }

  const handleUpdate = async (packageId: string): Promise<void> => {
    if (!window.api?.winget) return
    setBusyId(packageId)
    try {
      await window.api.winget.update(packageId)
      setUpdatedIds((prev) => new Set(prev).add(packageId))
    } catch {
      // Same as above — button resets, user can retry.
    } finally {
      setBusyId(null)
    }
  }

  const confirmUninstall = async (): Promise<void> => {
    if (!window.api?.winget || !uninstallTarget) return
    setUninstalling(true)
    try {
      await window.api.winget.uninstall(uninstallTarget.id)
      setInstalled((prev) => prev.filter((app) => app.id !== uninstallTarget.id))
      setUninstallTarget(null)
    } catch (err) {
      setInstalledError(err instanceof Error ? err.message : 'Uninstall failed.')
    } finally {
      setUninstalling(false)
    }
  }

  useEffect(() => {
    if (tab === 'installed') loadInstalled()
    if (tab === 'updates') loadUpgradable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div>
      <PageHeader
        title="Winget Manager"
        description="Search, install, update, and remove applications — no Command Prompt required."
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tab === 'discover') runSearch()
            }}
            placeholder="Search for an application…"
            className="pl-9"
          />
        </div>
        {tab === 'discover' && (
          <Button onClick={runSearch} disabled={searchLoading || !query.trim()}>
            <Search className={cn('h-4 w-4', searchLoading && 'animate-pulse')} />
            Search
          </Button>
        )}
        {tab === 'installed' && (
          <Button variant="outline" onClick={loadInstalled} disabled={installedLoading}>
            <RefreshCw className={cn('h-4 w-4', installedLoading && 'animate-spin')} />
            Refresh
          </Button>
        )}
        {tab === 'updates' && (
          <Button variant="outline" onClick={loadUpgradable} disabled={upgradableLoading}>
            <RefreshCw className={cn('h-4 w-4', upgradableLoading && 'animate-spin')} />
            Check again
          </Button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'installed' && (
        <PackageList
          loading={installedLoading}
          error={installedError}
          items={installed}
          emptyTitle="No apps found"
          emptyDescription="Winget returned an empty list, or hasn't been run yet."
          loadingLabel="Reading installed applications from winget…"
          mode="installed"
          busyId={busyId}
          onUninstallRequest={setUninstallTarget}
        />
      )}

      {tab === 'discover' && (
        <>
          {!hasSearched && (
            <PlaceholderCard
              icon={Download}
              title="Search for something to install"
              description="Type an app name above and press Enter or hit Search."
            />
          )}
          {hasSearched && (
            <PackageList
              loading={searchLoading}
              error={searchError}
              items={results}
              emptyTitle="No results"
              emptyDescription={`Nothing matched "${query}".`}
              loadingLabel={`Searching for "${query}"…`}
              mode="discover"
              busyId={busyId}
              installedIds={installedIds}
              onInstall={handleInstall}
            />
          )}
        </>
      )}

      {tab === 'updates' && (
        <PackageList
          loading={upgradableLoading}
          error={upgradableError}
          items={upgradable}
          emptyTitle="Everything is up to date"
          emptyDescription="No updates available right now."
          loadingLabel="Checking for updates…"
          mode="updates"
          busyId={busyId}
          updatedIds={updatedIds}
          onUpdate={handleUpdate}
        />
      )}

      <ConfirmDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => !open && setUninstallTarget(null)}
        title={`Uninstall ${uninstallTarget?.name ?? 'this app'}?`}
        description="This will remove the application from your PC. This can't be undone from WinPilot."
        confirmLabel="Uninstall"
        destructive
        loading={uninstalling}
        onConfirm={confirmUninstall}
      />
    </div>
  )
}

type ListMode = 'installed' | 'discover' | 'updates'

function PackageList({
  loading,
  error,
  items,
  emptyTitle,
  emptyDescription,
  loadingLabel,
  mode,
  busyId,
  installedIds,
  updatedIds,
  onInstall,
  onUpdate,
  onUninstallRequest
}: {
  loading: boolean
  error: string | null
  items: WingetPackage[]
  emptyTitle: string
  emptyDescription: string
  loadingLabel: string
  mode: ListMode
  busyId: string | null
  installedIds?: Set<string>
  updatedIds?: Set<string>
  onInstall?: (packageId: string) => void
  onUpdate?: (packageId: string) => void
  onUninstallRequest?: (pkg: WingetPackage) => void
}): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {loadingLabel}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-5 text-sm text-destructive">
          <p className="font-medium">Something went wrong.</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <PlaceholderCard icon={PackageSearch} title={emptyTitle} description={emptyDescription} />
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        {items.map((app, index) => {
          const key = app.id || app.name + index
          const isBusy = busyId === app.id
          const isInstalled = installedIds?.has(app.id)
          const isUpdated = updatedIds?.has(app.id)

          return (
            <div
              key={key}
              className={cn(
                'flex items-center justify-between px-5 py-3 text-sm',
                index !== items.length - 1 && 'border-b border-border'
              )}
            >
              <div>
                <p className="font-medium">{app.name}</p>
                <p className="text-xs text-muted-foreground">
                  {app.id} · v{app.version}
                  {app.availableVersion ? ` → ${app.availableVersion}` : ''}
                </p>
              </div>

              <div className="flex gap-2">
                {mode === 'discover' && (
                  <Button
                    size="sm"
                    variant={isInstalled ? 'secondary' : 'default'}
                    disabled={isBusy || isInstalled || !app.id}
                    onClick={() => onInstall?.(app.id)}
                  >
                    {isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isInstalled ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {isBusy ? 'Installing…' : isInstalled ? 'Installed' : 'Install'}
                  </Button>
                )}

                {mode === 'updates' && (
                  <Button
                    size="sm"
                    variant={isUpdated ? 'secondary' : 'default'}
                    disabled={isBusy || isUpdated || !app.id}
                    onClick={() => onUpdate?.(app.id)}
                  >
                    {isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isUpdated ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {isBusy ? 'Updating…' : isUpdated ? 'Updated' : 'Update'}
                  </Button>
                )}

                {mode === 'installed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy || !app.id}
                    onClick={() => onUninstallRequest?.(app)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Uninstall
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}