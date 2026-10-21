import type { AiIntentResult, AiIntentType, PromptTool, ZapierToolInfo } from '@shared/types'
import { buildPrompt } from '../../flameCore/promptBuilder'
import type { EffortLevel } from '../../flameCore/effort'
import type { FlameDifficulty } from '../../flameCore/difficultyStore'
import { emitAgentActivity } from '../../utils/broadcast'

const OLLAMA_URL = 'http://127.0.0.1:11434'
const MODEL_NAME = 'gemma2:2b'

const INTENT_SYSTEM_PROMPT_BASE = `You are Flame AGI, the assistant built into a Windows app called WinPilot. You can chat normally, control apps on the user's PC, trigger actions in apps connected through Zapier, and remember facts the user tells you to remember.

Output ONLY a single JSON object, nothing else, no markdown fences:
{"intent": "launch_app" | "install_app" | "update_app" | "uninstall_app" | "external_action" | "remember_fact" | "remember_plan" | "ai_network" | "run_command" | "current_info_search" | "start_debate" | "stop_debate" | "file_operation" | "generate_prompt" | "rsi_improve" | "code_edit" | "unknown", "app": string | null, "instruction": string | null, "factText": string | null, "planText": string | null, "aiTarget": "gemini" | "opencode" | null, "command": string | null, "query": string | null, "topic": string | null, "fileAction": "list" | "read" | "inspectZip" | "extractZip" | "search" | null, "path": string | null, "destDir": string | null, "promptTool": "claude" | "gemini" | "chatgpt" | "opencode" | "other" | null, "reply": string}

Rules:
- "open/launch/start <app>" -> intent "launch_app", app = the app's name (lowercase, just the name).
- "install/get/download <app>" -> intent "install_app", app = the app's name.
- "update/upgrade <app>" -> intent "update_app", app = the app's name.
- "uninstall/remove/delete <app>" -> intent "uninstall_app", app = the app's name.
- Any request to send a message, post, email, notify, or act in an external app/service -> intent "external_action", instruction = the user's FULL original request, unchanged.
- "talk/debate/have a conversation with gemini about <topic>" -> intent "start_debate", topic = the topic.
- "stop debate" / "stop conversation" / "stop agents" / "stop talking to gemini" -> intent "stop_debate".
- "remember that <fact>" / "remember my <fact>" / "don't forget <fact>" -> intent "remember_fact", factText = the fact stated plainly, in third person if natural (e.g. "prefers dark mode", "birthday is March 3rd").
- "remember our plan / remember this plan / next time we'll <do X>, remember that" -> intent "remember_plan", planText = the plan stated plainly (e.g. "go to the trial chamber next time").
- "ask gemini <question>" / "tell gemini <message>" / "Gemini, <anything>" -> intent "ai_network", aiTarget = "gemini", instruction = the question/message, unchanged.
- "ask opencode <question>" / "tell opencode <message>" / "OpenCode, <anything>" -> intent "ai_network", aiTarget = "opencode", instruction = the question/message, unchanged.
- Requests to actually CHANGE code in the project ("fix the bug in X", "add validation to Y", "refactor Z", "make X work", "Edit: <task>") -> intent "code_edit", instruction = just the coding task (strip an "Edit:" prefix if present). Only use this when files should be modified; pure questions/what-is explanations stay "ai_network".
- "run <command>" / "show me the files here" / "create a folder called X" / "open the project folder and run X" -> intent "run_command", command = the precise command text (e.g. "npm run dev", "dir", "mkdir test").
- Explicit requests for CURRENT/latest/today information ("what happened today", "latest news about X", "look this up", "search for the latest X", "current affairs about X") -> intent "current_info_search", query = the topic. Do NOT use this for normal factual/conversational questions like "tell me about Minecraft" — only when the user explicitly signals they want current/latest/searched information.
- "list files in <path>" -> file_operation, fileAction "list", path = the folder.
- "read <file>" -> file_operation, fileAction "read", path = the file.
- "what's in this zip <path>" / inspect a ZIP -> file_operation, fileAction "inspectZip", path = the ZIP.
- "extract <zip> [to <folder>]" -> file_operation, fileAction "extractZip", path = the ZIP, destDir = optional destination.
- "search for <text> in <folder>" -> file_operation, fileAction "search", query = exact text, path = folder.
- "create/write/generate a prompt for <tool> to <task>" -> generate_prompt, promptTool = target tool, instruction = the task.
- "improve this project by <task>" / "use OpenCode to implement <task>" -> rsi_improve, instruction = the requested improvement.
- For EVERYTHING ELSE — greetings, questions, small talk, advice, general knowledge — set intent to "unknown", other fields null, and write a real, genuinely helpful, conversational answer in "reply". Use any facts listed below naturally if relevant — don't mention that you were "given" them, just know them.
- For app-related, external_action, and remember_fact intents, "reply" should be a short status line.
- Output ONLY the JSON object. No text before or after it.`

