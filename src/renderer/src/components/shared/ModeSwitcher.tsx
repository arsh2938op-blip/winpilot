import React from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Wrench } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useChatModeStore } from '@renderer/store/useChatModeStore'
import type { ChatMode } from '@shared/types'

export function ModeSwitcher({
  compact = false,
  className
}: {
  compact?: boolean
  className?: string
}): React.JSX.Element {
  const { mode, setMode } = useChatModeStore()
  const isTask = mode === 'task'

  const handleSelect = (target: ChatMode): void => {
    setMode(target)
  }

  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-full border p-0.5 backdrop-blur-md transition-all select-none',
        isTask
          ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
          : 'border-border/60 bg-muted/40 hover:border-border',
        className
      )}
    >
      {/* Option: Chat */}
      <button
        type="button"
        onClick={() => handleSelect('chat')}
        className={cn(
          'relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
          !isTask
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <MessageSquare className="h-3 w-3" />
        <span>Chat</span>
        {!isTask && (
          <motion.div
            layoutId="modePillBackground"
            className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm border border-border/70"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
      </button>

      {/* Option: Task */}
      <button
        type="button"
        onClick={() => handleSelect('task')}
        className={cn(
          'relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
          isTask
            ? 'text-amber-400 font-bold'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Wrench
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            isTask ? 'text-amber-400 scale-110' : 'text-muted-foreground'
          )}
        />
        <span>{compact ? 'Task' : 'Task'}</span>
        {isTask && (
          <motion.div
            layoutId="modePillBackground"
            className="absolute inset-0 -z-10 rounded-full bg-amber-500/20 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
      </button>
    </div>
  )
}
