// src/main/mcp/mcpHost.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { registerCapability, getCapability } from '../flameCore/capabilities'
import { emitAgentActivity } from '../utils/broadcast'
import { getFlameDir, getUserDataDir, isAppPackaged, getBundledSearchDirs } from '../utils/flamePaths'

export interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
  enabled?: boolean
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
}

interface ConnectedServer {
  name: string
  client: Client
  transport: StdioClientTransport
  tools: string[]
}

export class McpHostManager {
  private explicitRoot?: string
  private servers: Map<string, ConnectedServer> = new Map()

  constructor(workspaceRoot?: string) {
    this.explicitRoot = workspaceRoot
  }

  private getFlameRoot(): string {
    if (this.explicitRoot) {
      return fsSync.existsSync(path.join(this.explicitRoot, '.flame'))
        ? path.join(this.explicitRoot, '.flame')
        : path.join(this.explicitRoot, 'winpilot', '.flame')
    }
    return getFlameDir()
  }

  private getConfigPath(): string {
    return path.join(this.getFlameRoot(), 'mcp_servers.json')
  }

  private resolveCompiledMcpServer(serverFileBase: string): string | null {
    const relJs = path.join('out', 'main', 'mcp', 'servers', `${serverFileBase}.js`)
    const candidates = [
      path.join(__dirname, 'mcp', 'servers', `${serverFileBase}.js`),
      path.join(path.resolve(__dirname, '..'), 'mcp', 'servers', `${serverFileBase}.js`),
      ...getBundledSearchDirs().map((dir) => path.join(dir, relJs))
    ]
    for (const candidate of candidates) {
      if (fsSync.existsSync(candidate)) {
        return candidate
      }
    }
    return null
  }

  public async initializeAllServers(): Promise<void> {
    await this.ensureDefaultConfig()
    const configMap = await this.loadConfig()

    for (const [serverName, serverCfg] of Object.entries(configMap)) {
      if (serverCfg.enabled === false) continue
      await this.connectServer(serverName, serverCfg).catch((err) => {
        console.error(`[MCP Host] Failed to start server "${serverName}":`, err instanceof Error ? err.message : String(err))
      })
    }
  }

  public async connectServer(name: string, cfg: McpServerConfig): Promise<void> {
    if (this.servers.has(name)) {
      await this.disconnectServer(name)
    }

    const mergedEnv: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') mergedEnv[k] = v
    }
    mergedEnv.FLAME_DATA_DIR = this.getFlameRoot()
    mergedEnv.FLAME_USER_DATA = getUserDataDir()
    if (cfg.env) {
      Object.assign(mergedEnv, cfg.env)
    }

    let command = process.platform === 'win32' && cfg.command === 'npx' ? 'npx.cmd' : cfg.command
    let resolvedArgs = [...cfg.args]

    // Detect built-in Flame MCP servers and execute compiled JS via bundled Electron Node runtime in packaged builds
    const builtInMatch = cfg.args
      .map((a) => a.replace(/\\/g, '/').match(/(?:src|out)\/main\/mcp\/servers\/([a-zA-Z0-9_-]+)\.(?:ts|js)$/))
      .find(Boolean)

    if (builtInMatch) {
      const serverBase = builtInMatch[1]
      const compiledJs = this.resolveCompiledMcpServer(serverBase)
      const devTs = path.resolve(process.cwd(), 'src', 'main', 'mcp', 'servers', `${serverBase}.ts`)

      if (compiledJs && (isAppPackaged() || !fsSync.existsSync(devTs))) {
        command = process.execPath
        resolvedArgs = [compiledJs]
        mergedEnv.ELECTRON_RUN_AS_NODE = '1'
      } else {
        resolvedArgs = cfg.args.map((arg) => {
          if (arg.startsWith('src/main/mcp/servers/') || arg.startsWith('out/main/mcp/servers/')) {
            return path.resolve(path.dirname(this.getFlameRoot()), arg)
          }
          return arg
        })
      }
    } else {
      resolvedArgs = cfg.args.map((arg) => {
        if (arg.startsWith('src/main/mcp/servers/') || arg.startsWith('out/main/mcp/servers/')) {
          return path.resolve(path.dirname(this.getFlameRoot()), arg)
        }
        return arg
      })
    }

    const transport = new StdioClientTransport({
      command,
      args: resolvedArgs,
      env: mergedEnv
    })

    const client = new Client(
      { name: `flame-host-${name}`, version: '2.0.0' },
      { capabilities: {} }
    )

    await client.connect(transport)
    const { tools } = await client.listTools()
    const registeredToolNames: string[] = []