const VALID_INTENTS: AiIntentType[] = [
  'launch_app',
  'install_app',
  'update_app',
  'uninstall_app',
  'external_action',
  'remember_fact',
  'remember_plan',
  'ai_network',
  'run_command',
  'current_info_search',
  'start_debate',
  'stop_debate',
  'file_operation',
  'generate_prompt',
  'rsi_improve',
  'code_edit'
]

interface OllamaGenerateResponse {
  response: string
}

async function callOllama(
  system: string,
  prompt: string,
  numPredict = 400,
  requestId?: string,
  formatJson = true
): Promise<string> {
  emitAgentActivity(requestId, '[AI] Sending request to model')
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_NAME,
      system,
      prompt,
      stream: false,
      ...(formatJson ? { format: 'json' } : {}),
      options: { temperature: 0.5, num_predict: numPredict }
    })
  })
  if (!res.ok) throw new Error(`Ollama request failed (${res.status}). Is Ollama running?`)
  emitAgentActivity(requestId, '[AI] Writing response…')
  const data = (await res.json()) as OllamaGenerateResponse
  emitAgentActivity(requestId, '[AI] Response received')
  return data.response
}

function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw)
}

export async function checkOllamaStatus(): Promise<{ running: boolean; modelReady: boolean }> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!res.ok) return { running: false, modelReady: false }
    const data = (await res.json()) as { models?: { name: string }[] }
    const modelReady = !!data.models?.some((m) => m.name.startsWith(MODEL_NAME.split(':')[0]))
    return { running: true, modelReady }
  } catch {
    return { running: false, modelReady: false }
  }
}

