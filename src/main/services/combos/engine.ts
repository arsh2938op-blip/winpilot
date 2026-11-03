import { app, BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  Combo,
  ComboStep,
  ComboRunResult,
  ComboStepExecutionResult,
  ComboProgressEvent
} from '@shared/types'
import { launchApp } from '../apps/launchApp'
import { runCommand } from '../../utils/runCommand'
import { getMainWindow } from '../appWindow'
import { disableOrb } from '../orb/window'
import { getCombo, updateLastRun } from './store'
import { parseMacroSteps } from './parser'

function broadcastComboProgress(event: ComboProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IpcChannels.combos.onProgress, event)
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Focuses a window by process name or window title using Windows Script Host.
 */
async function focusWindow(target: string): Promise<{ success: boolean; message: string }> {
  try {
    const escaped = target.replace(/'/g, "''")
    const psScript = `$t = '${escaped}'; $p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$t*" -or $_.ProcessName -like "*$t*" } | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id); 'OK' } else { 'NOT_FOUND' }`

    const { stdout } = await runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript])
    if (stdout.includes('OK')) {
      return { success: true, message: `Focused window matching "${target}".` }
    }
    return { success: false, message: `No active window found matching "${target}".` }
  } catch (err) {
    return {
      success: false,
      message: `Failed to focus "${target}": ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

/**
 * Executes a single Combo step.
 */
export async function executeStep(step: ComboStep): Promise<ComboStepExecutionResult> {
  const normTarget = step.target.toLowerCase().trim()

  // 1. Special System Commands
  if (step.action === 'system_command' || normTarget === 'close yourself' || normTarget === 'close flame' || normTarget === 'close pet mode') {
    if (normTarget === 'close yourself') {
      setTimeout(() => {
        app.quit()
      }, 700)
      return {
        stepId: step.id,
        action: 'system_command',
        target: 'close yourself',
        success: true,
        message: 'Shutdown signal sent. FlameAGI is terminating.'
      }
    }

    if (normTarget === 'close flame') {
      setTimeout(() => {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.close()
        }
      }, 500)
      return {
        stepId: step.id,
        action: 'system_command',
        target: 'close flame',
        success: true,
        message: 'Closing Flame main window.'
      }
    }

    if (normTarget === 'close pet mode') {
      try {
        disableOrb()
        return {
          stepId: step.id,
          action: 'system_command',
          target: 'close pet mode',
          success: true,
          message: 'Pet Mode dismissed successfully.'
        }
      } catch (err) {
        return {
          stepId: step.id,
          action: 'system_command',
          target: 'close pet mode',
          success: false,
          message: `Failed to close Pet Mode: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }
  }

  // 2. Window Focus
  if (step.action === 'focus_window') {
    const res = await focusWindow(step.target)
    return {
      stepId: step.id,
      action: 'focus_window',
      target: step.target,
      success: res.success,
      message: res.message
    }
  }

  // 3. Terminal Commands
  if (step.action === 'command') {
    try {
      const res = await runCommand('cmd.exe', ['/c', step.target], { timeoutMs: 30_000 })
      return {
        stepId: step.id,
        action: 'command',
        target: step.target,
        success: true,
        message: res.stdout || 'Command completed.'
      }
    } catch (err) {
      return {
        stepId: step.id,
        action: 'command',
        target: step.target,
        success: false,
        message: `Command failed: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  // 4. Standard App Launching (Default)
  try {
    const launchRes = await launchApp(step.target)
    return {
      stepId: step.id,
      action: 'launch_app',
      target: step.target,
      success: launchRes.success,
      message: launchRes.message
    }
  } catch (err) {
    return {
      stepId: step.id,
      action: 'launch_app',
      target: step.target,
      success: false,
      message: `Failed to launch ${step.target}: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

/**
 * Runs a complete Combo sequence by ID or Combo object.
 */
export async function executeCombo(comboOrId: string | Combo): Promise<ComboRunResult> {
  const combo = typeof comboOrId === 'string' ? await getCombo(comboOrId) : comboOrId

  if (!combo) {
    return {
      comboId: typeof comboOrId === 'string' ? comboOrId : 'unknown',
      comboName: 'Unknown',
      success: false,
      message: `Combo not found: ${typeof comboOrId === 'string' ? comboOrId : 'undefined'}`,
      stepsExecuted: []
    }
  }

  const steps = combo.steps && combo.steps.length > 0
    ? combo.steps
    : parseMacroSteps(combo.toDo || '')

  if (steps.length === 0) {
    return {
      comboId: combo.id,
      comboName: combo.name,
      success: false,
      message: 'No steps defined for this combo.',
      stepsExecuted: []
    }
  }

  const results: ComboStepExecutionResult[] = []

  broadcastComboProgress({
    comboId: combo.id,
    stepIndex: 0,
    totalSteps: steps.length,
    stepTarget: combo.name,
    status: 'running',
    message: `Starting combo: ${combo.name}`
  })

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    broadcastComboProgress({
      comboId: combo.id,
      stepIndex: i + 1,
      totalSteps: steps.length,
      stepTarget: step.target,
      status: 'running',
      message: `Executing step ${i + 1}/${steps.length}: ${step.description || step.target}`
    })

    const stepResult = await executeStep(step)
    results.push(stepResult)

    if (!stepResult.success) {
      console.warn(`[Combos] Step ${i + 1} failed:`, stepResult.message)
    }

    // Delay between steps (e.g. 700ms) unless it's the last step
    if (i < steps.length - 1) {
      await delay(step.waitMsAfter || 700)
    }
  }

  await updateLastRun(combo.id)

  const hasFailures = results.some((r) => !r.success)
  const finalStatus = hasFailures ? 'error' : 'success'
  const summaryMessage = hasFailures
    ? `Completed with warnings (${results.filter((r) => r.success).length}/${steps.length} succeeded)`
    : `Executed all ${steps.length} step(s) successfully.`

  broadcastComboProgress({
    comboId: combo.id,
    stepIndex: steps.length,
    totalSteps: steps.length,
    stepTarget: combo.name,
    status: finalStatus,
    message: summaryMessage
  })

  return {
    comboId: combo.id,
    comboName: combo.name,
    success: !hasFailures,
    message: summaryMessage,
    stepsExecuted: results
  }
}

