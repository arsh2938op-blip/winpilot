import type { AiResponse, AiIntentType, ChatModelId, ChatMode } from '@shared/types'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { getIntent, checkOllamaStatus, generatePromptArtifact } from './ollama'
import {
  executeDomainOsint,
  executeIpOsint,
  executePhoneOsint,
  executeIdentityOsint
} from '../../plugins/osint/capabilities'
import {
  executeReaInspectFile,
  executeReaInspectAsar,
  executeReaAuditWorkspace,
  executeReaGenerateFolder,
  executeReaExportZip,
  executeReaCodeOnEvidence
} from '../../plugins/rea/capabilities'
import * as winget from '../winget'
import { findBestMatch } from '../winget/matchPackage'
import { getCapability, getDisabledReason } from '../../flameCore/capabilities'
import { isPluginActive } from '../../flameCore/pluginManager'
import { generateImage } from '../image'
import { listDueMessages, addDueMessage, completeDueMessage } from '../dueMessages'
import { classifyEffort } from '../../flameCore/effort'
import { emitAgentActivity, emitAgentStatus, emitSkillUnlocked } from '../../utils/broadcast'
import { detectDebateStart, detectDebateStop } from './debateTrigger'
import { getDifficulty } from '../../flameCore/difficultyStore'
import { isDebateRunning, startDebate, stopDebate } from './debate'
import type { EffortLevel } from '../../flameCore/effort'
import { getCurrentProject } from '../project/store'
import { listImportedProjects } from '../projects/store'
import { parseEditPrompt, interruptCoderEngine, runCoderTask, formatRunResult } from './coderEngine'
import { formatTaskResult, interruptOpenCode, runTaskMode } from '../coder/nativeCoder'
import { setActiveChatMode } from '../aiNetwork/mode'
import * as combosService from '../combos'
import { triggerSelfHeal, getRecentIncidents } from '../errorGuardian'
import { whatsappEngine } from '../whatsapp'

const activeControllers = new Set<AbortController>()

export function interruptActiveTasks(): void {
  for (const c of activeControllers) {
    try {
      c.abort()
    } catch {
      // ignore
    }
  }
  activeControllers.clear()
  stopDebate()
  interruptCoderEngine()
  interruptOpenCode()
  emitAgentActivity(undefined, '[Flame] Interrupted by user')
  emitAgentStatus('idle', 'Ready')
}

