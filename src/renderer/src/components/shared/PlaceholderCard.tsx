import type { ComponentType, ReactNode } from 'react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'

interface PlaceholderCardProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  /** Short bullet list of what this feature will eventually do. */
  upcoming?: string[]
  children?: ReactNode
}

/**
 * Standard "this feature isn't built yet" state. Used by every page that
 * doesn't have real functionality yet so the app never shows a broken or
 * empty-looking screen — every unfinished page still explains itself.
 */
export function PlaceholderCard({
  icon: Icon,
  title,
  description,
  upcoming,
  children
}: PlaceholderCardProps): React.JSX.Element {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <h3 className="font-display text-base font-semibold">{title}</h3>
            <Badge variant="secondary">Planned</Badge>
          </div>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        </div>

        {upcoming && upcoming.length > 0 && (
          <ul className="mt-2 space-y-1.5 text-left text-sm text-muted-foreground">
            {upcoming.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                {item}
              </li>
            ))}
          </ul>
        )}

        {children}
      </CardContent>
    </Card>
  )
}
