/** Deterministic debate detection runs before the LLM classifier. */
const DEBATE_PATTERN = /\b(debate|discuss|talk|argue)\b.*\bgemini\b|\bgemini\b.*\b(debate|discuss|talk|argue)\b/i
const STOP_PATTERN = /^stop\s*(the\s*)?(debate|conversation|agents|talking)?\s*$/i

export function detectDebateStart(prompt: string): string | null {
  if (!DEBATE_PATTERN.test(prompt)) return null
  const topic = prompt
    .replace(/^(hey\s+)?flame[,:]?\s*/i, '')
    .replace(/\b(debate|discuss|talk|argue)\b(\s+with\s+gemini)?(\s+about)?/i, '')
    .replace(/\bgemini\b/i, '')
    .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
    .trim()
  return topic || "a topic of Flame's choosing"
}

export function detectDebateStop(prompt: string): boolean {
  return STOP_PATTERN.test(prompt.trim())
}
