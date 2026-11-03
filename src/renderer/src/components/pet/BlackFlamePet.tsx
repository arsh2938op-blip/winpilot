// src/renderer/src/components/pet/BlackFlamePet.tsx
import React, { useId } from 'react'

export type PetModeState = 'idle' | 'listening' | 'speaking' | 'agent'

export interface BlackFlamePetProps {
  state?: PetModeState
  size?: number
  statusText?: string
  onToggleMic?: () => void
  onTriggerAgentMode?: () => void
  className?: string
}

export const BlackFlamePet: React.FC<BlackFlamePetProps> = ({
  state = 'idle',
  size = 112,
  statusText,
  onToggleMic,
  onTriggerAgentMode,
  className = ''
}) => {
  const uid = useId().replace(/:/g, '')
  const isListening = state === 'listening' || state === 'agent'
  const isSpeaking = state === 'speaking'

  return (
    <div
      className={`flame-pet-wrapper ${className}`}
      style={{
        position: 'relative',
        width: size,
        height: size + 28,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none'
      }}
    >
      <style>{`
        @keyframes blackFlameFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes blackWispRise {
          0% { transform: translateY(4px) scale(0.92); opacity: 0.75; }
          50% { transform: translateY(-6px) scale(1.04); opacity: 0.95; }
          100% { transform: translateY(-14px) scale(0.88); opacity: 0.2; }
        }
        @keyframes coronaPulse {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.85; }
          50% { transform: scale(1.08) rotate(4deg); opacity: 1; }
        }
        @keyframes orbitSpinA {
          0% { transform: rotateX(68deg) rotateY(-18deg) rotateZ(0deg); }
          100% { transform: rotateX(68deg) rotateY(-18deg) rotateZ(360deg); }
        }
        @keyframes orbitSpinB {
          0% { transform: rotateX(62deg) rotateY(24deg) rotateZ(360deg); }
          100% { transform: rotateX(62deg) rotateY(24deg) rotateZ(0deg); }
        }
        @keyframes visorBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.12); }
        }
        .flame-pet-core {
          animation: blackFlameFloat 3.4s ease-in-out infinite;
          cursor: pointer;
        }
        .flame-wisp-layer {
          animation: blackWispRise 2.4s ease-in-out infinite;
          transform-origin: center;
        }
        .flame-corona-active {
          animation: coronaPulse 1.3s ease-in-out infinite;
          transform-origin: center;
        }
        .flame-visor-eyes {
          animation: visorBlink 4.5s infinite;
          transform-origin: 100px 102px;
        }
      `}</style>

      {/* Main SVG Pet Core */}
      <div
        className="flame-pet-core"
        onClick={onToggleMic}
        onDoubleClick={onTriggerAgentMode}
        title="Click to talk • Double-click or press Alt for Minecraft Agent Mode"
        style={{ position: 'relative', width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Outer Black & Amber Aura */}
            <radialGradient id={`aura_${uid}`} cx="50%" cy="52%" r="50%">
              <stop offset="0%" stopColor="#FF7B00" stopOpacity={isListening ? '0.65' : '0.35'} />
              <stop offset="55%" stopColor="#1A0B00" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>

            {/* Obsidian Armored Shell */}
            <radialGradient id={`armor_${uid}`} cx="38%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#3A4252" />
              <stop offset="45%" stopColor="#181C24" />
              <stop offset="85%" stopColor="#0B0D12" />
              <stop offset="100%" stopColor="#050608" />
            </radialGradient>

            {/* Recessed Dark Glass Visor */}
            <linearGradient id={`visor_${uid}`} x1="100" y1="68" x2="100" y2="136" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#141821" />
              <stop offset="40%" stopColor="#07080C" />
              <stop offset="100%" stopColor="#1F0D04" />
            </linearGradient>

            {/* Glowing LED Amber Matrix */}
            <radialGradient id={`led_${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF8D6" />
              <stop offset="45%" stopColor="#FF9E00" />
              <stop offset="100%" stopColor="#E84A00" />
            </radialGradient>

            {/* Black Flame Wisp Gradient */}
            <linearGradient id={`blackFlame_${uid}`} x1="100" y1="8" x2="100" y2="190" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#07080C" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#1F1109" stopOpacity="0.9" />
              <stop offset="85%" stopColor="#FF6D00" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#FFB703" />
            </linearGradient>
          </defs>

          {/* 1. Ambient Black-Amber Aura */}
          <circle cx="100" cy="102" r="88" fill={`url(#aura_${uid})`} />

          {/* 2. Rising Black Flame & Ember Plumes (Top & Bottom Propulsion) */}
          <g className="flame-wisp-layer">
            {/* Top Obsidian Smoke & Flame Plumes */}
            <path
              d="M65 56 C52 34, 72 18, 66 6 C82 18, 88 32, 84 48 Z"
              fill={`url(#blackFlame_${uid})`}
            />
            <path
              d="M95 48 C90 22, 108 10, 102 2 C118 16, 120 34, 112 50 Z"
              fill={`url(#blackFlame_${uid})`}
            />
            <path
              d="M124 58 C138 38, 128 20, 140 10 C150 28, 144 46, 134 62 Z"
              fill={`url(#blackFlame_${uid})`}
            />
            {/* Bottom Thruster Black-Amber Tail */}
            <path
              d="M78 152 L100 192 L122 152 Q100 164 78 152 Z"
              fill={`url(#blackFlame_${uid})`}
            />
            <path
              d="M88 154 L100 178 L112 154 Z"
              fill="#FF9E00"
              fillOpacity="0.85"
            />
          </g>

          {/* 3. Swirling Black-Flame Corona (Intensifies when Listening / Agent Mode) */}
          {isListening && (
            <g className="flame-corona-active">
              <path
                d="M34 110 C18 78, 42 42, 72 32 C54 54, 44 82, 50 112 Z"
                fill={`url(#blackFlame_${uid})`}
              />
              <path
                d="M166 110 C182 78, 158 42, 128 32 C146 54, 156 82, 150 112 Z"
                fill={`url(#blackFlame_${uid})`}
              />
              <circle
                cx="100"
                cy="102"
                r="68"
                stroke="#FF8800"
                strokeWidth="2"
                strokeDasharray="10 8"
                strokeOpacity="0.8"
              />
            </g>
          )}

          {/* 4. Armored Obsidian Sphere Chassis */}
          <circle
            cx="100"
            cy="102"
            r="56"
            fill={`url(#armor_${uid})`}
            stroke="#2A313D"
            strokeWidth="3"
          />

          {/* Top & Bottom Faceted Armor Plates + glowing magma seams */}
          <path
            d="M64 62 L84 48 L116 48 L136 62 L122 72 L100 64 L78 72 Z"
            fill="#1C222D"
            stroke="#FF7B00"
            strokeWidth="1.2"
            strokeOpacity="0.7"
          />
          <path
            d="M68 140 L86 154 L114 154 L132 140 L118 130 L100 138 L82 130 Z"
            fill="#151A22"
            stroke="#FF7B00"
            strokeWidth="1.2"
            strokeOpacity="0.65"
          />

          {/* Left & Right Mechanical Audio Vents / Earpieces */}
          <ellipse
            cx="44"
            cy="104"
            rx="9"
            ry="18"
            fill="#12161F"
            stroke={isListening || isSpeaking ? '#FF9E00' : '#323B4A'}
            strokeWidth="2.2"
          />
          <ellipse
            cx="156"
            cy="104"
            rx="9"
            ry="18"
            fill="#12161F"
            stroke={isListening || isSpeaking ? '#FF9E00' : '#323B4A'}
            strokeWidth="2.2"
          />

          {/* 5. Recessed Visor Screen */}
          <path
            d="M60 84 Q100 68 140 84 L144 114 Q100 134 56 114 Z"
            fill={`url(#visor_${uid})`}
            stroke="#FF7B00"
            strokeWidth="1.8"
            strokeOpacity="0.85"
          />

          {/* 6. Expressive Visor LED Matrix (Idle vs Listening vs Speaking) */}
          <g className="flame-visor-eyes">
            {isListening ? (
              /* LISTENING STATE: Happy Caret Eyes (^ _ ^) + Audio Waveform */
              <>
                <path
                  d="M72 104 L82 91 L92 104"
                  stroke="#FF9E00"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M108 104 L118 91 L128 104"
                  stroke="#FF9E00"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="94"
                  y1="112"
                  x2="106"
                  y2="112"
                  stroke="#FFB703"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* Cheek Audio Waveform Lines */}
                <path
                  d="M61 102 L64 97 L67 106 L70 101"
                  stroke="#FF6D00"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M130 101 L133 106 L136 97 L139 102"
                  stroke="#FF6D00"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </>
            ) : isSpeaking ? (
              /* SPEAKING STATE: Glowing Eyes + Smiling Curve (● ◡ ●) */
              <>
                <circle cx="80" cy="99" r="7.5" fill={`url(#led_${uid})`} />
                <circle cx="120" cy="99" r="7.5" fill={`url(#led_${uid})`} />
                <circle cx="67" cy="105" r="2.2" fill="#FF8800" />
                <circle cx="133" cy="105" r="2.2" fill="#FF8800" />
                <path
                  d="M93 106 Q100 116 107 106"
                  stroke="#FFB703"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  fill="none"
                />
              </>
            ) : (
              /* IDLE STATE: Classic Dot-Matrix Eyes (● _ ●) */
              <>
                <circle cx="80" cy="100" r="8" fill={`url(#led_${uid})`} />
                <circle cx="120" cy="100" r="8" fill={`url(#led_${uid})`} />
                <circle cx="66" cy="103" r="2" fill="#FF7B00" fillOpacity="0.8" />
                <circle cx="134" cy="103" r="2" fill="#FF7B00" fillOpacity="0.8" />
                <line
                  x1="94"
                  y1="111"
                  x2="106"
                  y2="111"
                  stroke="#FF9E00"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray="2 2"
                />
              </>
            )}
          </g>

          {/* 7. Speaking State Gyroscopic Orbital Rings */}
          {isSpeaking && (
            <g>
              <ellipse
                cx="100"
                cy="106"
                rx="84"
                ry="26"
                stroke="#FF9E00"
                strokeWidth="2"
                strokeDasharray="18 10"
                transform="rotate(-16 100 106)"
              />
              <ellipse
                cx="100"
                cy="106"
                rx="78"
                ry="22"
                stroke="#FFD166"
                strokeWidth="1.4"
                strokeDasharray="10 14"
                transform="rotate(20 100 106)"
              />
              <circle cx="24" cy="94" r="3.5" fill="#FFF3B0" />
              <circle cx="174" cy="118" r="3" fill="#FF9E00" />
            </g>
          )}
        </svg>
      </div>

      {/* Docked Mic & Agent Mode Pill (Replaces the orphaned floating mic button) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '-4px',
          padding: '4px 10px',
          borderRadius: '999px',
          background: 'rgba(10, 13, 20, 0.86)',
          border: `1px solid ${isListening ? '#FF8800' : 'rgba(255, 140, 0, 0.28)'}`,
          boxShadow: isListening ? '0 0 12px rgba(255, 123, 0, 0.45)' : '0 4px 10px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          fontSize: '11px',
          color: '#F3F4F6'
        }}
      >
        <button
          type="button"
          onClick={onToggleMic}
          style={{
            background: 'transparent',
            border: 'none',
            color: isListening ? '#FF9E00' : '#9CA3AF',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 600
          }}
        >
          <span>{isListening ? '🔥 Listening...' : isSpeaking ? '⚡ Speaking' : '🎙️ Voice'}</span>
        </button>
        {statusText && (
          <span style={{ color: '#9CA3AF', borderLeft: '1px solid #374151', paddingLeft: '6px' }}>
            {statusText}
          </span>
        )}
      </div>
    </div>
  )
}

export default BlackFlamePet

