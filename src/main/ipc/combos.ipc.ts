import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { Combo, ComboRunResult } from '@shared/types'
import * as combosService from '../services/combos'

export function registerCombosIpc(): void {
  ipcMain.handle(IpcChannels.combos.list, async (): Promise<Combo[]> => {
    return combosService.loadCombos()
  })

  ipcMain.handle(
    IpcChannels.combos.save,
    async (
      _event,
      payload: {
        id?: string
        name: string
        description?: string
        toDo?: string
        steps?: Combo['steps']
      }
    ): Promise<Combo> => {
      return combosService.saveCombo(payload)
    }
  )

  ipcMain.handle(IpcChannels.combos.delete, async (_event, id: string): Promise<boolean> => {
    return combosService.deleteCombo(id)
  })

  ipcMain.handle(IpcChannels.combos.execute, async (_event, idOrName: string): Promise<ComboRunResult> => {
    return combosService.executeCombo(idOrName)
  })
}

