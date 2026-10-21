import { useEffect, useState } from 'react'
import { BrainCircuit, X } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import type { MemoryEntry } from '@shared/types'

/**
 * Flame's persistent memory — moved here from Flame's chat settings
 * panel so there's one place memory lives, not two (per project rule:
 * no duplicate systems). Say "remember that..." in Chat to add entries.
 */
export default function Memory(): React.JSX.Element {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = (): void => {
    if (!window.api?.memory) return
    window.api.memory.list().then(setMemories).catch(() => setMemories([])).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const remove = async (id: string): Promise<void> => {
    if (!window.api?.memory) return
    setMemories(await window.api.memory.remove(id))
  }

  return (
    <div>
      <PageHeader title="Memory" description='Structured facts Flame remembers — say "remember that…" in Chat to add more.' />

      {!loading && memories.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/50 py-16 text-center">
          <BrainCircuit className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Nothing remembered yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try saying something like &quot;remember that I prefer dark mode&quot; in Chat.
            </p>
          </div>
        </div>
      )}

      {memories.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {memories.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{m.text}</span>
                <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