export async function handlePrompt(
  prompt: string,
  model: ChatModelId = 'gemma',
  requestId?: string,
  effortOverride?: EffortLevel | 'auto',
  mode: ChatMode = 'chat'
): Promise<AiResponse> {
  const controller = new AbortController()
  activeControllers.add(controller)
  try {
    const res = await executePrompt(prompt, model, requestId, effortOverride, controller.signal, mode)
    void whatsappEngine.addDesktopConversation('User', prompt).catch(() => {})
    if (res.reply && res.reply !== 'Interrupted.') {
      void whatsappEngine.addDesktopConversation('FlameAGI', res.reply.slice(0, 300)).catch(() => {})
    }
    return res
  } catch (err: unknown) {
    if (controller.signal.aborted || (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted')))) {
      emitAgentActivity(requestId, '[Flame] Task interrupted')
      return { reply: 'Interrupted.', intent: 'unknown', actionSuccess: false, mode }
    }
    const errorObj = err instanceof Error ? err : new Error(String(err))
    console.error('[AI] Prompt execution error:', errorObj)
    void triggerSelfHeal(errorObj, { prompt, source: 'chatPrompt' })
    return {
      reply: `⚠️ **Error Encountered:** ${errorObj.message}\n\n🛡️ **Flame Auto-Healing Core Triggered**\nAnalyzing error context with Flame Coder Engine to formulate a repair patch. You can review and apply the patch once staged or say \`approve\`.`,
      intent: 'unknown',
      actionSuccess: false,
      mode
    }
  } finally {
    activeControllers.delete(controller)
  }
}

async function executePrompt(
  prompt: string,
  model: ChatModelId = 'gemma',
  requestId?: string,
  effortOverride?: EffortLevel | 'auto',
  signal?: AbortSignal,
  mode: ChatMode = 'chat'
): Promise<AiResponse> {
  setActiveChatMode(mode)
  emitAgentActivity(requestId, `[Flame] Request received (${mode} mode)`)

  if (detectDebateStop(prompt)) {
    const wasRunning = isDebateRunning()
    stopDebate()
    emitAgentActivity(requestId, '[Flame] Task complete')
    return {
      reply: wasRunning ? 'Stopping the conversation…' : 'No conversation is currently running.',
      intent: 'stop_debate',
      actionSuccess: true
    }
  }
  const debateTopic = detectDebateStart(prompt)
  if (debateTopic) {
    void startDebate(debateTopic, requestId)
    emitAgentActivity(requestId, '[Flame] Task complete')
    return { reply: `Starting a conversation with Gemini about: ${debateTopic}`, intent: 'start_debate', actionSuccess: true }
  }

  /* ---- Due Messages / Deferred Tasks fast-paths ---- */
  const dueAddMatch = prompt.match(
    /^\s*(?:\/?due(?:\s+later)?|\/?remind(?:\s+me)?(?:\s+to)?|add\s+due(?:\s+task)?)\s*[:=-]?\s*(.+)$/i
  )
  if (dueAddMatch) {
    if (!isPluginActive('dueMessages')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Due Messages & Deferred Tasks plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const rawTask = dueAddMatch[1].trim()
    let title = rawTask
    let dueHint: string | undefined
    const hintMatch = rawTask.match(/^(.+?)\s+(?:in\s+(\d+\s*(?:mins?|minutes?|hours?|hrs?|days?))|at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|(tomorrow|tonight|next\s+week))$/i)
    if (hintMatch) {
      title = hintMatch[1].trim()
      dueHint = (hintMatch[2] || hintMatch[3] || hintMatch[4])?.trim()
    }
    try {
      const added = await addDueMessage({
        title,
        dueHint,
        workspaceContext: 'chat'
      })
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: `📌 **Deferred Task Scheduled:** "${added.title}"${added.dueHint ? ` *(due ${added.dueHint})*` : ''}\n\nTask registered under ID \`${added.id}\`. You can check pending tasks anytime by saying \`list due\` or from the Due Tasks bar above.`,
        intent: 'unknown',
        actionSuccess: true
      }
    } catch (err) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: `Failed to create due task: ${err instanceof Error ? err.message : String(err)}`,
        intent: 'unknown',
        actionSuccess: false
      }
    }
  }

  if (
    /^\s*(?:list|show|view|get)\s+(?:due(?:\s+messages?|\s+tasks?)?|reminders?)\s*$/i.test(prompt) ||
    /^\s*what(?:'s|\s+is)\s+due\s*$/i.test(prompt)
  ) {
    if (!isPluginActive('dueMessages')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Due Messages & Deferred Tasks plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const pending = await listDueMessages({ status: 'pending' })
    emitAgentActivity(requestId, '[Flame] Task complete')
    if (pending.length === 0) {
      return {
        reply: '🎉 You have no pending due tasks right now! You can add one by typing `/due <task>` or clicking **Due Later**.',
        intent: 'unknown',
        actionSuccess: true
      }
    }
    const taskList = pending
      .map((t, idx) => `${idx + 1}. **${t.title}**${t.dueHint ? ` *(due ${t.dueHint})*` : ''} — \`${t.id}\``)
      .join('\n')
    return {
      reply: `📋 **Pending Due Tasks (${pending.length}):**\n\n${taskList}\n\nTo complete a task, say \`complete due <task or id>\` or check it off in the Due Tasks bar.`,
      intent: 'unknown',
      actionSuccess: true
    }
  }

  const completeDueMatch = prompt.match(/^\s*(?:complete|finish|done|dismiss)\s+due(?:\s+task)?\s+(.+)$/i)
  if (completeDueMatch) {
    if (!isPluginActive('dueMessages')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Due Messages & Deferred Tasks plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const target = completeDueMatch[1].trim()
    const completed = await completeDueMessage(target)
    emitAgentActivity(requestId, '[Flame] Task complete')
    if (completed) {
      return {
        reply: `✅ **Task Completed:** "${completed.title}" has been marked as finished.`,
        intent: 'unknown',
        actionSuccess: true
      }
    }
    return {
      reply: `Could not find any pending due task matching "${target}".`,
      intent: 'unknown',
      actionSuccess: false
    }
  }

  /* ---- Gemini Image Generation fast-path: "/image <prompt>", "generate an image of <prompt>", "draw <prompt>" ---- */
  const imageMatch = prompt.match(
    /^\s*(?:\/?image(?:\s+generate)?|\/?draw|generate(?:\s+(?:an?|the))?\s+(?:image|picture|photo|graphic|illustration|drawing)(?:\s+(?:of|for))?|create(?:\s+(?:an?|the))?\s+(?:image|picture|photo|illustration)(?:\s+(?:of|for))?|make(?:\s+(?:an?|the))?\s+(?:image|picture|photo)(?:\s+(?:of|for))?|render(?:\s+(?:an?|the))?\s+(?:image|picture|photo)(?:\s+(?:of|for))?|paint(?:\s+(?:an?|the))?\s+(?:image|picture)?(?:\s+(?:of|for))?|draw(?:\s+(?:an?|the))?\s+(?:image|picture|illustration)?(?:\s+(?:of|for))?)\s*[:=-]?\s*(.+)$/i
  )
  if (imageMatch) {
    if (!isPluginActive('image')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Gemini Image Generation plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const imagePrompt = imageMatch[1].trim()
    emitAgentStatus('coding', 'Synthesizing image with Gemini API...')
    emitAgentActivity(requestId, `[ImageGen] Generating "${imagePrompt.slice(0, 30)}..."`)
    try {
      const result = await generateImage({ prompt: imagePrompt })
      emitAgentStatus('ready', 'Flame ready')
      emitAgentActivity(requestId, '[Flame] Task complete')
      if (result.success && (result.dataUri || result.filePath)) {
        return {
          reply: `🎨 **Image Generated Successfully via Gemini API**\nPrompt: *${result.prompt}*\nSaved: \`${result.fileName || result.filePath}\`\n\n${result.message}`,
          intent: 'unknown',
          actionSuccess: true,
          generatedImage: {
            dataUri: result.dataUri,
            filePath: result.filePath,
            prompt: result.prompt,
            fileName: result.fileName
          },
          images: [{
            src: result.dataUri || result.filePath || '',
            caption: result.prompt,
            filePath: result.filePath,
            fileName: result.fileName
          }]
        }
      } else {
        return {
          reply: `Image generation failed: ${result.message}`,
          intent: 'unknown',
          actionSuccess: false
        }
      }
    } catch (err) {
      emitAgentStatus('ready', 'Flame ready')
      emitAgentActivity(requestId, '[Flame] Task complete')
      const errorObj = err instanceof Error ? err : new Error(String(err))
      void triggerSelfHeal(errorObj, { prompt, source: 'imageGen' })
      return {
        reply: `Image generation encountered an error: ${errorObj.message}\n\n🛡️ Triggered auto-healing analysis.`,
        intent: 'unknown',
        actionSuccess: false
      }
    }
  }

  /* ---- Direct Winget Update check fast-path: "check updates", "outdated apps" ---- */
  if (/^\s*(?:check\s+(?:for\s+)?updates?|check\s+outdated|list\s+updates?|outdated\s+apps?|what\s+(?:apps?|software)\s+(?:can\s+be\s+updated|need\s+updates?|are\s+outdated))\s*$/i.test(prompt)) {
    if (!isPluginActive('windows')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Windows Control plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const result = await runCheckUpdates()
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Direct Combo registration fast-path: "register/save/create combo <name>: <todo>" ---- */
  const registerComboMatch = prompt.match(
    /^\s*(?:register|save|create|add)\s+(?:a\s+)?combo(?:\s+(?:called|named))?\s+["']?([^:=-]+?)["']?\s*[:=-]\s*(.+)$/i
  )
  if (registerComboMatch) {
    const comboName = registerComboMatch[1].trim()
    const comboToDo = registerComboMatch[2].trim()
    try {
      const saved = await combosService.saveCombo({ name: comboName, toDo: comboToDo })
      const stepSummary = saved.steps
        .map((s, idx) => `  ${idx + 1}. **${s.action}**: \`${s.target || s.description || ''}\``)
        .join('\n')
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: `✨ **Combo Registered:** "${saved.name}"\n\n${stepSummary}\n\nYou can execute this macro anytime by saying \`run combo ${saved.name}\` or from the Combos tab.`,
        intent: 'run_combo',
        actionSuccess: true
      }
    } catch (err) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: `Failed to save combo "${comboName}": ${err instanceof Error ? err.message : String(err)}`,
        intent: 'run_combo',
        actionSuccess: false
      }
    }
  }

  /* ---- List Combos fast-path: "list combos", "show combos" ---- */
  if (/^\s*(?:list|show|view|get)\s+combos?\s*$/i.test(prompt)) {
    const all = await combosService.loadCombos()
    emitAgentActivity(requestId, '[Flame] Task complete')
    if (all.length === 0) {
      return {
        reply: 'No Combos have been registered yet. You can create one anytime (e.g. `register combo Game Mode: Open sk launcher, launch minecraft, close yourself`).',
        intent: 'run_combo',
        actionSuccess: true
      }
    }
    const comboList = all
      .map((c) => `• **${c.name}**: ${c.toDo || c.steps.map((s) => s.target).join(', ')}`)
      .join('\n')
    return {
      reply: `📋 **Registered Combos (${all.length}):**\n\n${comboList}\n\nTo run a combo, say \`run combo <name>\`.`,
      intent: 'run_combo',
      actionSuccess: true
    }
  }

  /* ---- Direct Combo execution fast-path: "run combo <name>", "execute combo <name>" ---- */
  const comboMatch = prompt.match(/^\s*(?:run|execute)\s+combo\s+(.+)$/i)
  if (comboMatch) {
    const comboTarget = comboMatch[1].trim()
    const result = await combosService.executeCombo(comboTarget)
    emitAgentActivity(requestId, '[Flame] Task complete')
    return {
      reply: result.message,
      intent: 'run_combo',
      actionSuccess: result.success
    }
  }

  /* ---- Direct Winget Install fast-path: "install <app>", "download <app>" ---- */
  const installFastMatch = prompt.match(/^\s*(?:winget\s+)?(?:install|get|download)\s+(.+)$/i)
  if (installFastMatch && !/^(?:updates?|outdated)$/i.test(installFastMatch[1].trim())) {
    if (!isPluginActive('windows')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Windows Control plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'install_app',
        actionSuccess: false
      }
    }
    const appTarget = installFastMatch[1].trim()
    const result = await runInstallCheck(appTarget)
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Direct Winget Uninstall fast-path: "uninstall <app>", "remove <app>" ---- */
  const uninstallFastMatch = prompt.match(/^\s*(?:winget\s+)?(?:uninstall|remove)\s+(.+)$/i)
  if (uninstallFastMatch) {
    if (!isPluginActive('windows')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Windows Control plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'uninstall_app',
        actionSuccess: false
      }
    }
    const appTarget = uninstallFastMatch[1].trim()
    const result = await runUninstallCheck(appTarget)
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Direct Winget Update fast-path: "update <app>", "upgrade <app>" ---- */
  const updateFastMatch = prompt.match(/^\s*(?:winget\s+)?(?:update|upgrade)\s+(.+)$/i)
  if (updateFastMatch && !/^(?:all|everything|apps?|software)$/i.test(updateFastMatch[1].trim())) {
    if (!isPluginActive('windows')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Windows Control plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'update_app',
        actionSuccess: false
      }
    }
    const appTarget = updateFastMatch[1].trim()
    const result = await runUpdateCheck(appTarget)
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Self-Healing Fast-Path: "self heal", "/heal", "heal error", "fix error" ---- */
  if (/^\s*(?:\/?(?:self\s*heal|heal(?:\s+error)?|fix\s+(?:the\s+)?(?:error|runtime|crash)|auto\s*heal))\s*$/i.test(prompt)) {
    emitAgentStatus('coding', 'Analyzing codebase with Error Guardian...')
    emitAgentActivity(requestId, '[ErrorGuardian] Running self-heal diagnosis...')
    const recent = getRecentIncidents()
    const lastIncident = recent.length > 0 ? recent[recent.length - 1] : null
    const errToHeal = lastIncident
      ? new Error(`${lastIncident.errorMessage}\n${lastIncident.stack || ''}`)
      : new Error('Manual self-heal inspection on workspace runtime integrity')

    const healResult = await triggerSelfHeal(errToHeal, { prompt, source: 'chatCommand' })
    emitAgentStatus('ready', 'Flame ready')
    emitAgentActivity(requestId, '[Flame] Task complete')

    if (healResult.proposal && (healResult.proposal.status === 'staged' || healResult.proposal.status === 'applied' || (healResult.proposal.files && healResult.proposal.files.length > 0))) {
      const filesSummary = healResult.proposal.files
        .map((f) => `• \`${f.path}\` (${f.action})`)
        .join('\n')
      return {
        reply: `🛡️ **Auto-Healing Proposal Ready** [hash=${healResult.hash}]\n\n${filesSummary}\n\n${healResult.message}\n\nYou can click **Apply Fix** below or say \`approve\` to commit these changes to your codebase.`,
        intent: 'unknown',
        actionSuccess: true,
        pendingAction: {
          type: 'selfHeal',
          runId: healResult.proposal.run_id,
          healHash: healResult.hash,
          operationLabel: `Apply Auto-Healing Patch for [${healResult.hash}]`
        }
      }
    } else {
      return {
        reply: `🛡️ **Error Guardian Inspection Complete** [hash=${healResult.hash || 'none'}]\n\n${healResult.message}`,
        intent: 'unknown',
        actionSuccess: healResult.status !== 'error'
      }
    }
  }

  /* ---- Computer Use Screen Capture Fast-Path: "screenshot", "capture screen", "take a screenshot" ---- */
  if (/^\s*(?:take\s+(?:a\s+)?screenshot|capture\s+(?:the\s+)?(?:screen|desktop)|screenshot|look\s+at\s+my\s+screen|see\s+my\s+screen)\s*$/i.test(prompt)) {
    emitAgentStatus('coding', 'Capturing primary desktop display...')
    emitAgentActivity(requestId, '[computer.capture_screen] Capturing display...')
    const result = await runCapability('computer.capture_screen', { requestId }, 'unknown')
    emitAgentStatus('ready', 'Flame ready')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Computer Use Window Control Fast-Path: "list windows", "focus window <name>" ---- */
  if (/^\s*(?:list|show|get)\s+(?:open\s+)?(?:windows|apps|desktop\s+windows)\s*$/i.test(prompt)) {
    emitAgentActivity(requestId, '[computer.window_control] Listing open windows...')
    const result = await runCapability('computer.window_control', { action: 'list', requestId }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  const focusWinMatch = prompt.match(/^\s*(?:focus|bring\s+to\s+foreground|switch\s+to)(?:\s+(?:window|app))?\s+["']?([^"'\n]+?)["']?\s*$/i)
  if (focusWinMatch && !/^(?:browser|code|task|chat)$/i.test(focusWinMatch[1].trim())) {
    const titleQuery = focusWinMatch[1].trim()
    emitAgentActivity(requestId, `[computer.window_control] Focusing window matching "${titleQuery}"...`)
    const result = await runCapability('computer.window_control', { action: 'focus', titleQuery, requestId }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Computer Use Pointer Action Fast-Path: "click at <x>, <y>", "move mouse to <x>, <y>" ---- */
  const pointerMatch = prompt.match(/^\s*(?:(left_click|right_click|double_click|click|move|drag|scroll)(?:\s+mouse|\s+cursor)?(?:\s+(?:at|to))?)\s+(\d+)\s*[,x\s]\s*(\d+)(?:\s+(?:to)\s+(\d+)\s*[,x\s]\s*(\d+))?\s*$/i)
  if (pointerMatch) {
    const rawMode = pointerMatch[1].toLowerCase()
    const mode = rawMode === 'click' ? 'left_click' : (rawMode as 'left_click' | 'right_click' | 'double_click' | 'move' | 'drag' | 'scroll')
    const x = parseInt(pointerMatch[2], 10)
    const y = parseInt(pointerMatch[3], 10)
    const destX = pointerMatch[4] ? parseInt(pointerMatch[4], 10) : undefined
    const destY = pointerMatch[5] ? parseInt(pointerMatch[5], 10) : undefined

    emitAgentActivity(requestId, `[computer.pointer_action] ${mode} at (${x}, ${y})...`)
    const result = await runCapability('computer.pointer_action', { mode, x, y, destX, destY, requestId }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Computer Use Keyboard Input Fast-Path: "type <text>", "press hotkey <key>" ---- */
  const typeMatch = prompt.match(/^\s*(?:type|enter|input)\s+["'](.+?)["'](?:\s+(?:with\s+enter|and\s+press\s+enter))?\s*$/i)
  if (typeMatch) {
    const text = typeMatch[1]
    const pressEnterAfter = /enter/i.test(prompt)
    emitAgentActivity(requestId, `[computer.keyboard_input] Typing literal text...`)
    const result = await runCapability('computer.keyboard_input', { text, mode: 'literal', pressEnterAfter, requestId }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  const hotkeyMatch = prompt.match(/^\s*press(?:\s+(?:hotkey|key))?\s+([a-zA-Z0-9+]+)\s*$/i)
  if (hotkeyMatch) {
    const text = hotkeyMatch[1]
    emitAgentActivity(requestId, `[computer.keyboard_input] Pressing hotkey ${text}...`)
    const result = await runCapability('computer.keyboard_input', { text, mode: 'hotkey', requestId }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- MCP Browser Fast-Path: "open github", "open a browser with github or other sites", "open https://...", "browse to reddit.com" ---- */
  const browserCmdMatch = prompt.match(
    /^\s*(?:(?:open|launch)(?:\s+(?:a|the))?\s+browser(?:\s+(?:with|to|and\s+go\s+to|for))?|(?:open|browse|navigate|visit|go)(?:\s+to)?(?:\s+(?:the\s+)?(?:website|site|url|page))?)\s+["']?([^"'\n]+?)["']?\s*$/i
  )
  if (browserCmdMatch) {
    const rawTarget = browserCmdMatch[1].trim()
    let isWeb = false
    let targetUrl = rawTarget

    // Normalize "github or other sites" -> "github"
    const orOtherMatch = targetUrl.match(/^(.+?)\s+(?:or\s+other\s+sites?|and\s+other\s+sites?)$/i)
    if (orOtherMatch) {
      targetUrl = orOtherMatch[1].trim()
    }

    const knownSites: Record<string, string> = {
      github: 'https://github.com',
      google: 'https://www.google.com',
      youtube: 'https://www.youtube.com',
      reddit: 'https://www.reddit.com',
      twitter: 'https://x.com',
      x: 'https://x.com',
      wikipedia: 'https://www.wikipedia.org',
      gmail: 'https://mail.google.com',
      chatgpt: 'https://chatgpt.com',
      gemini: 'https://gemini.google.com',
      huggingface: 'https://huggingface.co',
      stackoverflow: 'https://stackoverflow.com',
      linkedin: 'https://www.linkedin.com',
      netflix: 'https://www.netflix.com',
      spotify: 'https://open.spotify.com',
      amazon: 'https://www.amazon.com',
      twitch: 'https://www.twitch.tv'
    }

    if (knownSites[targetUrl.toLowerCase()]) {
      targetUrl = knownSites[targetUrl.toLowerCase()]
      isWeb = true
    } else if (/^https?:\/\//i.test(targetUrl) || targetUrl.startsWith('www.')) {
      isWeb = true
    } else if (/^[a-zA-Z0-9-]+\.(com|org|net|io|dev|ai|app|co|gov|edu|me|info|tv|xyz)(?:\/\S*)?$/i.test(targetUrl)) {
      isWeb = true
    } else if (/^\s*(?:open|launch)(?:\s+(?:a|the))?\s+browser/i.test(prompt)) {
      isWeb = true
    }

    if (isWeb) {
      if (!isPluginActive('browser')) {
        emitAgentActivity(requestId, '[Flame] Task complete')
        return {
          reply: '⚠️ The Browser Controller plugin is currently turned off. You can re-enable it in the Plugins settings.',
          intent: 'unknown',
          actionSuccess: false
        }
      }
      const result = await runCapability('browser.open_url', { url: targetUrl }, 'unknown')
      emitAgentActivity(requestId, '[Flame] Task complete')
      return result
    }
  }

  /* ---- MCP OS PowerShell Fast-Path: "run powershell <cmd>", "execute ps <cmd>", "powershell: <cmd>" ---- */
  const psMatch = prompt.match(/^\s*(?:(?:run|execute)\s+powershell|powershell\s*:?|ps\s*:)\s+(.+)$/is)
  if (psMatch) {
    if (!isPluginActive('osControl')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Desktop & OS Controller plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'run_command',
        actionSuccess: false
      }
    }
    const script = psMatch[1].trim()
    const result = await runCapability('os.run_powershell', { script }, 'run_command')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- MCP OS Processes Fast-Path: "list processes", "running processes", "top ram" ---- */
  if (/^\s*(?:list|show|view|get)\s+(?:running\s+)?processes\s*$/i.test(prompt) || /^\s*top\s+(?:ram|memory)\s*(?:processes)?\s*$/i.test(prompt)) {
    if (!isPluginActive('osControl')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Desktop & OS Controller plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const result = await runCapability('os.manage_processes', { action: 'list' }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- MCP OS Kill Process Fast-Path: "kill process <target>", "terminate <target>" ---- */
  const killProcMatch = prompt.match(/^\s*(?:kill|terminate|stop)\s+(?:process\s+)?([a-zA-Z0-9_.-]+)\s*$/i)
  if (killProcMatch && !/^(?:debate|task|timer|itself|flame|pet\s+mode)$/i.test(killProcMatch[1].trim())) {
    if (!isPluginActive('osControl')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Desktop & OS Controller plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const target = killProcMatch[1].trim()
    const nameOrPid = /^\d+$/.test(target) ? parseInt(target, 10) : target
    const result = await runCapability('os.manage_processes', { action: 'kill', nameOrPid }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- MCP Clipboard Fast-Path: "read clipboard", "get clipboard", "copy to clipboard <text>" ---- */
  if (/^\s*(?:read|get|view|show)\s+clipboard\s*$/i.test(prompt)) {
    if (!isPluginActive('osControl')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Desktop & OS Controller plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const result = await runCapability('os.clipboard', { action: 'read' }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  const copyClipMatch = prompt.match(/^\s*(?:copy|set)\s+(?:to\s+)?clipboard\s*[:=-]?\s*(.+)$/is)
  if (copyClipMatch) {
    if (!isPluginActive('osControl')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Desktop & OS Controller plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const textToCopy = copyClipMatch[1].trim()
    const result = await runCapability('os.clipboard', { action: 'write', text: textToCopy }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- WhatsApp Media Retrieval Fast-Path: "show me all photos and links sent on whatsapp today", "whatsapp media", "whatsapp photos" ---- */
  const waMediaMatch = prompt.match(
    /^\s*(?:(?:show|list|view|get|display|find)(?:\s+me)?\s+(?:all\s+)?(?:archived\s+)?(?:whatsapp\s+)?(photos?|videos?|files?|audios?|links?|media)(?:\s+(?:sent\s+)?(?:on|from|in)\s+whatsapp)?(?:\s+today)?|whatsapp\s+(?:archived\s+)?(photos?|videos?|files?|audios?|links?|media))\s*$/i
  )
  if (waMediaMatch) {
    if (!isPluginActive('whatsapp')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The WhatsApp AI Companion plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const rawKind = (waMediaMatch[1] || waMediaMatch[2] || 'media').toLowerCase()
    let typeFilter: string | undefined
    if (rawKind.startsWith('photo') || rawKind.startsWith('pic')) typeFilter = 'photo'
    else if (rawKind.startsWith('video')) typeFilter = 'video'
    else if (rawKind.startsWith('file') || rawKind.startsWith('doc')) typeFilter = 'document'
    else if (rawKind.startsWith('audio')) typeFilter = 'audio'
    else if (rawKind.startsWith('link')) typeFilter = 'link'

    const result = await runCapability('whatsapp.get_archived_media', { type: typeFilter }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- WhatsApp Hype Message / GIF Fast-Path: "send a hype gif and message to the group", "send hype gif and message to whatsapp" ---- */
  const waHypeMatch = prompt.match(
    /^\s*(?:send\s+(?:a\s+)?(?:hype\s+(?:gif\s+(?:and\s+)?message|message\s+(?:and\s+)?gif|message|gif)|gif\s+and\s+hype\s+message)(?:\s+to\s+(?:the\s+)?(?:group|whatsapp|chat))?|whatsapp\s+hype)\s*$/i
  )
  if (waHypeMatch) {
    if (!isPluginActive('whatsapp')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The WhatsApp AI Companion plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const brain = whatsappEngine.getSharedBrain()
    const groupJid = Object.keys(brain.members).find((j) => j.endsWith('@g.us')) || Object.keys(brain.members)[0] || 'status@broadcast'
    const hypeMessages = [
      'LET’S GOOO! FlameAGI Desktop & WhatsApp link fully operational! 🔥🚀',
      'Maximum hype mode engaged! We are building the future together! (★^O^★)',
      'Systems nominal, energy at 100%! What are we conquering today?! (⌐■_■)'
    ]
    const chosenText = hypeMessages[Math.floor(Math.random() * hypeMessages.length)]
    const result = await runCapability(
      'whatsapp.send_message',
      {
        jid: groupJid,
        text: chosenText,
        gifQuery: 'hype victory celebration'
      },
      'unknown'
    )
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- WhatsApp Brain Memory / Sync Fast-Path: "whatsapp brain", "sync whatsapp brain", "whatsapp memory" ---- */
  if (/^\s*(?:sync\s+whatsapp\s+brain|whatsapp\s+(?:brain|memory)|show\s+whatsapp\s+(?:brain|memory))\s*$/i.test(prompt)) {
    if (!isPluginActive('whatsapp')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The WhatsApp AI Companion plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const result = await runCapability('whatsapp.sync_brain_memory', {}, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- WhatsApp QR Code Fast-Path: "connect whatsapp", "link whatsapp", "show whatsapp qr", "whatsapp qr" ---- */
  if (/^\s*(?:connect\s+whatsapp|link\s+whatsapp|show\s+(?:me\s+)?whatsapp\s+qr|whatsapp\s+qr(?:\s+code)?|pair\s+whatsapp)\s*$/i.test(prompt)) {
    emitAgentStatus('coding', 'Checking WhatsApp connection status...')
    emitAgentActivity(requestId, '[WhatsApp] Fetching pairing QR code...')
    let st = whatsappEngine.getConnectionStatus()
    if (st.connected) {
      emitAgentStatus('ready', 'Flame ready')
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '✅ **WhatsApp Connected**\n\nFlameAGI WhatsApp AI companion is already authenticated and connected! Shared Brain and group moderation are active.',
        intent: 'unknown',
        actionSuccess: true
      }
    }
    if (!st.qrDataUrl) {
      void whatsappEngine.start().catch(() => {})
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 600))
        st = whatsappEngine.getConnectionStatus()
        if (st.qrDataUrl || st.connected) break
      }
    }
    emitAgentStatus('ready', 'Flame ready')
    emitAgentActivity(requestId, '[Flame] Task complete')

    if (st.connected) {
      return {
        reply: '✅ **WhatsApp Connected**\n\nFlameAGI WhatsApp AI companion is authenticated and connected!',
        intent: 'unknown',
        actionSuccess: true
      }
    }

    if (st.qrDataUrl) {
      return {
        reply: '📱 **WhatsApp Pairing QR Code**\n\nScan this QR code with WhatsApp on your phone:\n1. Open WhatsApp on your phone.\n2. Tap **Settings / More Options (⋮)** → **Linked Devices**.\n3. Tap **Link a Device** and point your camera at this code.',
        intent: 'unknown',
        actionSuccess: true,
        images: [{
          src: st.qrDataUrl,
          caption: 'WhatsApp Web Pairing QR Code',
          fileName: 'whatsapp_qr.png'
        }]
      }
    }

    return {
      reply: '⏳ WhatsApp engine is initializing. If the QR code does not appear shortly, check the **Plugins** page to view and refresh the live pairing code.',
      intent: 'unknown',
      actionSuccess: true
    }
  }

  /* ---- MCP WhatsApp Fast-Path: "whatsapp <msg> to <phone>", "open whatsapp" ---- */
  if (/^\s*(?:open\s+whatsapp|launch\s+whatsapp)\s*$/i.test(prompt)) {
    if (!isPluginActive('osControl')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Desktop & OS Controller plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const result = await runCapability('communication.whatsapp', { action: 'open' }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  const waSendMatch = prompt.match(/^\s*(?:send\s+)?whatsapp\s+(?:message\s+)?["']?(.+?)["']?\s+to\s+([+0-9\s@.a-zA-Z_-]+)$/i)
  if (waSendMatch) {
    const message = waSendMatch[1].trim()
    const target = waSendMatch[2].trim()

    // Prefer Native Baileys WhatsApp Engine if active, otherwise fallback to OS control
    if (isPluginActive('whatsapp')) {
      const result = await runCapability('whatsapp.send_message', { jid: target, text: message }, 'unknown')
      emitAgentActivity(requestId, '[Flame] Task complete')
      return result
    }

    if (!isPluginActive('osControl')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The WhatsApp AI Companion and Desktop & OS Controller plugins are currently turned off.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const result = await runCapability('communication.whatsapp', { action: 'send', phone: target, message }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- MCP Deep File System Fast-Paths ---- */
  if (/^\s*(?:clean\s+temp|clear\s+temp|clean\s+temporary\s+files|free\s+up\s+disk(?:\s+space)?)\s*$/i.test(prompt)) {
    if (!isPluginActive('filesystem')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Deep File System Explorer plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const result = await runCapability('fs.clean_temp', { dryRun: false }, 'unknown')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  const exploreDirMatch = prompt.match(/^\s*(?:explore|explore\s+directory|list\s+files\s+in)\s+(.+)$/i)
  if (exploreDirMatch) {
    if (!isPluginActive('filesystem')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The Deep File System Explorer plugin is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'file_operation',
        actionSuccess: false
      }
    }
    const dirTarget = exploreDirMatch[1].trim()
    const result = await runCapability('fs.explore_directory', { path: dirTarget }, 'file_operation')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Direct OSINT chat command: "osint: <no.> or <domain>" ----
   * Fast-path: immediately handles OSINT targets, queries, and help prompts
   * without routing to Coder Engine or Gemma/Ollama. */
  if (/^\s*(?:\/?osint\b)/i.test(prompt)) {
    if (!isPluginActive('osint')) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: '⚠️ The OSINT Intelligence Suite is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'osint',
        actionSuccess: false
      }
    }
    const result = await runOsintCommand(prompt, requestId)
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  /* ---- Unified window: Task mode owns the prompt ----------------------
   * Chat keeps the intent pipeline below. Task mode bypasses intent
   * classification entirely and runs the guarded coder pipeline. */
  if (mode === 'task') {
    return runTaskModePrompt(prompt, requestId, signal)
  }

  /* ---- REA is a Task Mode capability ---- */
  if (/^\s*(?:\/?rea\b)/i.test(prompt)) {
    emitAgentActivity(requestId, '[Flame] Task complete')
    if (!isPluginActive('rea')) {
      return {
        reply: '⚠️ The Reverse Engineering Assistant (REA) is currently turned off. You can re-enable it in the Plugins settings.',
        intent: 'unknown',
        actionSuccess: false
      }
    }
    return {
      reply:
        '⚙️ **REA (Reverse Engineering & Architecture) Evidence Engine**\n\n' +
        'REA is active as a **Task Mode capability**.\n\n' +
        'Please switch to **Task Mode** (toggle at the bottom of the window) to:\n' +
        '• **Audit workspace architecture:** `rea audit` (maps IPC channels, imports & bridges)\n' +
        '• **Inspect binaries & ASAR:** `rea inspect <file.exe | app.asar>`\n' +
        '• **Generate folders & files:** `rea folder <name>`\n' +
        '• **Export downloadable ZIPs:** `rea zip <folder>`\n' +
        '• **Code with verified evidence:** `rea code: <task>` (OpenCode codes on verified findings)',
      intent: 'unknown',
      actionSuccess: true
    }
  }

  /* ---- Coder Engine fast paths (v1.2.1 chat commands + "Edit:" syntax) ----
   * These bypass Gemma classification on purpose: they are literal commands,
   * not something a 2B reflex model should be trusted to route. */
  const editMatch = prompt.match(/^\s*edit\s*:\s*(.+)/i)
  const workerMatch = prompt.match(
    /^\s*(approve|reject|rollback|undo|revert|diff|doctor|status|modified|list)\s*(\S+)?\s*$/i
  )
  if (editMatch || workerMatch) {
    const project = await getCurrentProject()
    if (!project.path) {
      emitAgentActivity(requestId, '[Flame] Task complete')
      return {
        reply: 'I can code for you, but I need a project first — import one and set it as the active project, then ask again.',
        intent: 'code_edit'
      }
    }
    const result = workerMatch
      ? await runCoderWorkerCommand(workerMatch, project.path, requestId)
      : await runCoderEdit(editMatch?.[1] ?? prompt, project.path, requestId)
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  if (model === 'gemini') {
    const result = await runCapability('ai_network.gemini', { instruction: prompt, requestId, signal }, 'ai_network')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  const effort = effortOverride && effortOverride !== 'auto' ? effortOverride : classifyEffort(prompt)
  emitAgentActivity(requestId, `[Effort] ${effort.toUpperCase()}`)
  const difficulty = effort === 'low' ? 'normal' : await getDifficulty()
  const intentResult = await getIntent(prompt, effort, requestId, difficulty, signal)
  const appQuery = intentResult.app?.trim()

  let result: AiResponse
  switch (intentResult.intent) {
    case 'launch_app': {
      result = appQuery
        ? await runCapability('windows.launchApp', { app: appQuery, requestId }, 'launch_app', { app: appQuery })
        : { reply: 'Which app did you want to open?', intent: 'unknown' }
      break
    }

    case 'install_app': {
      result = appQuery ? await runInstallCheck(appQuery) : { reply: 'Which app should I install?', intent: 'unknown' }
      break
    }

    case 'update_app': {
      result = appQuery ? await runUpdateCheck(appQuery) : await runCheckUpdates()
      break
    }

    case 'uninstall_app': {
      result = appQuery ? await runUninstallCheck(appQuery) : { reply: 'Which app should I uninstall?', intent: 'unknown' }
      break
    }

    case 'external_action': {
      result = await runCapability('zapier.run', { instruction: intentResult.instruction, requestId }, 'external_action')
      break
    }

    case 'remember_fact': {
      result = await runCapability('memory.remember', { fact: intentResult.factText, requestId }, 'remember_fact')
      if (intentResult.factText) {
        void whatsappEngine.addSharedMemoryFact(intentResult.factText).catch(() => {})
        const brain = whatsappEngine.getSharedBrain()
        for (const [jid, member] of Object.entries(brain.members)) {
          if (intentResult.factText.toLowerCase().includes(member.pushName.toLowerCase())) {
            member.customNotes.push(intentResult.factText)
            void whatsappEngine.saveBrain().catch(() => {})
          }
        }
      }
      break
    }

    case 'remember_plan': {
      result = await runCapability('memory.rememberPlan', { plan: intentResult.planText, requestId }, 'remember_plan')
      break
    }

    case 'ai_network': {
      const capabilityId = intentResult.aiTarget === 'opencode' ? 'ai_network.opencode' : 'ai_network.gemini'
      result = await runCapability(capabilityId, { instruction: intentResult.instruction, requestId }, 'ai_network')
      break
    }

    case 'run_command': {
      result = await runCapability('devtools.runCommand', { command: intentResult.command, requestId }, 'run_command')
      break
    }

    case 'current_info_search': {
      result = await runCapability('search.currentInfo', { query: intentResult.query, requestId }, 'current_info_search')
      break
    }

    case 'file_operation': {
      const capabilityId = {
        list: 'files.listDirectory',
        read: 'files.readText',
        inspectZip: 'files.inspectZip',
        extractZip: 'files.extractZip',
        search: 'files.searchInFiles'
      }[intentResult.fileAction ?? 'list']
      result = await runCapability(capabilityId, {
        path: intentResult.path,
        query: intentResult.query,
        destDir: intentResult.destDir,
        requestId
      }, 'file_operation')
      break
    }

    case 'osint': {
      result = await runOsintCommand(intentResult.query || prompt, requestId)
      break
    }

    case 'generate_prompt': {
      if (!intentResult.instruction) {
        result = { reply: 'What should the prompt accomplish?', intent: 'unknown' }
        break
      }
      const tool = intentResult.promptTool || 'the target AI'
      const promptText = await generatePromptArtifact(tool, intentResult.instruction, requestId)
      result = {
        reply: `Here's a prompt for ${tool}:`,
        intent: 'generate_prompt',
        promptArtifact: { forTool: tool, prompt: promptText }
      }
      break
    }

    case 'rsi_improve': {
      const project = await getCurrentProject()
      if (!project.path) {
        result = { reply: 'Choose and import a project before starting an RSI task.', intent: 'rsi_improve', actionSuccess: false }
        break
      }
      const imported = await listImportedProjects()
      const permissions = imported.find((entry) => entry.path === project.path)?.permissions
      if (!permissions?.read || !permissions.write || !permissions.execute) {
        result = {
          reply: 'RSI requires an imported active project with read, write, and execute permissions enabled.',
          intent: 'rsi_improve',
          actionSuccess: false
        }
        break
      }
      result = await runCapability('rsi.improve', {
        task: intentResult.instruction,
        projectPath: project.path,
        requestId
      }, 'rsi_improve')
      break
    }

    case 'code_edit': {
      if (!intentResult.instruction) {
        result = { reply: 'Tell me what to change in the code.', intent: 'code_edit' }
        break
      }
      const project = await getCurrentProject()
      if (!project.path) {
        result = {
          reply: 'Import and pick the project to work on — then ask me again and I\'ll make the change.',
          intent: 'code_edit',
          actionSuccess: false
        }
        break
      }
      result = await runCoderEdit(intentResult.instruction, project.path, requestId)
      break
    }

    case 'start_debate': {
      if (intentResult.topic) {
        void startDebate(intentResult.topic, requestId)
        result = { reply: `Starting a conversation with Gemini about: ${intentResult.topic}`, intent: 'start_debate', actionSuccess: true }
      } else result = { reply: 'What would you like Gemini and me to discuss?', intent: 'start_debate' }
      break
    }

    case 'stop_debate': {
      const wasRunning = isDebateRunning()
      stopDebate()
      result = { reply: wasRunning ? 'Stopping the conversation…' : 'No conversation is currently running.', intent: 'stop_debate', actionSuccess: true }
      break
    }

    default:
      if (prompt.trim() && !/^(hi|hello|hey|who are you|what can you do)\b/i.test(prompt.trim())) {
        try {
          const project = await getCurrentProject()
          if (project.path) {
            emitAgentStatus('coding', 'Synthesizing new capability...')
            emitAgentActivity(requestId, '[Flame] Synthesizing new capability...')
            const task = `Synthesize missing capability, script, or handler to fulfill request: "${prompt}". Implement the handler in this project.`
            const coderRes = await runCoderTask(task, project.path, { requestId, review: true })
            if (coderRes.status === 'staged' || coderRes.status === 'applied') {
              emitSkillUnlocked('Autonomous Skill')
              emitAgentStatus('ready', 'Flame ready')
              result = {
                reply: `✨ New Skill Unlocked: Autonomous Skill\n\n${formatRunResult(coderRes)}`,
                intent: 'unknown',
                actionSuccess: true
              }
              break
            }
          }
        } catch {
          // fallback
        } finally {
          emitAgentStatus('ready', 'Flame ready')
        }
      }
      result = { reply: intentResult.reply, intent: 'unknown' }
      break
  }

  emitAgentActivity(requestId, '[Flame] Task complete')
  return result
}

/**
 * Task mode entry point. Literal worker commands still work, `Edit:` is an
 * optional shortcut, and everything else is triaged/executed by the AI
 * Network router (Flame triage → OpenCode coding → Gemini reasoning).
 */
async function runTaskModePrompt(
  prompt: string,
  requestId?: string,
  signal?: AbortSignal
): Promise<AiResponse> {
  const project = await getCurrentProject()
  if (!project.path) {
    return {
      reply: 'Task mode needs a project. Import one and set it as the active project, then ask again.',
      intent: 'code_edit',
      actionSuccess: false,
      mode: 'task'
    }
  }

  const workerMatch = prompt.match(
    /^\s*(approve|reject|rollback|undo|revert|diff|doctor|status|modified|list)\s*(\S+)?\s*$/i
  )
  if (workerMatch) {
    const result = await runCoderWorkerCommand(workerMatch, project.path, requestId)
    emitAgentActivity(requestId, '[Task] Command complete')
    return { ...result, mode: 'task' }
  }

  /* ---- REA Commands in Task Mode (Folder gen, ZIP export, workspace audit, binary inspect, OpenCode guidance) ---- */
  if (/^\s*(?:\/?rea\b|audit\s+workspace|generate\s+folder|create\s+folder|export\s+zip|zip\s+folder)/i.test(prompt)) {
    const result = await runReaTaskCommand(prompt, project.path, requestId)
    emitAgentActivity(requestId, '[Task] REA command complete')
    return result
  }

  const editMatch = prompt.match(/^\s*edit\s*:\s*(.+)/i)
  const parsed = parseEditPrompt(`Edit: ${editMatch?.[1] ?? prompt}`)
  if (!parsed.task) {
    return { reply: 'Tell me what to change in the code.', intent: 'code_edit', mode: 'task' }
  }

  // "review" / "stage" / "preview" still uses the engine's no-touch staging.
  if (parsed.review) {
    emitAgentActivity(requestId, '[Task] Staging the proposal (workspace untouched)')
    const staged = await runCapability(
      'coder.edit',
      {
        task: parsed.task,
        projectPath: project.path,
        requestId,
        review: true,
        backend: parsed.backend
      },
      'code_edit'
    )
    return { ...staged, mode: 'task' }
  }

  emitAgentStatus('coding', 'Task mode: working…')
  try {
    const result = await runTaskMode(parsed.task, project.path, {
      requestId,
      signal,
      openDiff: true
    })
    const ok = result.status === 'applied' || result.status === 'noop' || result.status === 'answered'
    return {
      reply: formatTaskResult(result),
      intent: 'code_edit',
      actionSuccess: ok,
      mode: 'task',
      task: result
    }
  } finally {
    emitAgentStatus('ready', 'Flame ready')
    emitAgentActivity(requestId, '[Task] Complete')
  }
}

/**
 * Executes REA capabilities in Task Mode:
 *  - Generates folders & seed files
 *  - Packages folders into downloadable ZIP archives
 *  - Audits workspace Electron IPC architecture & dependencies
 *  - Inspects binaries / ASAR with Tri-State Evidence
 *  - Guides OpenCode with verified REA context
 */
async function runReaTaskCommand(
  rawPrompt: string,
  projectPath: string,
  requestId?: string
): Promise<AiResponse> {
  const prompt = rawPrompt.trim()

  // 1. REA Folder Generation:
  // e.g. "rea folder <name>", "generate folder <name>", "create folder <name>"
  const folderMatch = prompt.match(/(?:rea\s+folder|generate\s+folder|create\s+folder)\s+(.+)$/i)
  if (folderMatch) {
    const folderName = folderMatch[1].trim().replace(/^[<"'{[]+|[>"'}\]]+$/g, '').trim()
    const result = await executeReaGenerateFolder({ folderName, baseDir: projectPath }, requestId)
    return {
      reply: result.message,
      intent: 'run_command',
      actionSuccess: result.success,
      mode: 'task'
    }
  }

  // 2. REA Zip Export:
  // e.g. "rea zip <folder>", "zip folder <name>", "export zip <folder>"
  const zipMatch = prompt.match(/(?:rea\s+zip|zip\s+folder|export\s+zip)\s+(.+)$/i)
  if (zipMatch) {
    const rawTarget = zipMatch[1].trim().replace(/^[<"'{[]+|[>"'}\]]+$/g, '').trim()
    const targetPath = path.isAbsolute(rawTarget) ? rawTarget : path.join(projectPath, rawTarget)
    const result = await executeReaExportZip({ sourcePath: targetPath }, requestId)
    return {
      reply: result.message,
      intent: 'run_command',
      actionSuccess: result.success,
      mode: 'task'
    }
  }

  // 3. REA Code On Evidence:
  // e.g. "rea code: <task>", "code on rea: <task>", "code with evidence: <task>"
  const codeMatch = prompt.match(/(?:rea\s+code\s*:?|code\s+on\s+rea\s*:?|code\s+with\s+evidence\s*:?)\s*(.+)$/i)
  if (codeMatch) {
    const task = codeMatch[1].trim()
    const result = await executeReaCodeOnEvidence({ task, workspaceDir: projectPath }, requestId)
    return {
      reply: result.message,
      intent: 'code_edit',
      actionSuccess: result.success,
      mode: 'task'
    }
  }

  // 4. General REA Inspection & Workspace Audit
  let target = prompt
    .replace(/^\/?rea\s*:?/i, '')
    .trim()
    .replace(/^(inspect|audit|analyze)\s+/i, '')
    .trim()
    .replace(/^[<"'{[]+|[>"'}\]]+$/g, '')
    .trim()

  const lower = target.toLowerCase()
  if (
    !target ||
    lower === 'audit' ||
    lower === 'workspace' ||
    lower === 'help' ||
    lower === '?' ||
    lower === 'workspace audit'
  ) {
    const result = await executeReaAuditWorkspace(projectPath, requestId)
    return {
      reply: result.message,
      intent: 'run_command',
      actionSuccess: result.success,
      mode: 'task'
    }
  }

  const resolvedPath = path.isAbsolute(target) ? target : path.join(projectPath, target)
  if (target.endsWith('.asar')) {
    const result = await executeReaInspectAsar(resolvedPath, requestId)
    return {
      reply: result.message,
      intent: 'run_command',
      actionSuccess: result.success,
      mode: 'task'
    }
  }

  const result = await executeReaInspectFile(resolvedPath, requestId)
  return {
    reply: result.message,
    intent: 'run_command',
    actionSuccess: result.success,
    mode: 'task'
  }
}

/** Coding request -> the Coder Engine (coder.edit capability). Shared by the
 * "Edit:" fast path and the Gemma-classified code_edit intent. */
async function runCoderEdit(
  task: string,
  projectPath: string,
  requestId?: string
): Promise<AiResponse> {
  const parsed = parseEditPrompt(`Edit: ${task}`)
  if (!parsed.task) {
    return { reply: 'Tell me what to change in the code.', intent: 'code_edit' }
  }
  emitAgentActivity(requestId, `[Coder Engine] ${parsed.review ? 'Staging proposal' : 'Editing code'}`)
  return runCapability('coder.edit', {
    task: parsed.task,
    projectPath,
    requestId,
    review: parsed.review,
    backend: parsed.backend
  }, 'code_edit')
}

/** Literal engine worker commands typed in chat: approve [id], reject [id],
 * rollback/undo/revert [id], diff [id], doctor, status, modified, list. */
async function runCoderWorkerCommand(
  match: RegExpMatchArray,
  projectPath: string,
  requestId?: string
): Promise<AiResponse> {
  const verbs: Record<string, { id: string; arg?: string }> = {
    approve: { id: 'coder.approve', arg: 'runId' },
    reject: { id: 'coder.reject', arg: 'runId' },
    rollback: { id: 'coder.rollback', arg: 'runId' },
    undo: { id: 'coder.rollback', arg: 'runId' },
    revert: { id: 'coder.rollback', arg: 'runId' },
    diff: { id: 'coder.diff', arg: 'runId' },
    doctor: { id: 'coder.doctor' },
    status: { id: 'coder.status' },
    modified: { id: 'coder.status' },
    list: { id: 'coder.status' }
  }
  const verb = match[1].toLowerCase()
  const cap = verbs[verb] ?? verbs.status
  emitAgentActivity(requestId, `[Coder Engine] ${verb}`)
  const runId = cap.arg && match[2] ? { [cap.arg]: match[2] } : {}
  return runCapability(cap.id, { ...runId, projectPath, requestId }, 'code_edit')
}

/** Every capability-backed intent goes through this one path: look up
 * the registered capability, run it, translate the result. This is what
 * makes handlePrompt itself stay unchanged as new plugins are added. */
async function runCapability(
  id: string,
  args: Record<string, unknown>,
  intent: AiIntentType,
  extra: Partial<AiResponse> = {}
): Promise<AiResponse> {
  const capability = getCapability(id)
  if (!capability) {
    const disabledReason = getDisabledReason(id)
    if (disabledReason) {
      emitAgentStatus('ready', 'Flame ready')
      return {
        reply: `⚠️ ${disabledReason}. To use capability "${id}", please re-enable the module in the Plugins settings.`,
        intent: 'unknown',
        actionSuccess: false
      }
    }
    const requestId = args.requestId as string | undefined
    emitAgentStatus('coding', 'Synthesizing new capability...')
    emitAgentActivity(requestId, '[Flame] Synthesizing new capability...')
    // Attempt RSI capability synthesis via coder engine
    try {
      const project = await getCurrentProject()
      if (project.path) {
        const task = `Synthesize a new FlameAGI capability plugin for "${id}". ` +
          `Create a capability handler that registers under the id "${id}" ` +
          `following the pattern in src/main/flameCore/capabilities.ts. ` +
          `The capability should handle: ${JSON.stringify(args)}.`
        const result = await runCoderTask(task, project.path, { requestId, review: true })
        if (result.status === 'staged' || result.status === 'applied') {
          emitSkillUnlocked(id)
          emitAgentStatus('ready', 'Flame ready')
          return { reply: `✨ New Skill Unlocked: ${id}\n\n${formatRunResult(result)}`, intent, actionSuccess: true, ...extra }
        }
        emitAgentStatus('ready', 'Flame ready')
        return { reply: `Capability "${id}" synthesis attempted but ${result.status}: ${result.error || formatRunResult(result)}`, intent, actionSuccess: false }
      }
    } catch {
      // Synthesis failed — fall through to the original error
    }
    emitAgentStatus('ready', 'Flame ready')
    return { reply: `"${id}" isn't available right now.`, intent: 'unknown' }
  }

  try {
    const result = await capability.run(args)
    if (result.message.startsWith('__PENDING_FILE_OP__')) {
      const { operationId, label } = JSON.parse(result.message.replace('__PENDING_FILE_OP__', '')) as {
        operationId: string
        label: string
      }
      return {
        reply: label.startsWith('RSI: ')
          ? `${label}? This will create a Git checkpoint, then let OpenCode edit this project. Continue?`
          : `${label}? This will overwrite existing files if present.`,
        intent,
        pendingAction: { type: 'fileOperation', operationId, operationLabel: label }
      }
    }
    const extraResponse: Partial<AiResponse> = { ...extra }
    if (result.data && typeof result.data === 'object') {
      const dataObj = result.data as Record<string, unknown>
      if (Array.isArray(dataObj.content)) {
        const imgBlock = dataObj.content.find((c: any) => c && c.type === 'image' && c.data)
        if (imgBlock) {
          const mime = imgBlock.mimeType || 'image/jpeg'
          const dataUri = `data:${mime};base64,${imgBlock.data}`
          const isWhatsAppQr = id === 'whatsapp.get_qr'
          const promptLabel = isWhatsAppQr ? 'WhatsApp Web Pairing QR Code' : 'Live Desktop Screen Capture'
          const fileName = isWhatsAppQr ? 'whatsapp_qr.png' : 'desktop_snapshot.jpg'
          extraResponse.generatedImage = {
            dataUri,
            prompt: promptLabel,
            fileName
          }
          extraResponse.images = [
            ...(extraResponse.images || []),
            {
              src: dataUri,
              caption: promptLabel,
              fileName
            }
          ]
        }
      }
    }

    if (id === 'whatsapp.get_archived_media') {
      try {
        const items = JSON.parse(result.message)
        if (Array.isArray(items)) {
          const mediaImages: Array<{ src: string; caption?: string; filePath?: string; fileName?: string }> = []
          for (const item of items) {
            if (item.type === 'photo' && item.filePath) {
              try {
                if (fs.existsSync(item.filePath)) {
                  const fileBuf = fs.readFileSync(item.filePath)
                  mediaImages.push({
                    src: `data:image/jpeg;base64,${fileBuf.toString('base64')}`,
                    caption: item.caption || `Photo from ${item.senderName || item.senderJid}`,
                    filePath: item.filePath,
                    fileName: path.basename(item.filePath)
                  })
                }
              } catch {
                // ignore
              }
            }
          }
          if (mediaImages.length > 0) {
            extraResponse.images = [...(extraResponse.images || []), ...mediaImages]
          }
        }
      } catch {
        // ignore
      }
    }
    return { reply: result.message, intent, actionSuccess: result.success, ...extraResponse }
  } catch (err) {
    // Unhandled tool/error -> update status to status: "coding" with message: "Synthesizing new capability..."
    const requestId = args.requestId as string | undefined
    emitAgentStatus('coding', 'Synthesizing new capability...')
    emitAgentActivity(requestId, '[Flame] Synthesizing new capability...')
    try {
      const project = await getCurrentProject()
      if (project.path) {
        const task = `Fix unhandled error in capability "${id}": ${err instanceof Error ? err.message : String(err)}. Arguments: ${JSON.stringify(args)}.`
        const coderResult = await runCoderTask(task, project.path, { requestId, review: true })
        if (coderResult.status === 'staged' || coderResult.status === 'applied') {
          emitSkillUnlocked(id)
          emitAgentStatus('ready', 'Flame ready')
          return { reply: `✨ New Skill Unlocked: ${id}\n\n${formatRunResult(coderResult)}`, intent, actionSuccess: true, ...extra }
        }
      }
    } catch {
      // fallback
    }
    emitAgentStatus('ready', 'Flame ready')
    return { reply: `Error executing capability "${id}": ${err instanceof Error ? err.message : String(err)}`, intent, actionSuccess: false }
  }
}

/**
 * Direct OSINT command runner.
 * Parses input target into domain, phone number, or IP address and directly
 * invokes OSINT executors without routing to Coder Engine.
 */
async function runOsintCommand(rawPrompt: string, requestId?: string): Promise<AiResponse> {
  // Strip leading "osint" or "/osint", then colon, then whitespace
  let target = rawPrompt
    .trim()
    .replace(/^\/?osint\b/i, '')
    .trim()
    .replace(/^:/, '')
    .trim()

  // Clean outer quotes, angle brackets, or braces (e.g. <domain>, "example.com", <no.>)
  target = target.replace(/^[<"'{[]+|[>"'}\]]+$/g, '').trim()

  // Check if target is empty or a literal documentation placeholder like "<domain>", "<no.>", "domain", etc.
  const lower = target.toLowerCase()
  const isHelpOrEmpty =
    !target ||
    lower === 'help' ||
    lower === '?' ||
    lower === 'domain' ||
    lower === 'no.' ||
    lower === 'no' ||
    lower === 'target' ||
    lower.includes('<no.>') ||
    lower.includes('<domain>') ||
    lower.includes('<target>') ||
    lower.includes('no. or domain') ||
    lower.includes('no.> or <domain')

  if (isHelpOrEmpty) {
    return {
      reply:
        '🔍 **WinPilot OSINT Recon**\n\n' +
        '**Usage:** `osint: <domain | phone | ip>`\n\n' +
        '**Examples:**\n' +
        '• **Domain Recon:** `osint: example.com` or `osint: github.com`\n' +
        '  *(DNS records, HTTP security headers score, TLS certificate validity, CT subdomains)*\n\n' +
        '• **Phone Validation:** `osint: +919876543210` or `osint: 1-800-555-0199`\n' +
        '  *(E.164 normalization, country metadata, numbering plan type — 100% offline & private)*\n\n' +
        '• **IP & Threat Intel:** `osint: 8.8.8.8` or `osint: 1.1.1.1`\n' +
        '  *(Reverse DNS, ASN, ISP/Organization, Geolocation, Tor/Proxy flags, RDAP)*',
      intent: 'osint',
      actionSuccess: true
    }
  }

  // Handle optional explicit sub-type prefixes (e.g. "osint: domain google.com", "osint: phone +91...", "osint: ip 1.1.1.1", "osint: user torvalds")
  let forcedType: 'domain' | 'phone' | 'ip' | 'identity' | null = null
  const domainPrefix = target.match(/^domain\s+(.+)$/i)
  const phonePrefix = target.match(/^(?:phone|no|number)\s+(.+)$/i)
  const ipPrefix = target.match(/^ip\s+(.+)$/i)
  const userPrefix = target.match(/^(?:user|username|id|identity|email)\s+(.+)$/i)

  if (domainPrefix) {
    forcedType = 'domain'
    target = domainPrefix[1].trim()
  } else if (phonePrefix) {
    forcedType = 'phone'
    target = phonePrefix[1].trim()
  } else if (ipPrefix) {
    forcedType = 'ip'
    target = ipPrefix[1].trim()
  } else if (userPrefix) {
    forcedType = 'identity'
    target = userPrefix[1].trim()
  }

  target = target.replace(/^[<"'{[]+|[>"'}\]]+$/g, '').trim()

  if (forcedType === 'identity' || (forcedType === null && target.includes('@'))) {
    const res = await executeIdentityOsint(target, requestId)
    return { reply: res.message, intent: 'osint', actionSuccess: res.success }
  }

  // 1. IP check (IPv4 / IPv6)
  const hostCandidate = target.replace(/^https?:\/\//i, '').split('/')[0]
  const ipv4NoPort = hostCandidate.includes(':') ? hostCandidate.split(':')[0] : hostCandidate
  const isDirectIp = net.isIP(hostCandidate) !== 0
  const isIpv4WithPort = net.isIP(ipv4NoPort) === 4
  const resolvedIp = isDirectIp ? hostCandidate : ipv4NoPort

  if (forcedType === 'ip' || (forcedType === null && (isDirectIp || isIpv4WithPort))) {
    const res = await executeIpOsint(resolvedIp, requestId)
    return { reply: res.message, intent: 'osint', actionSuccess: res.success }
  }

  // 2. Phone number check:
  // - Starts with '+' (e.g. +919876543210, +1 800 555 0199)
  // - OR phone-like characters only (+, -, spaces, parentheses, digits) with at least 7 digits and no dots
  const digitsOnly = target.replace(/\D/g, '')
  const hasPhoneCharsOnly = /^[\d\s+\-().]+$/.test(target)
  const isPhone =
    forcedType === 'phone' ||
    (forcedType === null &&
      (target.startsWith('+') || (hasPhoneCharsOnly && digitsOnly.length >= 7 && !target.includes('.'))))

  if (isPhone) {
    const res = executePhoneOsint(target, requestId)
    return { reply: res.message, intent: 'osint', actionSuccess: res.success }
  }

  // 3. Domain check
  const domain = target
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .trim()

  const res = await executeDomainOsint(domain, requestId)
  return { reply: res.message, intent: 'osint', actionSuccess: res.success }
}

/**
 * Installs, updates, and uninstalls deliberately never run silently without confirmation —
 * they propose a pending action; the user's Confirm button in the
 * chat UI calls the execution handler directly. This is Flame's
 * approval-gate rule made structural, not just a UI convention.
 */
async function runInstallCheck(appQuery: string): Promise<AiResponse> {
  try {
    const results = await winget.search(appQuery)
    const match = findBestMatch(appQuery, results)
    if (!match) {
      return {
        reply: `Couldn't find "${appQuery}" in winget's catalog.`,
        intent: 'install_app',
        app: appQuery,
        actionSuccess: false
      }
    }
    const icon = match.icon || (await winget.getIconForPackage(match.id, match.name))
    return {
      reply: `Install ${match.name} (${match.id})? Please confirm to proceed with the installation.`,
      intent: 'install_app',
      app: appQuery,
      pendingAction: {
        type: 'install',
        packageId: match.id,
        packageName: match.name,
        icon
      }
    }
  } catch (err) {
    return {
      reply: `Couldn't check "${appQuery}": ${err instanceof Error ? err.message : String(err)}`,
      intent: 'install_app',
      app: appQuery,
      actionSuccess: false
    }
  }
}

async function runUpdateCheck(appQuery: string): Promise<AiResponse> {
  try {
    const upgradable = await winget.listUpgradable()
    const match = findBestMatch(appQuery, upgradable)
    if (match && match.availableVersion) {
      const icon = match.icon || (await winget.getIconForPackage(match.id, match.name))
      return {
        reply: `Update ${match.name} (${match.id}) from v${match.version} to v${match.availableVersion}? Please confirm to proceed.`,
        intent: 'update_app',
        app: appQuery,
        pendingAction: {
          type: 'update',
          packageId: match.id,
          packageName: match.name,
          icon
        }
      }
    }

    const installed = await winget.listInstalled()
    const installedMatch = findBestMatch(appQuery, installed)
    if (installedMatch) {
      return {
        reply: `"${installedMatch.name}" is already up to date (version ${installedMatch.version}).`,
        intent: 'update_app',
        app: appQuery,
        actionSuccess: true
      }
    }

    return {
      reply: `"${appQuery}" doesn't have an update available (or isn't installed).`,
      intent: 'update_app',
      app: appQuery,
      actionSuccess: false
    }
  } catch (err) {
    return {
      reply: `Couldn't check updates for "${appQuery}": ${err instanceof Error ? err.message : String(err)}`,
      intent: 'update_app',
      app: appQuery,
      actionSuccess: false
    }
  }
}

async function runCheckUpdates(): Promise<AiResponse> {
  try {
    const upgradable = await winget.listUpgradable()
    if (upgradable.length === 0) {
      return {
        reply: 'Everything is up to date! No application updates are currently available.',
        intent: 'update_app',
        actionSuccess: true
      }
    }
    const updateList = upgradable
      .map((pkg) => `• **${pkg.name}** (\`${pkg.id}\`): v${pkg.version} → v${pkg.availableVersion ?? 'newer'}`)
      .join('\n')
    return {
      reply: `Found **${upgradable.length}** application update(s) available:\n\n${updateList}\n\nTo update an app, ask me (e.g. "update ${upgradable[0].name}") or open Winget Manager.`,
      intent: 'update_app',
      actionSuccess: true
    }
  } catch (err) {
    return {
      reply: `Couldn't check for updates: ${err instanceof Error ? err.message : String(err)}`,
      intent: 'update_app',
      actionSuccess: false
    }
  }
}

async function runUninstallCheck(appQuery: string): Promise<AiResponse> {
  try {
    const installed = await winget.listInstalled()
    const match = findBestMatch(appQuery, installed)
    if (!match) {
      return { reply: `"${appQuery}" doesn't appear to be installed.`, intent: 'uninstall_app', app: appQuery, actionSuccess: false }
    }
    const icon = match.icon || (await winget.getIconForPackage(match.id, match.name))
    return {
      reply: `Uninstall ${match.name}? This can't be undone.`,
      intent: 'uninstall_app',
      app: appQuery,
      pendingAction: { type: 'uninstall', packageId: match.id, packageName: match.name, icon }
    }
  } catch (err) {
    return {
      reply: `Couldn't check "${appQuery}": ${err instanceof Error ? err.message : String(err)}`,
      intent: 'uninstall_app',
      app: appQuery,
      actionSuccess: false
    }
  }
}

export { checkOllamaStatus }
