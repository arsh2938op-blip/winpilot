import type { AiNetworkConfig, AiNetworkEndpoint } from '@shared/types'
import { askGemini } from '../ai/geminiChat'
import { emitAgentActivity } from '../../utils/broadcast'
import { endpointsForRole } from './config'

/**
 * Task-mode router.
 *
 * Chat mode is handled by the existing intent pipeline. Task mode is a small
 * federation:
 *
 *   Flame (local Qwen)  → fast triage: is this an edit, a question, or a
 *                         worker command? Optionally rewrites the task into
 *                         a precise instruction.
 *   OpenCode            → executes edits (`coding` role), either over HTTP
 *                         (`transport: "http"`) or the local CLI (`cli`).
 *   Gemini              → heavy reasoning: answers code questions, and can
 *                         supply an implementation plan for large tasks.
 *
 * Every endpoint is resolved from the user's `.flame/coder_config.json`, so
 * adding a fourth collaborator is a config edit, not a code change.
 */

export interface TriageResult {
  kind: 'edit' | 'question'
  task: string
  reason: string
  backend: 'flame' | 'heuristic'
}

const QUESTION_START = /^(what|why|how|where|when|who|which|explain|describe|summari[sz]e|analy[sz]e|review|tell me about|can you explain|is there|are there|does|do)\b/i

function heuristicTriage(task: string): TriageResult {
  const text = task.trim()
  const question = /\?\s*$/.test(text) || QUESTION_START.test(text)
  return {
    kind: question ? 'question' : 'edit',
    task: text,
    reason: question ? 'looks like a question' : 'looks like a code change request',
    backend: 'heuristic'
  }
}

async function callOllama(
  endpoint: AiNetworkEndpoint,
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = (): void => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await fetch(`${endpoint.baseUrl.replace(/\/+$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model: endpoint.model, prompt, stream: false, options: { temperature: 0.1 } })
    })
    if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
    const data = (await res.json()) as { response?: string }
    return (data.response ?? '').trim()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Ask the local reflex model to classify (and lightly refine) a Task prompt. */
export async function triageTask(
  task: string,
  config: AiNetworkConfig,
  requestId?: string,
  signal?: AbortSignal
): Promise<TriageResult> {
  const heuristic = heuristicTriage(task)
  const flame = endpointsForRole(config, 'task', 'triage')[0]
  if (!flame || flame.kind !== 'ollama') return heuristic

  const instruction = [
    'You are the routing reflex for a coding assistant.',
    'Classify the user task as exactly one word: EDIT or QUESTION.',
    'EDIT means files must be created or modified. QUESTION means the user only wants information.',
    'Then rewrite the task as one precise sentence for an autonomous coding agent.',
    'Reply ONLY as compact JSON: {"kind":"edit|question","task":"..."}',
    '',
    `TASK: ${task}`
  ].join('\n')

  try {
    emitAgentActivity(requestId, `[AI Network] Triage via ${flame.label} (${flame.model})`)
    const raw = await callOllama(flame, instruction, 12_000, signal)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return heuristic
    const parsed = JSON.parse(match[0]) as { kind?: string; task?: string }
    const kind = parsed.kind?.toLowerCase() === 'question' ? 'question' : 'edit'
    return {
      kind,
      task: (parsed.task ?? task).trim() || task,
      reason: `classified by ${flame.label}`,
      backend: 'flame'
    }
  } catch {
    // A triage failure must never block the task; fall back to the heuristic.
    return heuristic
  }
}

/** Gemini plan for a large task. Returns '' when unavailable. */
export async function planWithGemini(
  task: string,
  config: AiNetworkConfig,
  requestId?: string,
  signal?: AbortSignal
): Promise<string> {
  const gemini = endpointsForRole(config, 'task', 'reasoning')[0]
  if (!gemini || gemini.kind !== 'gemini') return ''
  if (task.length < 350) return ''
  try {
    emitAgentActivity(requestId, `[AI Network] Planning via ${gemini.label}`)
    const plan = await askGemini(
      'You are a senior engineer. Produce a terse, numbered implementation plan (max 6 steps) for the task below. ' +
      'No code blocks, no preamble.\n\nTASK:\n' + task,
      signal
    )
    return plan.trim()
  } catch {
    return ''
  }
}

/** Answer a Task-mode question using the network: Gemini first, local second. */
export async function answerFromNetwork(
  question: string,
  config: AiNetworkConfig,
  requestId?: string,
  signal?: AbortSignal
): Promise<{ text: string; backend: string }> {
  const gemini = endpointsForRole(config, 'task', 'reasoning')[0]
  if (gemini?.kind === 'gemini') {
    try {
      emitAgentActivity(requestId, `[AI Network] Reasoning via ${gemini.label}`)
      const text = await askGemini(question, signal)
      if (text) return { text, backend: gemini.label }
    } catch {
      // fall through to local
    }
  }

  const flame = endpointsForRole(config, 'task', 'triage')[0]
  if (flame?.kind === 'ollama') {
    try {
      emitAgentActivity(requestId, `[AI Network] Answering locally via ${flame.label}`)
      const text = await callOllama(flame, question, 60_000, signal)
      if (text) return { text, backend: flame.label }
    } catch {
      // nothing left
    }
  }

  return { text: '', backend: 'none' }
}

/** The coding collaborator for Task mode (HTTP when configured, else CLI). */
export function resolveCodingEndpoint(config: AiNetworkConfig): AiNetworkEndpoint | undefined {
  return endpointsForRole(config, 'task', 'coding').find((endpoint) => endpoint.kind === 'opencode')
}
