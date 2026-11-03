// src/renderer/src/components/icons/FlameIcon.tsx
import React, { useId } from 'react'

export interface FlameIconProps {
  size?: number
  activePulse?: boolean
  showHexShield?: boolean
  className?: string
}

export const FlameIcon: React.FC<FlameIconProps> = ({
  size = 18,
  activePulse = false,
  showHexShield = true,
  className = ''
}) => {
  const uid = useId().replace(/:/g, '')

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        filter: activePulse
          ? 'drop-shadow(0 0 8px rgba(255, 140, 0, 0.9)) drop-shadow(0 0 14px rgba(0, 229, 255, 0.45))'
          : 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.85))',
        transition: 'filter 0.25s ease, transform 0.25s ease',
        flexShrink: 0
      }}
    >
      <defs>
        {/* Obsidian Armor Gradient */}
        <linearGradient id={`obsidian_${uid}`} x1="8" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E2430" />
          <stop offset="50%" stopColor="#0D1117" />
          <stop offset="100%" stopColor="#05070A" />
        </linearGradient>

        {/* Primary Cyber-Amber Flame Gradient */}
        <linearGradient id={`flameMain_${uid}`} x1="32" y1="6" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF5B8" />
          <stop offset="30%" stopColor="#FF9E00" />
          <stop offset="75%" stopColor="#FF5400" />
          <stop offset="100%" stopColor="#B81D00" />
        </linearGradient>

        {/* Darker Facet Shade for 3D Depth */}
        <linearGradient id={`flameFacet_${uid}`} x1="14" y1="16" x2="50" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7B00" />
          <stop offset="100%" stopColor="#6B0F00" />
        </linearGradient>

        {/* Cyan Singularity Spark */}
        <radialGradient id={`cyanCore_${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#70F8FF" />
          <stop offset="75%" stopColor="#00B4D8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0077B6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1. Hexagonal Obsidian Shield Base */}
      {showHexShield && (
        <>
          <polygon
            points="32,3 58,16 58,48 32,61 6,48 6,16"
            fill={`url(#obsidian_${uid})`}
            stroke="#2B3340"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <polygon
            points="32,6.5 54.5,18 54.5,46 32,57.5 9.5,46 9.5,18"
            fill="none"
            stroke={`url(#flameMain_${uid})`}
            strokeWidth="1.4"
            strokeOpacity="0.85"
            strokeLinejoin="round"
          />
        </>
      )}

      {/* 2. Outer Left & Right Faceted Flame Wings */}
      <polygon
        points="16,45 12,29 21,33 23,20 26,48"
        fill={`url(#flameFacet_${uid})`}
        stroke="#07090E"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polygon
        points="48,45 52,29 43,33 41,20 38,48"
        fill={`url(#flameFacet_${uid})`}
        stroke="#07090E"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* 3. Central Crown Flame Spire */}
      <polygon
        points="32,5 42,22 39,47 25,47 22,22"
        fill={`url(#flameMain_${uid})`}
        stroke="#07090E"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Right-half facet shadow on top spire */}
      <polygon
        points="32,5 42,22 39,47 32,47"
        fill="#FF4800"
        fillOpacity="0.35"
      />

      {/* 4. Interlocking Geometric 'A' Spear */}
      <path
        d="M32 16L46 47L38 54L32 49L26 54L18 47L32 16Z"
        fill="#0B0E14"
        stroke={`url(#flameMain_${uid})`}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* Inner 'A' Crossbar & Obsidian Cutout */}
      <polygon
        points="32,23 39,40 24,45 22,41 34,36 32,30 27,40 23,40"
        fill={`url(#flameMain_${uid})`}
      />

      {/* 5. Cyan-White Energy Singularity Spark at Bottom Apex */}
      <circle cx="32" cy="51" r="7" fill={`url(#cyanCore_${uid})`} />
      <polygon
        points="32,39 33.8,48.5 39,44 34.5,50.5 38,53 32,55.5 26,53 29.5,50.5 25,44 30.2,48.5"
        fill="#E0FBFC"
      />
      <circle cx="32" cy="51.5" r="2.2" fill="#FFFFFF" />
    </svg>
  )
}

export default FlameIcon

