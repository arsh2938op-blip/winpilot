import { Activity as ActivityIcon } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { PlaceholderCard } from '@renderer/components/shared/PlaceholderCard'

export default function Activity(): React.JSX.Element {
  return (
    <div>
      <PageHeader title="Activity" description="A log of what Flame has actually done." />
      <PlaceholderCard
        icon={ActivityIcon}
        title="No activity log yet"
        description="Installs, updates, and external actions happen for real, but nothing is recorded to a central history yet."
        upcoming={['Timeline of installs/updates/uninstalls', 'External actions taken via Zapier', 'Success/failure history']}
      />
    </div>
  )
}
