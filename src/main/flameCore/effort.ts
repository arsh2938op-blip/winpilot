export type EffortLevel = 'low' | 'medium' | 'high'

const HIGH_SIGNAL_WORDS = [
  'analyze', 'analyse', 'design', 'architecture', 'plan out', 'debug',
  'why did', 'complicated', 'complex', 'optimi', 'refactor', 'strategy',
  'evaluate', 'multi-step', 'in detail', 'thoroughly', 'comprehensive', 'build a'
]
const LOW_SIGNAL_PATTERNS = [
  /^(hi|hey|hello|yo|sup)\b/i,
  /^what('?s| is) (my|your) name/i,
  /^(thanks|thank you|ok|okay|cool)\b/i,
  /^(follow|stop|wait|come here)\b/i
]

/**
 * A fast heuristic, deliberately NOT a second model call — an extra
 * classification request would itself add latency to every message
 * including "hi", defeating the point of a LOW tier. This runs in
 * microseconds and directly controls how much real work follows.
 */
export function classifyEffort(prompt: string): EffortLevel {
  const text = prompt.trim()
  const wordCount = text.split(/\s+/).filter(Boolean).length

  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(text)) && wordCount <= 6) return 'low'

  const lower = text.toLowerCase()
  const highSignals = HIGH_SIGNAL_WORDS.filter((word) => lower.includes(word)).length
  const sentenceCount = (text.match(/[.!?]+/g) || []).length

  if (highSignals >= 1 || wordCount > 40 || sentenceCount >= 3) return 'high'
  if (wordCount <= 8) return 'low'
  return 'medium'
}
