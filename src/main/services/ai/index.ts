import type { AiResponse, AiIntentType, ChatModelId } from '@shared/types'
import { getIntent, checkOllamaStatus, generatePromptArtifact } from './ollama'
import * as winget from '../winget'
import { findBestMatch } from '../winget/matchPackage'
import { getCapability } from '../../flameCore/capabilities'
import { classifyEffort } from '../../flameCore/effort'
import { emitAgentActivity } from '../../utils/broadcast'
import { detectDebateStart, detectDebateStop } from './debateTrigger'
import { getDifficulty } from '../../flameCore/difficultyStore'
import { isDebateRunning, startDebate, stopDebate } from './debate'
import type { EffortLevel } from '../../flameCore/effort'
import { getCurrentProject } from '../project/store'
import { listImportedProjects } from '../projects/store'
import { parseEditPrompt } from './coderEngine'

export async function handlePrompt(
  prompt: string,
  model: ChatModelId = 'gemma',
  requestId?: string,
  effortOverride?: EffortLevel | 'auto'
): Promise<AiResponse> {
  emitAgentActivity(requestId, '[Flame] Request received')

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

  /* ---- Coder Engine fast paths (v1.2.0 chat commands + "Edit:" syntax) ----
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
    const result = await runCapability('ai_network.gemini', { instruction: prompt, requestId }, 'ai_network')
    emitAgentActivity(requestId, '[Flame] Task complete')
    return result
  }

  const effort = effortOverride && effortOverride !== 'auto' ? effortOverride : classifyEffort(prompt)
  emitAgentActivity(requestId, `[Effort] ${effort.toUpperCase()}`)
  const difficulty = effort === 'low' ? 'normal' : await getDifficulty()
  const intentResult = await getIntent(prompt, effort, requestId, difficulty)
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
      result = appQuery
        ? await runCapability('winget.install', { app: appQuery, requestId }, 'install_app', { app: appQuery })
        : { reply: 'Which app should I install?', intent: 'unknown' }
      break
    }

    case 'update_app': {
      result = appQuery
        ? await runCapability('winget.update', { app: appQuery, requestId }, 'update_app', { app: appQuery })
        : { reply: 'Which app should I update?', intent: 'unknown' }
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
      result = { reply: intentResult.reply, intent: 'unknown' }
      break
  }

  emitAgentActivity(requestId, '[Flame] Task complete')
  return result
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
    return { reply: `"${id}" isn't available right now.`, intent: 'unknown' }
  }
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
  return { reply: result.message, intent, actionSuccess: result.success, ...extra }
}

/**
 * Uninstall deliberately never goes through the capability registry —
 * it only proposes a pending action; the user's Confirm button in the
 * chat UI calls the real uninstall IPC directly. This is Flame's
 * approval-gate rule made structural, not just a UI convention.
 */
async function runUninstallCheck(appQuery: string): Promise<AiResponse> {
  try {
    const installed = await winget.listInstalled()
    const match = findBestMatch(appQuery, installed)
    if (!match) {
      return { reply: `"${appQuery}" doesn't appear to be installed.`, intent: 'uninstall_app', app: appQuery, actionSuccess: false }
    }
    return {
      reply: `Uninstall ${match.name}? This can't be undone.`,
      intent: 'uninstall_app',
      app: appQuery,
      pendingAction: { type: 'uninstall', packageId: match.id, packageName: match.name }
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
