import { Workflow, Plus } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { PlaceholderCard } from '@renderer/components/shared/PlaceholderCard'
import { Button } from '@renderer/components/ui/button'

/**
 * Combos — user-defined, reusable multi-step workflows (e.g. "Coding Mode":
 * open VS Code, open GitHub Desktop, start Ollama, open project folder).
 *
 * TODO: a Combo is essentially an ordered list of actions from other
 * features (winget installs, app launches, Windows Controls toggles).
 * Once those features expose real service functions, a Combo can just be
 * "run this list of already-implemented actions in order."
 */
export default function Combos(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Combos"
        description="Chain actions together into a single button or prompt."
        actions={
          <Button disabled>
            <Plus className="h-4 w-4" />
            New combo
          </Button>
        }
      />

      <PlaceholderCard
        icon={Workflow}
        title="No combos yet"
        description='Create a combo like "Coding Mode" — open VS Code, open GitHub Desktop, start Ollama — and run it with one click or a prompt.'
        upcoming={[
          'Step builder using actions from other WinPilot features',
          'Trigger a combo by button or by typing its name',
          'Edit and reorder steps after creation'
        ]}
      />
    </div>
  )
}