export async function getIntent(
  prompt: string,
  effort: EffortLevel = 'medium',
  requestId?: string,
  difficulty?: FlameDifficulty
): Promise<AiIntentResult> {
  emitAgentActivity(requestId, '[Prompt] Building context…')
  const { system, numPredict } = await buildPrompt(INTENT_SYSTEM_PROMPT_BASE, effort, requestId, difficulty)

  try {
    const raw = await callOllama(system, prompt, numPredict, requestId)
    const parsed = extractJson(raw) as {
      intent?: string
      app?: string | null
      instruction?: string | null
      factText?: string | null
      planText?: string | null
      aiTarget?: string | null
      command?: string | null
      query?: string | null
      topic?: string | null
      fileAction?: string | null
      path?: string | null
      destDir?: string | null
      promptTool?: string | null
      reply?: string
    }

    const intent: AiIntentType = VALID_INTENTS.includes(parsed.intent as AiIntentType)
      ? (parsed.intent as AiIntentType)
      : 'unknown'

    const appIntents: AiIntentType[] = ['launch_app', 'install_app', 'update_app', 'uninstall_app']

    return {
      intent,
      app: appIntents.includes(intent) ? parsed.app ?? undefined : undefined,
      instruction:
        intent === 'external_action' || intent === 'ai_network' || intent === 'generate_prompt' || intent === 'rsi_improve' || intent === 'code_edit'
          ? parsed.instruction ?? undefined
          : undefined,
      factText: intent === 'remember_fact' ? parsed.factText ?? undefined : undefined,
      planText: intent === 'remember_plan' ? parsed.planText ?? undefined : undefined,
      aiTarget:
        intent === 'ai_network' && (parsed.aiTarget === 'gemini' || parsed.aiTarget === 'opencode')
          ? parsed.aiTarget
          : undefined,
      command: intent === 'run_command' ? parsed.command ?? undefined : undefined,
      query: intent === 'current_info_search' ? parsed.query ?? undefined : undefined,
      topic: intent === 'start_debate' ? parsed.topic ?? undefined : undefined,
      fileAction: intent === 'file_operation' && ['list', 'read', 'inspectZip', 'extractZip', 'search'].includes(parsed.fileAction ?? '')
        ? parsed.fileAction as AiIntentResult['fileAction'] : undefined,
      path: intent === 'file_operation' ? parsed.path ?? undefined : undefined,
      destDir: intent === 'file_operation' ? parsed.destDir ?? undefined : undefined,
      promptTool: intent === 'generate_prompt' && ['claude', 'gemini', 'chatgpt', 'opencode', 'other'].includes(parsed.promptTool ?? '')
        ? parsed.promptTool as PromptTool : undefined,
      reply: parsed.reply || "I'm not sure how to help with that yet.",
      rawPrompt: prompt
    }
  } catch {
    return {
      intent: 'unknown',
      reply: "I didn't quite catch that — could you rephrase?",
      rawPrompt: prompt
    }
  }
}

/**
 * Step 2 of external-action handling: given the user's instruction and
 * the tools actually available on their Zapier MCP connection, ask the
 * model which single tool fits. Kept as its own focused call (rather than
 * folded into the main intent prompt) so each call's job stays small
 * enough for a 2B model to do reliably — this list also changes over
 * time as the user connects more apps, so it can't be baked into the
 * main system prompt anyway.
 */
export async function chooseZapierTool(
  instruction: string,
  tools: ZapierToolInfo[]
): Promise<string | null> {
  if (tools.length === 0) return null

  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
  const system = `You are picking which single tool best matches a user's request. Available tools:\n${toolList}\n\nOutput ONLY JSON: {"tool": "<exact tool name from the list>" | null}. Use null if nothing fits well. No other text.`

  try {
    const raw = await callOllama(system, instruction, 100)
    const parsed = extractJson(raw) as { tool?: string | null }
    return parsed.tool && tools.some((t) => t.name === parsed.tool) ? parsed.tool : null
  } catch {
    return null
  }
}

/**
 * Step 3: fills in a chosen tool's arguments using its REAL schema field
 * names (fetched live from Zapier via MCP), rather than the model
 * guessing field names itself. This is what lets one code path work
 * across arbitrarily different tools/apps without per-app logic.
 */
export async function fillToolArguments(
  instruction: string,
  toolName: string,
  schemaProperties: Record<string, { type?: string; description?: string }>
): Promise<Record<string, unknown>> {
  const fields = Object.entries(schemaProperties)
    .map(([key, value]) => `- ${key} (${value.type ?? 'string'}): ${value.description ?? ''}`)
    .join('\n')

  const system = `You are filling in arguments to call the tool "${toolName}". Its fields:\n${fields}\n\nOutput ONLY a JSON object with those exact field names as keys, filled in based on the user's request. Omit fields you can't determine. No other text.`

  try {
    const raw = await callOllama(system, instruction, 300)
    return extractJson(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function generatePromptArtifact(tool: string, task: string, requestId?: string): Promise<string> {
  const system = 'You write clear, complete, well-structured prompts for other AI tools. Output ONLY the prompt text itself — no preamble, no explanation, no markdown fences.'
  return callOllama(system, `Write a prompt for ${tool} to accomplish: ${task}`, 500, requestId, false)
}