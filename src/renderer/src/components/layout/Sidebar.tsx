import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, Search, Plus, Trash2 } from 'lucide-react'
import { navItems } from '@renderer/routes'
import { useNavStore } from '@renderer/store/useNavStore'
import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { FlameIcon } from '@renderer/components/shared/FlameIcon'
import { loadChats, deleteChat, requestOpenChat, type StoredChat } from '@renderer/lib/chatHistory'

export function Sidebar(): React.JSX.Element {
  const { sidebarCollapsed, toggleSidebar, requestNewChat, activeChatId, chatsVersion } = useNavStore()
  const [chats, setChats] = useState<StoredChat[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setChats(loadChats())
  }, [chatsVersion])

  const filtered = query.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : chats

  const openChat = (chat: StoredChat): void => {
    requestOpenChat(chat.id)
    navigate('/')
  }
  const removeChat = (id: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    deleteChat(id)
    setChats(loadChats())
  }
  const newChat = (): void => {
    requestNewChat()
    if (location.pathname !== '/') navigate('/')
  }

  const secondaryItems = navItems.filter((item) => item.path !== '/')

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        sidebarCollapsed ? 'w-[60px]' : 'w-64'
      )}
    >
      <div className={cn('flex items-center gap-2 px-3 pt-3', sidebarCollapsed && 'justify-center px-0')}>
        <FlameIcon size={20} />
        {!sidebarCollapsed && <span className="flex-1 truncate text-sm font-semibold">FlameAGI</span>}
        {!sidebarCollapsed && (
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Search conversations"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-2.5 pt-2.5">
        <button
          onClick={newChat}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-sm text-foreground/90 hover:bg-secondary',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <Plus className="h-4 w-4" />
          {!sidebarCollapsed && 'New chat'}
        </button>
      </div>

      {!sidebarCollapsed && searchOpen && (
        <div className="px-2.5 pt-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs outline-none"
          />
        </div>
      )}

      <nav className={cn('mt-2 flex gap-1 px-2.5', sidebarCollapsed ? 'flex-col items-center' : 'flex-wrap')}>
        {secondaryItems.map((item) => {
          const Icon = item.icon
          const row = (
            <a
              key={item.path}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                navigate(item.path)
              }}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground',
                location.pathname === item.path && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </a>
          )
          return (
            <Tooltip key={item.path} delayDuration={200}>
              <TooltipTrigger asChild>{row}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      {!sidebarCollapsed ? (
        <div className="mt-3 flex-1 overflow-y-auto px-2.5 pb-2">
          <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent</p>
          {filtered.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No conversations yet.</p>}
          <div className="space-y-0.5">
            {filtered.map((chat) => (
              <button
                key={chat.id}
                onClick={() => openChat(chat)}
                className={cn(
                  'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px]',
                  activeChatId === chat.id ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-secondary'
                )}
              >
                <span className="truncate">{chat.title}</span>
                <span
                  role="button"
                  onClick={(e) => removeChat(chat.id, e)}
                  className="ml-2 shrink-0 rounded p-0.5 opacity-0 hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="border-t border-border/60 p-2">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs text-muted-foreground hover:bg-secondary"
        >
          {sidebarCollapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" /> Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
