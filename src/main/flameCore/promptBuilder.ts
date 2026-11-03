import { renderPersonalityPreamble } from './personality'
import { getMemoryContext, getPlansContext } from '../services/memory/store'
import { whatsappEngine } from '../services/whatsapp'
import { getUserProfile } from '../services/profile/userProfileStore'
import { emitAgentActivity } from '../utils/broadcast'
import type { EffortLevel } from './effort'
import { DIFFICULTY_PROFILES, type FlameDifficulty } from './difficultyStore'

export interface BuiltPrompt {
  system: string
  numPredict: number
}

export const COMPUTER_USE_PROTOCOL = `
[FLAME COMPUTER USE OPERATIONAL PROTOCOL]
When controlling the Windows desktop, clicking, typing, focusing windows, or navigating user applications:
1. FOCUS OR INSPECT FIRST:
   - Identify the active window or target UI. Bring target window to foreground via 'computer.window_control' or take a snapshot via 'computer.capture_screen'.
   - Never blind-click without knowing screen resolution and active window coordinates.
2. CALCULATE EXACT COORDINATES:
   - Calculate exact (X, Y) pixel coordinates of the target control relative to the primary display.
   - Respect safety boundaries: fail-safe abort triggers if cursor is placed at (X <= 4, Y <= 4).
3. EXECUTE POINTER / KEYBOARD ACTION:
   - Invoke 'computer.pointer_action' (mode: left_click | right_click | double_click | move | drag | scroll) with verified target coordinates.
   - Invoke 'computer.keyboard_input' (mode: literal | hotkey) to send text or shortcut keys.
4. VERIFY:
   - Capture screen or re-inspect window state to confirm the desired UI state change occurred. If not, recover gracefully or notify user.
`.trim()

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
  const parts = [renderPersonalityPreamble(), baseInstructions, COMPUTER_USE_PROTOCOL]

  if (effort === 'low') {
    return { system: parts.join('\n\n'), numPredict: 200 }
  }

  const profile = DIFFICULTY_PROFILES[difficulty]
  emitAgentActivity(requestId, '[Memory] Recalling relevant context…')

  try {
    const userProfile = await getUserProfile()
    parts.push(
      `The user's name/nickname is "${userProfile.nickname}" (username: "${userProfile.username}"). Address them naturally by this name in conversation. The user's preferred conversation tone is: "${userProfile.preferred_ai_tone}". The Minecraft bot recognizes "${userProfile.nickname}" and "${userProfile.username}" as authorized leaders alongside "Emperorop7528".`
    )
  } catch {
    parts.push('The user\'s name/nickname is "Arsh". Address them naturally by this name in conversation.')
  }

  const baseMemoryLimit = effort === 'high' ? 30 : 15
  const basePlansLimit = effort === 'high' ? 20 : 10
  const memoryLimit = Math.round(baseMemoryLimit * profile.memoryScale)
  const plansLimit = Math.round(basePlansLimit * profile.memoryScale)
  const [facts, plans] = await Promise.all([getMemoryContext(memoryLimit), getPlansContext(plansLimit)])
  if (facts) parts.push(`Things you know about the user:\n${facts}`)
  if (plans) parts.push(`Plans:\n${plans}`)

  // Inject WhatsApp Shared Brain facts and member profiles
  try {
    const waBrain = whatsappEngine.getSharedBrain()
    if (waBrain) {
      const waSections: string[] = []
      if (waBrain.flameSharedFacts?.length > 0) {
        waSections.push(`Shared Brain Facts (WhatsApp + Desktop):\n${waBrain.flameSharedFacts.map((f) => `• ${f}`).join('\n')}`)
      }
      const memberEntries = Object.entries(waBrain.members || {})
      if (memberEntries.length > 0) {
        const memberList = memberEntries.slice(0, 15).map(([jid, m]) => {
          const notes = m.customNotes?.length ? ` | Notes: ${m.customNotes.join('; ')}` : ''
          return `• ${m.pushName} (${jid}): ${m.roleOrVibe} (warnings: ${m.warnings}/7, msgs: ${m.messageCount})${notes}`
        }).join('\n')
        waSections.push(`Known WhatsApp Group Members & Profiles:\n${memberList}`)
      }
      if (waSections.length > 0) {
        parts.push(waSections.join('\n\n'))
      }
    }
  } catch {
    // ignore
  }

  if (profile.verify) parts.push('Before finalizing, briefly double-check your reasoning for correctness and completeness.')
  emitAgentActivity(requestId, '[Memory] Context ready')

  const baseNumPredict = effort === 'high' ? 700 : 400
  return { system: parts.join('\n\n'), numPredict: Math.round(baseNumPredict * profile.numPredictScale) }
}
