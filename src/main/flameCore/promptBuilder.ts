import { renderPersonalityPreamble } from './personality'
import { getMemoryContext, getPlansContext } from '../services/memory/store'
import { emitAgentActivity } from '../utils/broadcast'
import type { EffortLevel } from './effort'
import { DIFFICULTY_PROFILES, type FlameDifficulty } from './difficultyStore'

export interface BuiltPrompt {
  system: string
  numPredict: number
}

/**
 * Assembles the system prompt modularly: base instructions plus
 * effort-appropriate memory context. LOW skips memory retrieval.
 */
export async function buildPrompt(
  baseInstructions: string,
  effort: EffortLevel,
  requestId?: string,
  difficulty: FlameDifficulty = 'normal'
): Promise<BuiltPrompt> {
  const parts = [renderPersonalityPreamble(), baseInstructions]

  if (effort === 'low') {
    return { system: parts.join('\n\n'), numPredict: 200 }
  }

  const profile = DIFFICULTY_PROFILES[difficulty]
  emitAgentActivity(requestId, '[Memory] Recalling relevant context…')
  const baseMemoryLimit = effort === 'high' ? 30 : 15
  const basePlansLimit = effort === 'high' ? 20 : 10
  const memoryLimit = Math.round(baseMemoryLimit * profile.memoryScale)
  const plansLimit = Math.round(basePlansLimit * profile.memoryScale)
  const [facts, plans] = await Promise.all([getMemoryContext(memoryLimit), getPlansContext(plansLimit)])
  if (facts) parts.push(`Things you know about the user:\n${facts}`)
  if (plans) parts.push(`Plans:\n${plans}`)
  if (profile.verify) parts.push('Before finalizing, briefly double-check your reasoning for correctness and completeness.')
  emitAgentActivity(requestId, '[Memory] Context ready')

  const baseNumPredict = effort === 'high' ? 700 : 400
  return { system: parts.join('\n\n'), numPredict: Math.round(baseNumPredict * profile.numPredictScale) }
}
