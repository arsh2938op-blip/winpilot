/**
 * Error Guardian & Auto-Healing Core (src/main/services/errorGuardian.ts)
 *
 * Intercepts uncaught runtime exceptions and unhandled promise rejections
 * across the main process and user chat turns.
 *
 * Features:
 *   - Fingerprints errors using MD5 hash (message + top of stack)
 *   - Circuit-breaker guard: halts auto-healing if the exact same error hash
 *     re-occurs twice in succession to prevent runaway repair loops
 *   - Broadcasts real-time error telemetry to the frontend via IPC
 *   - Invokes the Flame Coder Engine (OpenCode / Gemini backend) in review mode
 *     (--review) to generate a staged, verifiable patch
 *   - Broadcasts the staged healing proposal to the user for explicit confirmation
 *   - Allows one-click application of staged repair patches via IPC / chat
 */

import crypto from 'node:crypto'
import { app } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ErrorGuardianIncident, HealProposalPayload } from '@shared/types'
import { broadcastToRenderer } from '../utils/broadcast'
import { runCoderTask, coderApproval, type CoderRunResult } from './ai/coderEngine'
import { getCurrentProject } from './project/store'

const errorHashHistory: string[] = []
const recentIncidents: ErrorGuardianIncident[] = []
let isHealing = false

export function initErrorGuardian(): void {
  process.on('uncaughtException', (err: Error) => {
    void handleCriticalError(err, 'uncaughtException')
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    void handleCriticalError(err, 'unhandledRejection')
  })

  console.log('[ErrorGuardian] Auto-healing watchdog initialized.')
}

export function isIgnorableError(err: Error): boolean {
  const msg = (err.message || '').toLowerCase()
  const stack = (err.stack || '').toLowerCase()
  return (
    msg.includes('econnreset') ||
    msg.includes('epipe') ||
    msg.includes('socket hang up') ||
    msg.includes('abort') ||
    msg.includes('connection closed') ||
    msg.includes('logged out') ||
    msg.includes('rate-overlimit') ||
    msg.includes('conflict') ||
    msg.includes('timed out') ||
    msg.includes('qr refs') ||
    (stack.includes('@whiskeysockets/baileys') && (msg.includes('stream') || msg.includes('disconnect') || msg.includes('close'))) ||
    (stack.includes('node:net') && msg.includes('reset'))
  )
}

export function getRecentIncidents(): ErrorGuardianIncident[] {
  return [...recentIncidents]
}

