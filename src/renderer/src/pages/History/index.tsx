import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History as HistoryIcon, Trash2, MessageSquare } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import { loadChats, deleteChat, setPendingOpenChat, type StoredChat } from '@renderer/lib/chatHistory'

export default function HistoryPage(): React.JSX.Element {
  const [chats, setChats] = useState<StoredChat[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    setChats(loadChats())
  }, [])

  const openChat = (chat: StoredChat): void => {
    setPendingOpenChat(chat.id)
    navigate('/')
  }

  const removeChat = (id: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    deleteChat(id)
    setChats(loadChats())
  }

  return (
    <div>
      <PageHeader title="History" description="Every past conversation with Flame." />

      {chats.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/50 py-16 text-center">
          <HistoryIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No conversations yet — start one in Chat.</p>
        </div>
      )}

      {chats.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => openChat(chat)}
                className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-secondary/60"
              >
                <span className="flex items-center gap-2.5">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">{chat.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(chat.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </span>
                </span>
                <span
                  role="button"
                  onClick={(e) => removeChat(chat.id, e)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
