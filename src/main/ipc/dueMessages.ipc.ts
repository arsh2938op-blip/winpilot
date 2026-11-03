import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { DueMessage, DueMessageStatus, CreateDueMessageInput } from '@shared/types'
import * as dueMessagesService from '../services/dueMessages'

export function registerDueMessagesIpc(): void {
  ipcMain.handle(
    IpcChannels.dueMessages.list,
    async (
      _event,
      filter?: { status?: DueMessageStatus; workspaceContext?: string }
    ): Promise<DueMessage[]> => {
      return dueMessagesService.listDueMessages(filter)
    }
  )

  ipcMain.handle(
    IpcChannels.dueMessages.add,
    async (_event, input: CreateDueMessageInput): Promise<DueMessage> => {
      return dueMessagesService.addDueMessage(input)
    }
  )

  ipcMain.handle(
    IpcChannels.dueMessages.complete,
    async (_event, idOrTitle: string): Promise<DueMessage | null> => {
      return dueMessagesService.completeDueMessage(idOrTitle)
    }
  )

  ipcMain.handle(
    IpcChannels.dueMessages.dismiss,
    async (_event, idOrTitle: string): Promise<DueMessage | null> => {
      return dueMessagesService.dismissDueMessage(idOrTitle)
    }
  )

  ipcMain.handle(
    IpcChannels.dueMessages.delete,
    async (_event, id: string): Promise<boolean> => {
      return dueMessagesService.deleteDueMessage(id)
    }
  )
}

