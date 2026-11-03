// src/main/mcp/servers/osControlServer.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const server = new Server(
  { name: 'flame-os-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'os.run_powershell',
      description: 'Execute a Windows PowerShell command or script and return stdout/stderr.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'PowerShell command to execute' }
        },
        required: ['command']
      }
    },
    {
      name: 'os.manage_processes',
      description: 'List top RAM-consuming processes, launch an application (including Roblox or desktop apps), or kill a process by name/PID.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list_top_ram', 'launch_app', 'kill_process'] },
          target: {
            type: 'string',
            description: 'App name/path to launch (e.g., roblox, notepad, code) or process name/PID to kill'
          },
          robloxPlaceId: { type: 'string', description: 'Optional Roblox Place ID to launch directly into a game' }
        },
        required: ['action']
      }
    },
    {
      name: 'os.clipboard',
      description: 'Read current text from or copy text into the Windows Clipboard.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write'] },
          text: { type: 'string', description: 'Text to copy into clipboard when action is write' }
        },
        required: ['action']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  if (name === 'os.run_powershell') {
    const cmd = String(args.command || '')
    const { stdout, stderr } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${cmd.replace(/"/g, '\\"')}"`,
      { timeout: 25000 }
    )
    return {
      content: [{ type: 'text', text: (stdout || stderr || 'Command completed with no output.').trim() }]
    }
  }

  if (name === 'os.manage_processes') {
    const action = String(args.action)

    if (action === 'list_top_ram') {
      const ps = `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 20 Name, Id, @{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64 / 1MB, 1)}} | ConvertTo-Json`
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps}"`)
      return { content: [{ type: 'text', text: stdout.trim() }] }
    }

    if (action === 'launch_app') {
      const target = String(args.target || '').trim().toLowerCase()
      if (target === 'roblox') {
        const uri = args.robloxPlaceId
          ? `roblox://placeId=${String(args.robloxPlaceId)}`
          : `roblox-player:`
        await execAsync(`cmd /c start "" "${uri}"`)
        return { content: [{ type: 'text', text: `Launched Roblox client (${uri}).` }] }
      }
      await execAsync(`cmd /c start "" "${String(args.target)}"`)
      return { content: [{ type: 'text', text: `Launched application: ${args.target}` }] }
    }

    if (action === 'kill_process') {
      const target = String(args.target || '').trim()
      const isPid = /^\d+$/.test(target)
      const flag = isPid ? `/PID ${target}` : `/IM "${target.endsWith('.exe') ? target : `${target}.exe`}"`
      const { stdout } = await execAsync(`taskkill /F ${flag}`)
      return { content: [{ type: 'text', text: stdout.trim() }] }
    }
  }

  if (name === 'os.clipboard') {
    const action = String(args.action)
    if (action === 'read') {
      const { stdout } = await execAsync(`powershell -NoProfile -Command "Get-Clipboard"`)
      return { content: [{ type: 'text', text: stdout.trim() }] }
    }
    if (action === 'write') {
      const safeText = String(args.text || '').replace(/'/g, "''")
      await execAsync(`powershell -NoProfile -Command "Set-Clipboard -Value '${safeText}'"`)
      return { content: [{ type: 'text', text: 'Updated Windows Clipboard.' }] }
    }
  }

  throw new Error(`Unknown OS tool: ${name}`)
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('[Flame OS MCP Error]:', err)
  process.exit(1)
})
