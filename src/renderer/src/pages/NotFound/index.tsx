import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Compass className="h-10 w-10 text-muted-foreground" />
      <div>
        <h1 className="font-display text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That page doesn&apos;t exist in WinPilot yet.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Back to Dashboard</Link>
      </Button>
    </div>
  )
}