export async function triggerSelfHeal(
  err: Error,
  context?: { prompt?: string; source?: string }
): Promise<{
  hash: string
  status: string
  proposal?: CoderRunResult | null
  message: string
}> {
  if (isIgnorableError(err)) {
    console.warn(`[ErrorGuardian] Ignored transient error (${context?.source || 'manual'}):`, err.message)
    return { hash: '', status: 'ignored', message: 'Transient network error ignored.' }
  }

  const stackLines = (err.stack || '').split('\n').slice(0, 5).join('\n')
  const rawFingerprint = `${err.name}:${err.message}\n${stackLines}`
  const hash = crypto.createHash('md5').update(rawFingerprint).digest('hex').slice(0, 8)

  console.error(`[ErrorGuardian] Error reported for self-healing [hash=${hash}] (${context?.source || 'chat'}):`, err)

  // Circuit breaker check: halt if the last 2 recorded hashes match this hash
  const recentHashes = errorHashHistory.slice(-2)
  if (recentHashes.length === 2 && recentHashes[0] === hash && recentHashes[1] === hash) {
    console.error(`[ErrorGuardian] Halting auto-heal: Error [${hash}] recurred twice consecutively.`)
    const incident: ErrorGuardianIncident = {
      hash,
      errorMessage: err.message,
      stack: err.stack,
      circuitBroken: true,
      timestamp: Date.now()
    }
    recentIncidents.push(incident)
    broadcastToRenderer(IpcChannels.guardian.criticalError, incident)
    broadcastToRenderer('flame:criticalError', incident)
    return {
      hash,
      status: 'circuit_broken',
      message: `Error [${hash}] recurred twice. Auto-healing paused to avoid infinite loop.`
    }
  }

  errorHashHistory.push(hash)
  if (errorHashHistory.length > 20) {
    errorHashHistory.shift()
  }

  const incident: ErrorGuardianIncident = {
    hash,
    errorMessage: err.message,
    stack: err.stack,
    circuitBroken: false,
    timestamp: Date.now()
  }
  recentIncidents.push(incident)
  if (recentIncidents.length > 30) recentIncidents.shift()

  // Broadcast error event to UI
  broadcastToRenderer(IpcChannels.guardian.criticalError, incident)
  broadcastToRenderer('flame:criticalError', incident)

  if (isHealing) {
    console.warn('[ErrorGuardian] Healing already in progress, queuing skipped.')
    return {
      hash,
      status: 'busy',
      message: 'Another auto-healing task is currently diagnosing the codebase.'
    }
  }

  isHealing = true
  try {
    const currentProj = await getCurrentProject().catch(() => ({ path: null }))
    const projectPath = currentProj.path || app.getAppPath() || process.cwd()

    const healTask = [
      `Self-healing task triggered by runtime error [hash=${hash}]:`,
      `Context: ${context?.source || 'chat'} | Prompt: ${context?.prompt || '(none)'}`,
      `Error: ${err.name} - ${err.message}`,
      `Stack trace:\n${err.stack || '(no stack trace)'}`,
      '',
      'Inspect relevant source files, locate the root cause, and formulate a targeted minimal fix.',
      'Ensure the fix maintains safety and prevents unhandled exceptions.'
    ].join('\n')

    console.log(`[ErrorGuardian] Running Coder Engine review task for [${hash}]...`)

    const result = await runCoderTask(healTask, projectPath, {
      review: true,
      openDiff: false
    }).catch((coderErr) => {
      console.error('[ErrorGuardian] Coder task failed:', coderErr)
      return null
    })

    if (result && (result.status === 'staged' || result.status === 'applied' || (result.files && result.files.length > 0))) {
      console.log(`[ErrorGuardian] Healing proposal generated for [${hash}] with ${result.files?.length || 0} file change(s).`)
      const proposalPayload: HealProposalPayload = {
        hash,
        errorMessage: err.message,
        proposal: {
          run_id: result.run_id,
          status: result.status,
          files: result.files.map((f) => ({
            path: f.path,
            action: f.action,
            added: f.added,
            removed: f.removed
          })),
          summary: result.summary
        },
        timestamp: Date.now()
      }
      incident.proposal = proposalPayload
      broadcastToRenderer(IpcChannels.guardian.healProposal, proposalPayload)
      broadcastToRenderer('flame:healProposal', proposalPayload)

      return {
        hash,
        status: result.status,
        proposal: result,
        message: `Auto-healing patch staged (${result.files.length} file(s) modified). Run ID: ${result.run_id || 'latest'}`
      }
    } else {
      console.log(`[ErrorGuardian] No viable patch generated by Coder Engine for [${hash}].`)
      return {
        hash,
        status: 'no_patch',
        proposal: null,
        message: `Coder Engine analyzed error [${hash}] but found no immediate code patch needed.`
      }
    }
  } catch (healError) {
    console.error('[ErrorGuardian] Failed during auto-healing workflow:', healError)
    return {
      hash,
      status: 'error',
      message: `Failed during auto-healing: ${healError instanceof Error ? healError.message : String(healError)}`
    }
  } finally {
    isHealing = false
  }
}

export async function handleCriticalError(err: Error, source = 'runtime'): Promise<void> {
  await triggerSelfHeal(err, { source })
}

export async function applyHealProposal(runId?: string): Promise<{ success: boolean; message: string }> {
  try {
    const currentProj = await getCurrentProject().catch(() => ({ path: null }))
    const projectPath = currentProj.path || app.getAppPath() || process.cwd()
    const result = await coderApproval('approve', runId, projectPath)
    if (result.status === 'applied' || !result.error) {
      return { success: true, message: `Patch ${runId || 'latest'} successfully applied!` }
    }
    return { success: false, message: result.error || 'Failed to apply patch.' }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  }
}
