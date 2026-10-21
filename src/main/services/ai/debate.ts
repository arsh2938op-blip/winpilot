import type { DebateEndedEvent, DebateTurnEvent } from '@shared/types'
import { IpcChannels } from '@shared/ipc-channels'
import { broadcastToRenderer, emitAgentActivity } from '../../utils/broadcast'
import { getDebateRounds } from '../../flameCore/debateStore'
import { getIntent } from './ollama'
import { askGemini } from './geminiChat'

interface DebateState {
  cancelled: boolean
}

let activeDebate: DebateState | null = null

function emitTurn(agent: DebateTurnEvent['agent'], text: string): void {
  broadcastToRenderer(IpcChannels.agent.debateTurn, { agent, text, at: Date.now() } satisfies DebateTurnEvent)
}

function emitEnded(reason: string): void {
  broadcastToRenderer(IpcChannels.agent.debateEnded, { reason, at: Date.now() } satisfies DebateEndedEvent)
}

export function isDebateRunning(): boolean {
  return activeDebate !== null && !activeDebate.cancelled
}

export function stopDebate(): void {
  if (activeDebate) activeDebate.cancelled = true
}

export async function startDebate(topic: string, requestId?: string): Promise<void> {
  if (activeDebate) stopDebate()
  const state: DebateState = { cancelled: false }
  activeDebate = state
  const maxTurns = await getDebateRounds()
  let lastMessage = ''
  let turn = 0

  emitAgentActivity(requestId, `[Debate] Starting — topic: ${topic}`)
  try {
    while (turn < maxTurns && !state.cancelled && activeDebate === state) {
      if (turn % 2 === 0) {
        emitAgentActivity(requestId, '[Debate] Sending argument to Gemini')
        const framed = lastMessage
          ? `You are debating "${topic}" with Flame. Flame just said: "${lastMessage}". Respond with your counterpoint in 2-3 sentences.`
          : `You are debating "${topic}" with Flame. Give your opening argument in 2-3 sentences.`
        try {
          lastMessage = await askGemini(framed)
          if (state.cancelled) break
          emitAgentActivity(requestId, '[Debate] Gemini response received')
          emitTurn('gemini', lastMessage)
        } catch (err) {
          emitEnded(`[Debate] Gemini error: ${err instanceof Error ? err.message : String(err)}`)
          return
        }
      } else {
        emitAgentActivity(requestId, '[Debate] Building counterargument')
        const framed = `You are debating "${topic}" with Gemini. Gemini just said: "${lastMessage}". Respond with your counterpoint in 2-3 sentences.`
        const result = await getIntent(framed, 'medium', requestId)
        if (state.cancelled) break
        lastMessage = result.reply
        emitTurn('flame', lastMessage)
      }
      turn += 1
    }
    emitEnded(state.cancelled ? '[Debate] Conversation stopped by user.' : '[Debate] Conversation limit reached.')
  } catch (err) {
    emitEnded(`[Debate] Error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (activeDebate === state) activeDebate = null
    emitAgentActivity(requestId, '[Debate] Finished')
  }
}
