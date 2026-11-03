import { ipcMain } from 'electron'
import { whatsappEngine } from '../services/whatsapp/whatsappEngine'

export function registerWhatsappIpc(): void {
  ipcMain.handle('whatsapp:get-status', async () => {
    return whatsappEngine.getConnectionStatus()
  })

  ipcMain.handle('whatsapp:connect', async () => {
    await whatsappEngine.start()
    return whatsappEngine.getConnectionStatus()
  })

  ipcMain.handle('whatsapp:disconnect', async () => {
    await whatsappEngine.stop()
    return whatsappEngine.getConnectionStatus()
  })
}

