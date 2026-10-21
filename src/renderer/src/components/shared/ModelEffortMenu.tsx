import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { ChatModelId } from '@shared/types'

const MODELS: { id: ChatModelId; label: string }[] = [
  { id: 'gemma', label: 'Gemma' },
  { id: 'gemini', label: 'Gemini' }
]

export const EFFORTS = ['auto', 'low', 'medium', 'high'] as const
export type EffortChoice = (typeof EFFORTS)[number]

interface Props {
  model: ChatModelId
  onModelChange: (m: ChatModelId) => void
  effort: EffortChoice
  onEffortChange: (e: EffortChoice) => void
}

export function ModelEffortMenu({ model, onModelChange, effort, onEffortChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model
  const effortLabel = effort === 'auto' ? 'Auto' : effort[0].toUpperCase() + effort.slice(1)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
      >
        {modelLabel} <span className="opacity-50">·</span> {effortLabel}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-44 rounded-md border border-border bg-card p-1.5 shadow-fluent-lg">
          <p className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Model</p>
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => { onModelChange(m.id); setOpen(false) }}
              className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary', model === m.id && 'bg-accent')}
            >
              {m.label} {model === m.id && <Check className="h-3 w-3" />}
            </button>
          ))}
          <p className="mt-1.5 border-t border-border px-2 py-1 pt-2 text-[10px] uppercase text-muted-foreground">Effort</p>
          {EFFORTS.map((e) => (
            <button
              key={e}
              onClick={() => { onEffortChange(e); setOpen(false) }}
              className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs capitalize hover:bg-secondary', effort === e && 'bg-accent')}
            >
              {e} {effort === e && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
