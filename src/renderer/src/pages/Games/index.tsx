import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Gamepad2, Crown, Sparkles, Terminal } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import MinecraftDashboard from '@renderer/pages/MinecraftDashboard'
import ChessArena from '@renderer/pages/ChessArena'

type GameTab = 'minecraft' | 'chess'

export default function Games(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as GameTab) || 'chess'
  const [activeTab, setActiveTab] = useState<GameTab>(
    initialTab === 'minecraft' || initialTab === 'chess' ? initialTab : 'chess'
  )

  useEffect(() => {
    const tabParam = searchParams.get('tab') as GameTab
    if (tabParam && (tabParam === 'minecraft' || tabParam === 'chess')) {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  const selectTab = (tab: GameTab): void => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Games Header & Navigation Bar */}
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-6 py-3 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <Gamepad2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Games & Virtual Worlds</h1>
            <p className="text-xs text-muted-foreground">Autonomous agents in Minecraft & multi-engine Chess Arena</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/60 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => selectTab('chess')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all',
              activeTab === 'chess'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            )}
          >
            <Crown className="h-3.5 w-3.5 text-amber-400" />
            <span>Chess Arena</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('minecraft')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all',
              activeTab === 'minecraft'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            )}
          >
            <Gamepad2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Minecraft Dashboard</span>
          </button>
        </div>
      </div>

      {/* Active Game View */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'chess' && <ChessArena />}
        {activeTab === 'minecraft' && <MinecraftDashboard />}
      </div>
    </div>
  )
}

