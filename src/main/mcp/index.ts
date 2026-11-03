/**
 * MCP module entry point.
 *
 * Exports McpHostManager and provides a module-level singleton so that
 * IPC handlers, fast-path routes, and the main process all share one host.
 */

export { McpHostManager, mcpHost } from './mcpHost'
export * from './types'
export { bridgeToolResult } from './mcpCapabilityBridge'

import { mcpHost } from './mcpHost'

/** Get the singleton McpHostManager. */
export function getMcpHost() {
  return mcpHost
}

/** Start all enabled MCP servers. Call once after registerIpcHandlers(). */
export async function startMcpHost(): Promise<void> {
  try {
    await mcpHost.initializeAllServers()
    console.log('[MCP] Host started successfully.')
  } catch (err) {
    console.error('[MCP] Host failed to start:', err)
  }
}

/** Stop all MCP servers. Call on before-quit. */
export async function stopMcpHost(): Promise<void> {
  await mcpHost.stop()
}
