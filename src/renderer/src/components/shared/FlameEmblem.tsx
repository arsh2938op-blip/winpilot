import { useId } from 'react'
import { cn } from '@renderer/lib/utils'

/**
 * FlameAGI's application emblem.
 *
 * The glossy tile: a dark rounded square with a "Flame AGI" header bar and two
 * ringed spheres below it — a large primary and a small companion. Used for
 * the sidebar corner, title bar, greetings, message avatars, taskbar, tray and
 * the packaged executable. The mascot (FlamePet) belongs to PET mode only.
 */

interface FlameEmblemProps {
  className?: string
  /** Drops the wordmark; below ~24px it turns to mush anyway. */
  showWordmark?: boolean
}

function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '')
}

export function FlameEmblem({ className, showWordmark = true }: FlameEmblemProps): React.JSX.Element {
  const uid = safeId(useId())
  const gTile = `emb-tile-${uid}`
  const gGloss = `emb-gloss-${uid}`
  const gBar = `emb-bar-${uid}`
  const gBig = `emb-big-${uid}`
  const gSmall = `emb-small-${uid}`

  return (
    <svg viewBox="0 0 64 64" className={cn('emblem-svg', className)} aria-hidden="true">
      <defs>
        <linearGradient id={gTile} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#23262b" />
          <stop offset="38%" stopColor="#0e1013" />
          <stop offset="100%" stopColor="#050608" />
        </linearGradient>
        <linearGradient id={gGloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(255 255 255 / 0.2)" />
          <stop offset="55%" stopColor="rgb(255 255 255 / 0.03)" />
          <stop offset="100%" stopColor="rgb(255 255 255 / 0)" />
        </linearGradient>
        <linearGradient id={gBar} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#191c21" />
          <stop offset="100%" stopColor="#05070a" />
        </linearGradient>
        {/* Dark polished metal with a tight specular — the reference spheres
            read as heavy chrome-black, not as glowing planets. */}
        <radialGradient id={gBig} cx="34%" cy="26%" r="76%">
          <stop offset="0%" stopColor="#7d848d" />
          <stop offset="20%" stopColor="#2f343b" />
          <stop offset="58%" stopColor="#101318" />
          <stop offset="100%" stopColor="#030407" />
        </radialGradient>
        <radialGradient id={gSmall} cx="34%" cy="26%" r="76%">
          <stop offset="0%" stopColor="#6e757e" />
          <stop offset="24%" stopColor="#262b31" />
          <stop offset="100%" stopColor="#04060a" />
        </radialGradient>
      </defs>

      {/* Tile */}
      <rect x="1" y="1" width="62" height="62" rx="13" fill={`url(#${gTile})`} />
      <rect x="1" y="1" width="62" height="26" rx="13" fill={`url(#${gGloss})`} />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="12.5"
        fill="none"
        stroke="rgb(255 255 255 / 0.15)"
        strokeWidth="1"
      />

      {/* Header bar */}
      <path d="M3.5,3.5 L60.5,3.5 A10,10 0 0 1 60.5,19.5 L3.5,19.5 A0,0 0 0 1 3.5,3.5 Z" fill={`url(#${gBar})`} />
      <rect x="3.5" y="19.2" width="57" height="0.9" fill="rgb(255 255 255 / 0.12)" />
      {showWordmark && (
        <text
          x="32"
          y="14.6"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="9"
          fontWeight="700"
          letterSpacing="0.3"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Flame AGI
        </text>
      )}

      {/* Large sphere + ring */}
      <g>
        <circle cx="24" cy="38" r="12" fill={`url(#${gBig})`} />
        <ellipse cx="20" cy="34" rx="4" ry="2.6" transform="rotate(-28 20 34)" fill="rgb(255 255 255 / 0.4)" />
        <g className="emb-orbit">
          <ellipse
            cx="24"
            cy="38"
            rx="15"
            ry="4.6"
            fill="none"
            stroke="rgb(238 243 248 / 0.65)"
            strokeWidth="1.1"
            transform="rotate(-14 24 38)"
          />
        </g>
      </g>

      {/* Companion sphere + ring */}
      <g>
        <circle cx="47" cy="44" r="7" fill={`url(#${gSmall})`} />
        <ellipse cx="45" cy="41.6" rx="2.4" ry="1.6" transform="rotate(-28 45 41.6)" fill="rgb(255 255 255 / 0.36)" />
        <g className="emb-orbit emb-orbit--slow">
          <ellipse
            cx="47"
            cy="44"
            rx="9.6"
            ry="3.2"
            fill="none"
            stroke="rgb(238 243 248 / 0.5)"
            strokeWidth="0.9"
            transform="rotate(-14 47 44)"
          />
        </g>
      </g>
    </svg>
  )
}