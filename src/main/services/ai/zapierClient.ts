import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ZapierToolInfo } from '@shared/types'
import { getZapierMcpUrl } from './zapierStore'

export interface McpTool {
  name: string
  description?: string
  inputSchema?: { properties?: Record<string, { type?: string; description?: string }> }
}

let cachedClient: Client | null = null
let cachedTools: McpTool[] | null = null

async function getClient(): Promise<Client> {
  if (cachedClient) return cachedClient
  const url = await getZapierMcpUrl()
  if (!url) throw new Error('No Zapier MCP URL saved yet — add one in Flame AGI settings.')

  const transport = new StreamableHTTPClientTransport(new URL(url))
  const client = new Client({ name: 'flame-agi', version: '1.0.0' })
  await client.connect(transport)
  cachedClient = client
  return client
}

/** Call after saving/changing the MCP URL so a stale connection isn't reused. */
export function resetZapierClient(): void {
  cachedClient = null
  cachedTools = null
}

export async function listMcpTools(): Promise<McpTool[]> {
  if (cachedTools) return cachedTools
  const client = await getClient()
  const result = await client.listTools()
  cachedTools = (result.tools ?? []) as McpTool[]
  return cachedTools
}

/** Name + description only — used both to show the user what's available
 * and to give the model a menu to pick from when choosing a tool. */
export async function listToolSummaries(): Promise<ZapierToolInfo[]> {
  const tools = await listMcpTools()
  return tools.map((t) => ({ name: t.name, description: t.description ?? '' }))
}

export async function getToolSchema(
  toolName: string
): Promise<Record<string, { type?: string; description?: string }>> {
  const tools = await listMcpTools()
  const tool = tools.find((t) => t.name === toolName)
  return tool?.inputSchema?.properties ?? {}
}

export interface ToolCallResult {
  success: boolean
  message: string
}

export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  try {
    const client = await getClient()
    const result = await client.callTool({ name: toolName, arguments: args })

    if ((result as { isError?: boolean }).isError) {
      return { success: false, message: `"${toolName}" reported an error — check your Zapier MCP server history for details.` }
    }
    return { success: true, message: `Ran "${toolName}" successfully.` }
  } catch (err) {
    return {
      success: false,
      message: `Couldn't reach Zapier MCP: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}