    for (const tool of tools) {
      registeredToolNames.push(tool.name)
      const schemaProps = (tool.inputSchema?.properties || {}) as Record<string, any>
      const requiredList = Array.isArray(tool.inputSchema?.required)
        ? tool.inputSchema.required
        : []

      const mappedParams: Record<string, any> = {}
      for (const [propKey, propVal] of Object.entries(schemaProps)) {
        mappedParams[propKey] = {
          type: propVal.type || 'string',
          description: propVal.description || '',
          required: requiredList.includes(propKey)
        }
      }

      const existingNativeCap = tool.name.startsWith('whatsapp.') ? getCapability(tool.name) : undefined

      const runFn = async (args: Record<string, unknown>) => {
        if (existingNativeCap) {
          const requestId = args.requestId as string | undefined
          const startTime = Date.now()
          emitAgentActivity(requestId, `[MCP:${tool.name}] Running tool...`)
          const res = await existingNativeCap.run(args)
          emitAgentActivity(requestId, `[MCP:${tool.name}] Completed in ${Date.now() - startTime}ms`)
          return res
        }

        const active = this.servers.get(name)
        if (!active) {
          return { success: false, message: `MCP server "${name}" is currently offline.` }
        }
        const requestId = args.requestId as string | undefined
        const startTime = Date.now()
        emitAgentActivity(requestId, `[MCP:${tool.name}] Running tool...`)
        try {
          const res = await active.client.callTool({
            name: tool.name,
            arguments: args
          })
          const tookMs = Date.now() - startTime

          const textBlocks = Array.isArray(res.content)
            ? res.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n')
            : JSON.stringify(res)

          emitAgentActivity(requestId, `[MCP:${tool.name}] Completed in ${tookMs}ms`)

          return {
            success: !res.isError,
            message: textBlocks,
            data: { tookMs, tool: tool.name, content: res.content }
          }
        } catch (err) {
          const tookMs = Date.now() - startTime
          const errMsg = err instanceof Error ? err.message : String(err)
          emitAgentActivity(requestId, `[MCP:${tool.name}] Failed in ${tookMs}ms: ${errMsg}`)
          throw err
        }
      }

      registerCapability({
        id: tool.name,
        name: tool.name,
        description: `[MCP:${name}] ${tool.description || tool.name}`,
        pluginId: existingNativeCap?.pluginId,
        parameters: mappedParams,
        run: runFn,
        execute: runFn
      })
    }

    this.servers.set(name, { name, client, transport, tools: registeredToolNames })
    console.log(`[MCP Host] Connected "${name}" with ${registeredToolNames.length} tools.`)
  }

  public async disconnectServer(name: string): Promise<void> {
    const existing = this.servers.get(name)
    if (!existing) return
    try {
      await existing.transport.close()
    } catch {
      // Ignore close errors
    }
    this.servers.delete(name)
  }

  public async reconnectServer(name: string): Promise<boolean> {
    const configMap = await this.loadConfig()
    let targetKey = name
    let targetCfg = configMap[name]

    if (!targetCfg) {
      for (const [k, v] of Object.entries(configMap)) {
        if (k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase())) {
          targetKey = k
          targetCfg = v
          break
        }
      }
    }

    if (!targetCfg) {
      return false
    }

    try {
      await this.connectServer(targetKey, targetCfg)
      return true
    } catch (err) {
      console.error(`[MCP Host] Reconnect failed for "${targetKey}":`, err)
      return false
    }
  }

  public async stop(): Promise<void> {
    for (const [name, server] of this.servers) {
      try {
        await server.transport.close()
      } catch {
        // ignore
      }
    }
    this.servers.clear()
  }

  public async getStatusSummary(): Promise<Array<{ id: string; name: string; online: boolean; running: boolean; tools: string[]; toolCount: number }>> {
    const configMap = await this.loadConfig()
    return Object.entries(configMap).map(([serverName]) => {
      const active = this.servers.get(serverName)
      const cleanName = serverName.replace(/^flame-/, '')
      const displayName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
      const isOnline = Boolean(active)
      return {
        id: serverName,
        name: displayName,
        online: isOnline,
        running: isOnline,
        tools: active ? active.tools : [],
        toolCount: active ? active.tools.length : 0
      }
    })
  }

  private async loadConfig(): Promise<Record<string, McpServerConfig>> {
    await this.ensureDefaultConfig()
    try {
      const raw = await fs.readFile(this.getConfigPath(), 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        return parsed.mcpServers
      }
      if (Array.isArray(parsed.servers)) {
        const converted: Record<string, McpServerConfig> = {}
        for (const s of parsed.servers) {
          const key = s.id?.startsWith('flame-') ? s.id : `flame-${s.id}`
          converted[key] = {
            command: s.command || 'npx',
            args: s.args || ['tsx', `src/main/mcp/servers/${s.id}Server.ts`],
            enabled: s.enabled !== false
          }
        }
        return converted
      }
    } catch (err) {
      console.error('[MCP Host] Error loading config:', err)
    }
    return {}
  }

  private async ensureDefaultConfig(): Promise<void> {
    const configPath = this.getConfigPath()
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    if (!fsSync.existsSync(configPath)) {
      const defaultConfig: McpConfigFile = {
        mcpServers: {
          'flame-computer-use': {
            command: 'npx',
            args: ['tsx', 'src/main/mcp/servers/computerUseServer.ts'],
            enabled: true
          },
          'flame-browser': {
            command: 'npx',
            args: ['tsx', 'src/main/mcp/servers/browserServer.ts'],
            enabled: true
          },
          'flame-filesystem': {
            command: 'npx',
            args: ['tsx', 'src/main/mcp/servers/fileSystemServer.ts'],
            enabled: true
          },
          'flame-os': {
            command: 'npx',
            args: ['tsx', 'src/main/mcp/servers/osControlServer.ts'],
            enabled: true
          },
          'flame-whatsapp': {
            command: 'npx',
            args: ['tsx', 'src/main/mcp/servers/whatsappServer.ts'],
            enabled: true
          }
        }
      }
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8')
    }
  }
}

export const mcpHost = new McpHostManager()
