import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Network, RefreshCw, Save, Loader2, ShieldCheck, Terminal, Sparkles, Flame,
  CheckCircle2, XCircle, Route, KeyRound
} from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import type {
  AiEndpointKind,
  AiNetworkEndpoint,
  AiNetworkEndpointState,
  AiNetworkSnapshot
} from '@shared/types'

const KIND_META: Record<AiEndpointKind, { icon: typeof Flame; label: string; blurb: string }> = {
  ollama: {
    icon: Flame,
    label: 'Flame · local',
    blurb: 'Reflex triage and local chat through Ollama.'
  },
  opencode: {
    icon: Terminal,
    label: 'OpenCode · coding',
    blurb: 'Agentic edits over HTTP or the local CLI.'
  },
  gemini: {
    icon: Sparkles,
    label: 'Gemini · cloud',
    blurb: 'Heavy reasoning, planning and code questions.'
  }
}

function statusFor(states: AiNetworkEndpointState[], id: string): AiNetworkEndpointState | undefined {
  return states.find((state) => state.id === id)
}

export default function AiNetwork(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AiNetworkSnapshot | null>(null)
  const [draft, setDraft] = useState<AiNetworkEndpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setNotice(null)
    try {
      const next = await window.api.aiNetwork.getSnapshot()
      setSnapshot(next)
      setDraft(next.config.endpoints)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = useCallback((id: string, changes: Partial<AiNetworkEndpoint>): void => {
    setDraft((prev) => prev.map((endpoint) => (endpoint.id === id ? { ...endpoint, ...changes } : endpoint)))
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    setNotice(null)
    try {
      await window.api.aiNetwork.updateConfig({ endpoints: draft })
      await load()
      setNotice('Saved. The router reads this file before the next Task run.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const test = async (endpoint: AiNetworkEndpoint): Promise<void> => {
    setTesting(endpoint.id)
    try {
      const result = await window.api.aiNetwork.testEndpoint(endpoint.id)
      setTestResults((prev) => ({ ...prev, [endpoint.id]: result }))
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [endpoint.id]: { success: false, message: err instanceof Error ? err.message : String(err) }
      }))
    } finally {
      setTesting(null)
    }
  }

  const dirty = useMemo(() => {
    if (!snapshot) return false
    return JSON.stringify(snapshot.config.endpoints) !== JSON.stringify(draft)
  }, [snapshot, draft])

  const states = snapshot?.endpoints ?? []
  const guards = snapshot?.config.guards

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Network"
        description="The collaborators Flame can call in Task mode. Everything on this page is read from and written to .flame/coder_config.json."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-muted-foreground">
          <Network className="h-3.5 w-3.5" />
          {draft.length} endpoint{draft.length === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-muted-foreground">
          <Route className="h-3.5 w-3.5" />
          Task route: {snapshot?.config.routing.task.join(' → ') || '—'}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Guards: {guards?.ast ? 'AST on' : 'AST off'} · max {guards?.maxFilesPerRun ?? '—'} files
        </span>
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
            snapshot?.taskMode
              ? 'bg-amber-500/15 text-amber-400'
              : 'border border-border bg-muted/40 text-muted-foreground'
          )}
        >
          {snapshot?.taskMode ? 'Task mode active' : 'Chat mode active'}
        </span>
      </div>

      {notice && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {notice}
        </div>
      )}

      {loading && !snapshot ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the network configuration…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {draft.map((endpoint) => {
            const meta = KIND_META[endpoint.kind] ?? KIND_META.ollama
            const Icon = meta.icon
            const state = statusFor(states, endpoint.id)
            const result = testResults[endpoint.id] ?? (state ? { success: state.online, message: state.detail } : undefined)

            return (
              <Card key={endpoint.id} className={cn(!endpoint.enabled && 'opacity-60')}>
                <CardHeader className="gap-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <CardTitle>{endpoint.label}</CardTitle>
                        <CardDescription className="text-[11px]">{meta.blurb}</CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={endpoint.enabled}
                      onCheckedChange={(checked) => patch(endpoint.id, { enabled: checked })}
                      aria-label={`Enable ${endpoint.label}`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {endpoint.roles.map((role) => (
                      <span key={role} className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {role}
                      </span>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Model</span>
                    <Input
                      value={endpoint.model}
                      placeholder={endpoint.kind === 'opencode' ? 'OpenCode default' : 'model id'}
                      onChange={(event) => patch(endpoint.id, { model: event.target.value })}
                      className="h-8 text-xs"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {endpoint.kind === 'opencode' ? 'HTTP base URL (blank = CLI)' : 'Base URL'}
                    </span>
                    <Input
                      value={endpoint.baseUrl}
                      placeholder={endpoint.kind === 'ollama' ? 'http://127.0.0.1:11434' : 'https://…'}
                      onChange={(event) => patch(endpoint.id, { baseUrl: event.target.value })}
                      className="h-8 text-xs"
                    />
                  </label>

                  {endpoint.kind === 'opencode' && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Transport</span>
                      <div className="flex gap-1">
                        {(['auto', 'http', 'cli'] as const).map((transport) => (
                          <button
                            key={transport}
                            onClick={() => patch(endpoint.id, { transport })}
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                              (endpoint.transport ?? 'auto') === transport
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {transport}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => void test(endpoint)}
                      disabled={testing === endpoint.id || !endpoint.enabled}
                    >
                      {testing === endpoint.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Test
                    </Button>
                    {result && (
                      <span
                        className={cn(
                          'flex min-w-0 items-center gap-1 text-[11px]',
                          result.success ? 'text-emerald-400' : 'text-destructive'
                        )}
                        title={result.message}
                      >
                        {result.success ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{result.message}</span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4" /> Task-mode guards
          </CardTitle>
          <CardDescription>
            Enforced by the main process on every Task run — before a single change is kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>TypeScript/JavaScript AST parse + JSON parse for every touched file.</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>Electron boundary rules: renderer cannot import electron or main-process code.</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>Protected paths: {guards?.protectedGlobs.length ?? 0} patterns (node_modules, .git, .flame, build output, lockfiles).</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>Rejected runs are restored byte-for-byte from the run snapshot; kept runs roll back with “rollback”.</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4" /> Configuration source
          </CardTitle>
          <CardDescription>
            Endpoints, routing and guards live here. API keys never do — the Gemini endpoint only names the env var that may hold one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="rounded bg-muted/50 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
            {snapshot?.config.configPath ?? '.flame/coder_config.json'}
          </div>
          <div className="flex flex-wrap gap-2 text-muted-foreground">
            <span className="rounded bg-muted px-2 py-0.5">chat: {snapshot?.config.routing.chat.join(' → ') || '—'}</span>
            <span className="rounded bg-muted px-2 py-0.5">task: {snapshot?.config.routing.task.join(' → ') || '—'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
