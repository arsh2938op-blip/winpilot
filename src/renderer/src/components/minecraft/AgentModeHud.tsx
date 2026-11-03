import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  ShieldAlert,
  Swords,
  Heart,
  Compass,
  Mic,
  MicOff,
  Flame,
  Bot,
  Package,
  Sparkles,
  Volume2,
  X,
  Target,
  Crosshair
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface BotStateData {
  botName: string
  status: string
  health: number
  food: number
  position: { x: number; y: number; z: number } | null
  dimension: string
  currentAction: string
  inventory: {
    heldItem: string | null
    weapons: string[]
    food: string[]
    totalSlotsUsed: number
  }
  leaderDefense: {
    targetLeader: string
    leaderFound: boolean
    leaderDistance: number | null
    leaderPosition: { x: number; y: number; z: number } | null
    defenseMode: string
    defenseSummary: string
    threatsEliminated: number
    threatsNearby: string[]
  }
  updatedAt: string
}

interface AgentModeHudProps {
  listening: boolean
  onToggleListening?: () => void
  onExitAgentMode: () => void
}

export function AgentModeHud({
  listening,
  onToggleListening,
  onExitAgentMode
}: AgentModeHudProps): React.JSX.Element {
  const [botState, setBotState] = useState<BotStateData | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchState = async (): Promise<void> => {
      try {
        const state = await window.api?.minecraft?.getBotState?.()
        if (mounted && state) {
          setBotState(state)
        }
      } catch {
        // ignore
      }
    }

    void fetchState()
    const timer = setInterval(fetchState, 1500)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const leader = botState?.leaderDefense?.targetLeader || 'Emperorop7528'
  const isLeaderFound = botState?.leaderDefense?.leaderFound ?? false
  const defenseSummary = botState?.leaderDefense?.defenseSummary || 'Guarding perimeter'
  const threatsEliminated = botState?.leaderDefense?.threatsEliminated ?? 0
  const threatsNearby = botState?.leaderDefense?.threatsNearby || []
  const hasThreats = threatsNearby.length > 0

  return (
    <div className="w-full border-b border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-background/90 to-amber-950/40 backdrop-blur-md px-4 py-3 shadow-[0_4px_24px_rgba(245,158,11,0.18)]">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Bot & Leader Defense Status */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/50 shadow-inner">
              <Flame className="h-6 w-6 text-amber-400 animate-pulse" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
              <Bot className="h-2.5 w-2.5 text-black" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-foreground">
                {botState?.botName || 'FLAMEAGI_1'}
              </span>
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                Agent Mode
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                Gemini 3.8 Flash
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1 text-xs">
              {/* Leader Defense Pill */}
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium border text-[11px]',
                  hasThreats
                    ? 'border-red-500/40 bg-red-950/30 text-red-300'
                    : isLeaderFound
                      ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                      : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
                )}
              >
                {hasThreats ? (
                  <ShieldAlert className="h-3.5 w-3.5 text-red-400 animate-bounce" />
                ) : (
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>Leader: <strong>{leader}</strong></span>
                {botState?.leaderDefense?.leaderDistance !== null && botState?.leaderDefense?.leaderDistance !== undefined && (
                  <span className="text-[10px] opacity-80">({botState.leaderDefense.leaderDistance}m)</span>
                )}
              </div>

              {/* Bot Vitals */}
              <div className="hidden sm:flex items-center gap-2 text-muted-foreground text-[11px]">
                <span className="flex items-center gap-1 text-red-400 font-mono">
                  <Heart className="h-3 w-3 fill-red-500" /> {botState?.health ?? 20}/20
                </span>
                {botState?.position && (
                  <span className="flex items-center gap-1 font-mono text-muted-foreground">
                    <Compass className="h-3 w-3 text-cyan-400" /> {botState.position.x}, {botState.position.y}, {botState.position.z}
                  </span>
                )}
                {botState?.inventory?.heldItem && (
                  <span className="flex items-center gap-1 font-mono text-amber-300/90">
                    <Swords className="h-3 w-3 text-amber-400" /> {botState.inventory.heldItem}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Live Action / Defense Summary */}
        <div className="hidden lg:flex flex-col items-center justify-center max-w-md text-center">
          <p className="text-xs text-foreground/90 font-medium truncate max-w-sm">
            {defenseSummary}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Threats neutralized: <strong className="text-amber-400">{threatsEliminated}</strong> · Say commands like <span className="text-amber-300">"Defend {leader}"</span> or <span className="text-amber-300">"Mine iron"</span>
          </p>
        </div>

        {/* Right: Voice Input Status & Controls */}
        <div className="flex items-center gap-2">
          {/* Voice Wave Indicator */}
          <div
            onClick={onToggleListening}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 border text-xs font-medium cursor-pointer transition-all select-none',
              listening
                ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:border-amber-500/40'
            )}
            title={listening ? 'Listening to your voice... Click to pause' : 'Voice paused. Click to listen'}
          >
            {listening ? (
              <>
                <Mic className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                <span className="font-semibold">Listening...</span>
                <span className="flex gap-0.5 items-end h-3">
                  <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                </span>
              </>
            ) : (
              <>
                <MicOff className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Voice paused</span>
              </>
            )}
          </div>

          {/* Return to Chat / Exit Agent Mode button */}
          <button
            type="button"
            onClick={onExitAgentMode}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 hover:bg-muted/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all shadow-sm"
            title="Press Alt+Space or click to return to Desktop Chat"
          >
            <X className="h-3.5 w-3.5" />
            <span>Exit (Alt+Space)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
export default AgentModeHud

