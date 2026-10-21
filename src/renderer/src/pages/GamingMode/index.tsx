import { Gamepad2 } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { PlaceholderCard } from '@renderer/components/shared/PlaceholderCard'
import { Button } from '@renderer/components/ui/button'

/**
 * Gaming Mode — future feature. One-tap workflow that closes background
 * apps, switches power plan, enables Game Mode, and launches a set of
 * chosen apps, then restores previous state afterward.
 *
 * TODO: this is a good candidate to build on top of the Combo System
 * once that exists, rather than as fully separate logic.
 */
export default function GamingMode(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Gaming Mode"
        description="One tap to get your system ready to play, and back afterward."
      />

      <PlaceholderCard
        icon={Gamepad2}
        title="Gaming Mode isn't configured yet"
        description="Once built, this will close chosen background apps, switch your power plan, enable Windows Game Mode, and launch the apps you want — then restore everything when you're done."
        upcoming={[
          'Choose which apps to close before a session',
          'Choose apps to auto-launch (e.g. Discord, launcher)',
          'Automatic restore of previous state on exit'
        ]}
      >
        <Button className="mt-2" disabled>
          Set up Gaming Mode
        </Button>
      </PlaceholderCard>
    </div>
  )
}
