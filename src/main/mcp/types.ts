/**
 * Shared types for the FlameAGI MCP infrastructure.
 * All MCP servers, the host manager, and the capability bridge use these.
 */

export interface McpServerConfig {
  /** Unique server identifier (e.g. "browser", "filesystem", "os_control") */
  id: string
  /** Human-readable name shown in the Plugins page */
  name: string
  /** Brief description of the server's capabilities */
  description: string
  /**
   * How to launch this server.
   * "builtin" = spawned from the compiled FlameAGI binary using its own script.
   * "external" = external binary or npx command.
   */
  type: 'builtin' | 'external'
  /**
   * For builtin servers: relative path from __dirname to the server entry script.
   * For external servers: the command to run (e.g. "npx", "/usr/local/bin/my-mcp-server").
   */
  command?: string
  /** Arguments passed to the command */
  args?: string[]
  /** Extra environment variables */
  env?: Record<string, string>
  /** Whether this server is enabled */
  enabled: boolean
  /** Plugin group name for capability registration (e.g. "browser", "filesystem") */
  pluginId: string
}

export interface McpToolSchema {
  type: string
  properties?: Record<string, { type: string; description?: string; enum?: string[] }>
  required?: string[]
}

export interface McpTool {
  name: string
  description: string
  inputSchema: McpToolSchema
}

export interface McpServerStatus {
  id: string
  name: string
  running: boolean
  toolCount: number
  tools: string[]
  error?: string
  pid?: number | null
}

