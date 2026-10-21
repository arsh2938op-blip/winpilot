import { registerCapability } from '../../flameCore/capabilities'
import { chooseZapierTool, fillToolArguments } from '../../services/ai/ollama'
import { listToolSummaries, getToolSchema, callMcpTool } from '../../services/ai/zapierClient'

export function registerZapierCapabilities(): void {
  registerCapability({
    id: 'zapier.run',
    label: 'Run a Zapier-connected action',
    description: 'Dynamically picks and calls a tool from any app connected through Zapier MCP (WhatsApp, Gmail, Discord, etc.).',
    run: async (args) => {
      const instruction = (args.instruction as string | undefined)?.trim()
      if (!instruction) return { success: false, message: "I wasn't sure what you wanted me to do there." }

      try {
        const tools = await listToolSummaries()
        if (tools.length === 0) {
          return { success: false, message: 'No apps are connected through Zapier yet — add some actions on your Zapier MCP server first.' }
        }
        const toolName = await chooseZapierTool(instruction, tools)
        if (!toolName) {
          return { success: false, message: 'None of your connected Zapier apps seem to match that request.' }
        }
        const schema = await getToolSchema(toolName)
        const callArgs = await fillToolArguments(instruction, toolName, schema)
        const result = await callMcpTool(toolName, callArgs)
        return { success: result.success, message: result.success ? `Done — ${toolName} handled that.` : result.message }
      } catch (err) {
        return { success: false, message: `Couldn't complete that action: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}
