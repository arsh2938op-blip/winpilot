import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import type { DueMessage, DueMessageStatus, CreateDueMessageInput } from '@shared/types'

let memoryCache: DueMessage[] | null = null

function getStorePath(): string {
  try {
    const cwd = process.cwd()
    const flameDir = path.join(cwd, '.flame', 'state')
    if (fs.existsSync(flameDir)) {
      return path.join(flameDir, 'due_messages.json')
    }
    const dotFlame = path.join(cwd, '.flame')
    if (fs.existsSync(dotFlame)) {
      const stateDir = path.join(dotFlame, 'state')
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true })
      }
      return path.join(stateDir, 'due_messages.json')
    }
    const userData = app.getPath('userData')
    const stateDir = path.join(userData, 'state')
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true })
    }
    return path.join(stateDir, 'due_messages.json')
  } catch {
    return path.join(process.cwd(), '.flame', 'state', 'due_messages.json')
  }
}

function broadcastUpdate(messages: DueMessage[]): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.dueMessages.onUpdate, messages)
      }
    }
  } catch {
    // ignore
  }
}

async function persist(messages: DueMessage[]): Promise<void> {
  const filePath = getStorePath()
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf8')
    memoryCache = messages
    broadcastUpdate(messages)
  } catch (err) {
    console.error('[DueMessages] Failed to persist tasks:', err)
  }
}

export async function loadDueMessages(): Promise<DueMessage[]> {
  if (memoryCache) return memoryCache

  const filePath = getStorePath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        memoryCache = parsed
        return memoryCache
      }
    }
  } catch (err) {
    console.error('[DueMessages] Failed to load tasks from disk:', err)
  }

  memoryCache = []
  return memoryCache
}

export async function addDueMessage(input: CreateDueMessageInput): Promise<DueMessage> {
  const messages = await loadDueMessages()
  const now = Date.now()

  const item: DueMessage = {
    id: `due-${now}-${Math.random().toString(36).substring(2, 7)}`,
    title: input.title.trim(),
    content: input.content?.trim(),
    dueAt: input.dueAt,
    dueHint: input.dueHint?.trim(),
    workspaceContext: input.workspaceContext?.trim(),
    tags: input.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean),
    status: 'pending',
    createdAt: now,
    updatedAt: now
  }

  messages.unshift(item)
  await persist(messages)
  return item
}

export async function listDueMessages(filter?: {
  status?: DueMessageStatus
  workspaceContext?: string
}): Promise<DueMessage[]> {
  const all = await loadDueMessages()
  return all.filter((item) => {
    if (filter?.status && item.status !== filter.status) return false
    if (filter?.workspaceContext && item.workspaceContext !== filter.workspaceContext) return false
    return true
  })
}

export async function getPendingDueMessages(): Promise<DueMessage[]> {
  return listDueMessages({ status: 'pending' })
}

export async function completeDueMessage(idOrTitle: string): Promise<DueMessage | null> {
  const messages = await loadDueMessages()
  const needle = idOrTitle.trim().toLowerCase()
  const target = messages.find((m) => m.id === idOrTitle || m.title.toLowerCase().includes(needle))
  if (!target) return null

  target.status = 'completed'
  target.completedAt = Date.now()
  target.updatedAt = Date.now()
  await persist(messages)
  return target
}

export async function dismissDueMessage(idOrTitle: string): Promise<DueMessage | null> {
  const messages = await loadDueMessages()
  const needle = idOrTitle.trim().toLowerCase()
  const target = messages.find((m) => m.id === idOrTitle || m.title.toLowerCase().includes(needle))
  if (!target) return null

  target.status = 'dismissed'
  target.dismissedAt = Date.now()
  target.updatedAt = Date.now()
  await persist(messages)
  return target
}

export async function deleteDueMessage(id: string): Promise<boolean> {
  const messages = await loadDueMessages()
  const filtered = messages.filter((m) => m.id !== id)
  if (filtered.length !== messages.length) {
    await persist(filtered)
    return true
  }
  return false
}

export async function clearCompletedDueMessages(): Promise<number> {
  const messages = await loadDueMessages()
  const remaining = messages.filter((m) => m.status === 'pending')
  const count = messages.length - remaining.length
  if (count > 0) {
    await persist(remaining)
  }
  return count
}

