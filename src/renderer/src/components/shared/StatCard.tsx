import type { ComponentType } from 'react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

interface StatCardProps {
  icon: ComponentType<{ className?: string }>
  label: string
  /** e.g. "—" while no real data source is wired up yet. */
  value: string
  hint?: string
  /** 0-100, omitted while there's no real metric to show. */
  percent?: number
}

export function StatCard({ icon: Icon, label, value, hint, percent }: StatCardProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {typeof percent === 'number' && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full bg-primary transition-all')}
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
