import { FlamePet } from '@renderer/components/shared/FlamePet'
import { cn } from '@renderer/lib/utils'

interface FlameIconProps {
  size?: number
  active?: boolean
  className?: string
}

/**
 * The FlameAGI mascot, sized to whatever the call site needs.
 *
 * Used for the sidebar corner, the title bar, the Chat greeting and message
 * avatars — the same artwork as the taskbar/tray/installer icon, so there is
 * only one identity in the product. It has to stay legible from 16px (avatar)
 * to 44px (greeting), hence the compact variant that drops the outer orbit.
 */
export function FlameIcon({ size = 24, active = false, className }: FlameIconProps): React.JSX.Element {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden', className)}
      style={{ width: size, height: size }}
    >
      <FlamePet
        compact={size < 24}
        className={cn('h-full w-full', active && 'flame-thinking-pulse')}
      />
    </span>
  )
}