import { useEffect, useState } from 'react'
import { FolderKanban, ExternalLink, Plus, Trash2, BrainCircuit } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import type { ImportedProject, MemoryEntry } from '@shared/types'

export default function Projects(): React.JSX.Element {
  const [projects, setProjects] = useState<ImportedProject[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [memories, setMemories] = useState<MemoryEntry[]>([])

  useEffect(() => {
    window.api?.projects?.list().then(setProjects)
    window.api?.project?.get().then((p) => setActivePath(p.path))
    window.api?.memory?.list().then(setMemories).catch(() => {})
  }, [])

  const importProject = async (): Promise<void> => {
    const next = await window.api?.projects?.import()
    if (next) setProjects(next)
  }

  const remove = async (id: string): Promise<void> => {
    const next = await window.api?.projects?.remove(id)
    if (next) setProjects(next)
  }

  const togglePermission = async (p: ImportedProject, key: keyof ImportedProject['permissions']): Promise<void> => {
    const permissions = { ...p.permissions, [key]: !p.permissions[key] }
    const next = await window.api?.projects?.setPermissions(p.id, permissions)
    if (next) setProjects(next)
  }

  const setActive = async (p: ImportedProject): Promise<void> => {
    await window.api?.projects?.setActive(p.path)
    setActivePath(p.path)
  }

  const openInVsCode = async (): Promise<void> => {
    const result = await window.api?.project?.openInVsCode()
    setStatus(result?.message ?? null)
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Projects Flame is allowed to work on."
        actions={<Button onClick={importProject}><Plus className="h-4 w-4" /> Import Projects</Button>}
      />

      {projects.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/50 py-16 text-center">
          <FolderKanban className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No projects imported yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((p) => (
          <Card key={p.id} className={cn(activePath === p.path && 'border-primary')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.path}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activePath === p.path ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">Active</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setActive(p)}>Set Active</Button>
                  )}
                  {activePath === p.path && (
                    <Button size="sm" variant="outline" onClick={openInVsCode}>
                      <ExternalLink className="h-3.5 w-3.5" /> VS Code
                    </Button>
                  )}
                  <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex gap-4 border-t border-border pt-3 text-xs">
                {(['read', 'write', 'execute'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1.5 capitalize">
                    <Switch checked={p.permissions[key]} onCheckedChange={() => togglePermission(p, key)} />
                    {key}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {status && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}

      <Card className="mt-4">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Flame&apos;s memory ({memories.length})</p>
            </div>
            <Link to="/memory" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {memories.slice(0, 5).map((m) => (
              <div key={m.id} className="rounded-md bg-muted px-2.5 py-1.5 text-xs">{m.text}</div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
