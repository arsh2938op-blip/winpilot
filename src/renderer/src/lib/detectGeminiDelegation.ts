/**
 * Frontend-only DISPLAY heuristic — decides whether to show the
 * Flame → Gemini two-bubble handoff. Does NOT decide what executes;
 * that's entirely Ollama's own intent classification (see ollama.ts).
 * A missed phrasing here just falls back to the normal single-bubble
 * display — no functional loss, purely cosmetic.
 */
const GEMINI_PATTERN = /^(?:tell|ask)\s+gemini\b[,:]?\s*(.*)$|^gemini[,:]\s*(.*)$/i

export function detectGeminiDelegation(text: string): string | null {
  const match = text.trim().match(GEMINI_PATTERN)
  if (!match) return null
  return (match[1] || match[2] || '').trim() || text.trim()
}
