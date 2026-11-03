import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { triggerSelfHeal, applyHealProposal, getRecentIncidents } from '../services/errorGuardian'

export function registerGuardianIpc(): void {
  ipcMain.handle(
    IpcChannels.guardian.reportError,
    async (_event, errorMessage: string, stack?: string, source?: string) => {
      const err = new Error(errorMessage)
      if (stack) err.stack = stack
      return triggerSelfHeal(err, { source: source || 'rendererReport' })
    }
  )

  ipcMain.handle(IpcChannels.guardian.applyHeal, async (_event, runId?: string) => {
    return applyHealProposal(runId)
  })

  ipcMain.handle(IpcChannels.guardian.criticalError, async () => {
    return getRecentIncidents()
  })
}

