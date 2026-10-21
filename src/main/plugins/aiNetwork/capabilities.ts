import { registerCapability } from '../../flameCore/capabilities'
import { askGemini } from '../../services/ai/geminiChat'
import { emitAgentActivity } from '../../utils/broadcast'
import { isOpenCodeEnabled } from '../../services/ai/openCodeStore'
import { runOpenCodeTask } from '../../services/ai/opencode'
import { getCurrentProject } from '../../services/project/store'

export function registerAiNetworkCapabilities(): void {
  registerCapability({
    id: 'ai_network.gemini',
    label: 'Ask Gemini',
    description: 'Sends a question to Google Gemini and returns its answer.',
    run: async (args) => {
      const instruction = (args.instruction as string | undefined)?.trim()
      const requestId = args.requestId as string | undefined
      if (!instruction) return { success: false, message: 'What should I ask Gemini?' }
      try {
        emitAgentActivity(requestId, '[Gemini] Querying model…')
        const result = await askGemini(instruction)
        emitAgentActivity(requestId, '[Gemini] Response ready')
        return { success: true, message: result }
      } catch (err) {
        emitAgentActivity(requestId, '[Gemini] Failed')
        return { success: false, message: `Gemini couldn't answer: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'ai_network.opencode',
    label: 'Ask OpenCode',
    description: 'Sends a quick task/question straight to OpenCode in the active project — no Git checkpoint or test gate (use rsi.improve for guarded code changes).',
    run: async (args) => {
      const instruction = (args.instruction as string | undefined)?.trim()
      const requestId = args.requestId as string | undefined
      if (!instruction) return { success: false, message: 'What should I ask OpenCode?' }
      if (!(await isOpenCodeEnabled())) {
        return { success: false, message: 'OpenCode is disabled — enable it in AI Network settings.' }
      }
      const project = await getCurrentProject()
      if (!project.path) {
        return { success: false, message: 'Pick an active project first so OpenCode has somewhere to run.' }
      }
      try {
        emitAgentActivity(requestId, '[OpenCode] Sending task…')
        const result = await runOpenCodeTask(instruction, project.path, requestId)
        emitAgentActivity(requestId, result.success ? '[OpenCode] Response ready' : '[OpenCode] Failed')
        return { success: result.success, message: result.output }
      } catch (err) {
        emitAgentActivity(requestId, '[OpenCode] Failed')
        return { success: false, message: `OpenCode couldn't answer: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}
