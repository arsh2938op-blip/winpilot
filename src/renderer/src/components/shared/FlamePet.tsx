import { useId } from 'react'
import { cn } from '@renderer/lib/utils'

/**
 * FlameAGI's mascot — the PET companion.
 *
 * A glossy black robot head with two lit eyes, chrome ear pods, and electron
 * orbits with chrome nodes revolving around it. When it speaks, a speech
 * bubble with three dots appears above it.
 *
 * Pure SVG + CSS transforms: no 3D engine, no new dependency.
 */

interface FlamePetProps {
  className?: string
  /** Shows the speech bubble. */
  talking?: boolean
  /** Compact drops the bubble and the outer orbit, for very small sizes. */
  compact?: boolean
}

function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '')
}

const RINGS = [
  { tilt: -16, rx: 30, ry: 10.5, ex: 8, node: 2.6, dur: 9 },
  { tilt: 28, rx: 26, ry: 13, ex: 200, node: 2.1, dur: 14 }
] as const

export function FlamePet({ className, talking = false, compact = false }: FlamePetProps): React.JSX.Element {
  const uid = safeId(useId())
  const gHead = `pet-head-${uid}`
  const gChrome = `pet-chrome-${uid}`
  const gEye = `pet-eye-${uid}`
  const gPod = `pet-pod-${uid}`
  const gNode = `pet-node-${uid}`
  const gBubble = `pet-bubble-${uid}`

  return (
    <svg viewBox="0 0 64 64" className={cn('pet-svg', className)} aria-hidden="true">
      <defs>
        {/* Glossy black shell: bright rim top, near-black belly. */}
        <linearGradient id={gHead} x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0%" stopColor="#4a5158" />
          <stop offset="18%" stopColor="#1b1e23" />
          <stop offset="62%" stopColor="#0a0c0f" />
          <stop offset="100%" stopColor="#14171b" />
        </linearGradient>
        <linearGradient id={gChrome} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%" stopColor="#e9eef3" />
          <stop offset="30%" stopColor="#9aa2ab" />
          <stop offset="58%" stopColor="#f4f7fa" />
          <stop offset="100%" stopColor="#767d86" />
        </linearGradient>
        <linearGradient id={gPod} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c8cfd7" />
          <stop offset="45%" stopColor="#f6f9fb" />
          <stop offset="100%" stopColor="#868d96" />
        </linearGradient>
        {/* Eyes are the only light source on the face. */}
        <linearGradient id={gEye} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#eaf1f8" />
          <stop offset="100%" stopColor="#b9cde0" />
        </linearGradient>
        <radialGradient id={gNode} cx="34%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="34%" stopColor="#aeb6bf" />
          <stop offset="100%" stopColor="#0d0f13" />
        </radialGradient>
        <linearGradient id={gBubble} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b2f35" />
          <stop offset="100%" stopColor="#111418" />
        </linearGradient>
      </defs>

      {/* Orbits sit behind the head so the chrome nodes pass in and out. */}
      {!compact &&
        RINGS.map((r, i) => {
          const a = (r.ex * Math.PI) / 180
          const nx = 32 + r.rx * Math.cos(a)
          const ny = 32 + r.ry * Math.sin(a)
          return (
            <g key={i} transform={`translate(32 32) rotate(${r.tilt})`}>
              <ellipse
                cx="0"
                cy="0"
                rx={r.rx}
                ry={r.ry}
                fill="none"
                stroke="rgb(232 238 244 / 0.5)"
                strokeWidth="1"
                className={`pet-ring pet-ring--${i}`}
              />
              <circle cx={nx - 32} cy={ny - 32} r={r.node} fill={`url(#${gNode})`} className="pet-node" />
            </g>
          )
        })}

      {/* Speech bubble */}
      {talking && (
        <g className="pet-bubble">
          <rect
            x="33"
            y="1.5"
            width="28"
            height="14"
            rx="6"
            fill={`url(#${gBubble})`}
            stroke="rgb(236 241 247 / 0.35)"
            strokeWidth="0.7"
          />
          <path d="M37,15 L35,20.5 L42.5,15 Z" fill={`url(#${gBubble})`} stroke="rgb(236 241 247 / 0.2)" strokeWidth="0.5" />
          {[40, 47, 54].map((x) => (
            <circle key={x} cx={x} cy="8.5" r="1.5" fill="#eef3f8" className="pet-dot" style={{ animationDelay: `${(x - 40) * 130}ms` }} />
          ))}
        </g>
      )}

      {/* Chrome ear pods */}
      <rect x="6.5" y="26" width="9" height="18" rx="4.5" fill={`url(#${gPod})`} className="pet-pod" />
      <rect x="48.5" y="26" width="9" height="18" rx="4.5" fill={`url(#${gPod})`} className="pet-pod" />

      {/* Head */}
      <g className="pet-float">
        <rect x="16.5" y="21" width="31" height="27" rx="11" fill={`url(#${gHead})`} />
        {/* top gloss */}
        <path
          d="M16.5,32 C16.5,25.4 21.2,21 27.5,21 L36.5,21 C42.8,21 47.5,25.4 47.5,32 C44,29 38,27.5 32,27.5 C26,27.5 20,29 16.5,32 Z"
          fill="rgb(255 255 255 / 0.16)"
        />
        <rect
          x="17.4"
          y="21.9"
          width="29.2"
          height="25.2"
          rx="10.1"
          fill="none"
          stroke="rgb(255 255 255 / 0.14)"
          strokeWidth="0.8"
        />
        {/* Eyes */}
        <g className="pet-eyes">
          <rect x="23" y="30" width="7" height="6" rx="2.2" fill={`url(#${gEye})`} />
          <rect x="34" y="30" width="7" height="6" rx="2.2" fill={`url(#${gEye})`} />
        </g>
        {/* chin */}
        <path d="M24,43.5 C27,45.2 37,45.2 40,43.5" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1" strokeLinecap="round" />
      </g>
    </svg>
  )
}