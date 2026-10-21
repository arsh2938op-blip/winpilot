import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { WhatsAppContact } from '@shared/types'
import { listContacts, addContact, removeContact } from '../services/contacts/store'

export function registerContactsIpc(): void {
  ipcMain.handle(IpcChannels.contacts.list, async (): Promise<WhatsAppContact[]> => {
    return listContacts()
  })

  ipcMain.handle(
    IpcChannels.contacts.add,
    async (_event, name: string, phoneNumber: string): Promise<WhatsAppContact[]> => {
      return addContact(name, phoneNumber)
    }
  )

  ipcMain.handle(
    IpcChannels.contacts.remove,
    async (_event, name: string): Promise<WhatsAppContact[]> => {
      return removeContact(name)
    }
  )
}