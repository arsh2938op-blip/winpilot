import { Github } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { PlaceholderCard } from '@renderer/components/shared/PlaceholderCard'

export default function GitHub(): React.JSX.Element {
  return (
    <div>
      <PageHeader title="GitHub" description="Repository awareness and control." />
      <PlaceholderCard
        icon={Github}
        title="Not connected"
        description="No GitHub integration exists yet — Flame can't read repos, issues, or PRs."
        upcoming={['Connect a GitHub account/token', 'Read repo structure and files', 'Inspect issues and PRs']}
      />
    </div>
  )
}
