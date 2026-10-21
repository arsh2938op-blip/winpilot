import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { CornerDownLeft, Sparkles } from 'lucide-react'
import { navItems } from '@renderer/routes'
import { useNavStore } from '@renderer/store/useNavStore'
import { cn } from '@renderer/lib/utils'

/**
 * The command palette is WinPilot's visual "thesis": this is the box that
 * will eventually take a natural-language prompt like "turn on Bluetooth"
 * and route it to the right action. For now it only fuzzy-navigates
 * between pages — see the TODO below for where AI intent parsing plugs in.
 */
export function CommandPalette(): React.JSX.Element {
  const { commandPaletteOpen, setCommandPaletteOpen } = useNavStore()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [commandPaletteOpen])

  const results = useMemo(() => {
    if (!query.trim()) return navItems
    const q = query.toLowerCase()
    return navItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    )
  }, [query])

  const runActive = (): void => {
    const target = results[activeIndex]
    if (target) {
      navigate(target.path)
      setCommandPaletteOpen(false)
    }
  }

  return (
    <Dialog.Root open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[18%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-fluent-lg"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              runActive()
            }
          }}
        >
          <Dialog.Title className="sr-only">WinPilot command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search WinPilot pages, or eventually type a natural-language command.
          </Dialog.Description>

          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              placeholder="Ask Flame to do something, or jump to a page…"
              className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </div>

          <ul className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing matches &quot;{query}&quot; yet.
              </li>
            )}
            {results.map((item, index) => {
              const Icon = item.icon
              return (
                <li key={item.path}>
                  <button
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={runActive}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                      index === activeIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-secondary'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">
                      <span className="block font-medium">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    {index === activeIndex && <CornerDownLeft className="h-3.5 w-3.5" />}
                  </button>
                </li>
              )
            })}
          </ul>

          {/*
            TODO (AI Assistant feature): once the local model (Gemma via
            Ollama) is wired up, free-text queries that don't match a page
            (e.g. "turn on Bluetooth") should be sent to window.api's future
            `ai.sendPrompt` bridge, which returns an intent. The app then
            decides how to execute it — the AI never runs commands directly.
          */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
