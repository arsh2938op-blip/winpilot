/**
 * IPC handlers for the MCP Host Manager.
 *
 * Channels:
 *   mcp:get-status        → mcpHost.getStatusSummary()
 *   mcp:reconnect-server  → mcpHost.reconnectServer(serverName)
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import { mcpHost } from '../mcp/mcpHost'

export function registerMcpIpc(): void {
  // Primary IPC handlers required by prompt
  ipcMain.handle('mcp:get-status', async () => {
    return mcpHost.getStatusSummary()
  })

  ipcMain.handle('mcp:reconnect-server', async (_event, serverName: string) => {
    await mcpHost.reconnectServer(serverName)
    return mcpHost.getStatusSummary()
  })

  // Aliases
  ipcMain.handle(IpcChannels.mcp.getStatus, async () => {
    return mcpHost.getStatusSummary()
  })

  ipcMain.handle(IpcChannels.mcp.listServers, async () => {
    return mcpHost.getStatusSummary()
  })

  ipcMain.handle(IpcChannels.mcp.reloadServer, async (_event, id: string) => {
    await mcpHost.reconnectServer(id)
    return mcpHost.getStatusSummary()
  })
}
