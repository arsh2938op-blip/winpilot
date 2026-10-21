import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { MemoryEntry } from '@shared/types'
import { listMemory, addMemory, removeMemory } from '../services/memory/store'

export function registerMemoryIpc(): void {
  ipcMain.handle(IpcChannels.memory.list, async (): Promise<MemoryEntry[]> => {
    return listMemory()
  })

  ipcMain.handle(IpcChannels.memory.add, async (_event, text: string): Promise<MemoryEntry[]> => {
    return addMemory(text)
  })

  ipcMain.handle(IpcChannels.memory.remove, async (_event, id: string): Promise<MemoryEntry[]> => {
    return removeMemory(id)
  })
}
