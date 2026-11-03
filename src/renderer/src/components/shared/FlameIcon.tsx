// src/renderer/src/components/shared/FlameIcon.tsx
import React from 'react'
import { FlameIcon as NewFlameIcon, type FlameIconProps as NewFlameIconProps } from '@renderer/components/icons/FlameIcon'

export interface FlameIconProps extends Omit<NewFlameIconProps, 'activePulse'> {
  active?: boolean
  activePulse?: boolean
}

export function FlameIcon({
  size = 24,
  active = false,
  activePulse = false,
  showHexShield = true,
  className
}: FlameIconProps): React.JSX.Element {
  return (
    <NewFlameIcon
      size={size}
      activePulse={activePulse || active}
      showHexShield={showHexShield}
      className={className}
    />
  )
}

export default FlameIcon
