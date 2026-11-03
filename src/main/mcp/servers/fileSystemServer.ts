// src/main/mcp/servers/fileSystemServer.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

function resolveSmartPath(rawPath: string): string {
  const home = os.homedir()
  const trimmed = rawPath.trim()
  const lower = trimmed.toLowerCase()

  if (lower === 'desktop') return path.join(home, 'Desktop')
  if (lower === 'downloads') return path.join(home, 'Downloads')
  if (lower === 'documents') return path.join(home, 'Documents')
  if (lower === 'temp' || lower === '%temp%') return os.tmpdir()
  if (lower === 'workspace' || lower === '.') return process.cwd()

  return path.resolve(trimmed.replace(/^~(?=$|\/|\\)/, home))
}

function assertSafePath(resolvedPath: string): void {
  const norm = resolvedPath.toLowerCase()
  const blocked = ['c:\\windows\\system32', 'c:\\windows\\syswow64', 'c:\\boot']
  if (blocked.some((b) => norm.startsWith(b))) {
    throw new Error(`Safety Guard: Refusing to modify critical OS directory (${resolvedPath}).`)
  }
}

const server = new Server(
  { name: 'flame-filesystem-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'fs.explore_directory',
      description: 'List files, folders, sizes, and timestamps in any directory (supports Desktop, Downloads, Documents, %TEMP%, or full paths).',
      inputSchema: {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: 'Directory path or shortcut (e.g., Desktop, Downloads, C:\\Users)' }
        },
        required: ['dirPath']
      }
    },
    {
      name: 'fs.search_files',
      description: 'Recursively search for files by name, extension, or text content inside a folder.',
      inputSchema: {
        type: 'object',
        properties: {
          rootDir: { type: 'string', description: 'Root directory or shortcut to search in' },
          query: { type: 'string', description: 'Filename substring or extension (e.g., .pdf,chunk.csv)' },
          maxResults: { type: 'number', description: 'Max files to return (default 40)' }
        },
        required: ['rootDir', 'query']
      }
    },
    {
      name: 'fs.read_write_edit',
      description: 'Read, write, append, move, or delete a file or folder.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'append', 'delete', 'move'] },
          targetPath: { type: 'string', description: 'Target file or folder path' },
          content: { type: 'string', description: 'Text content for write/append' },
          destinationPath: { type: 'string', description: 'Destination path when action is move' }
        },
        required: ['action', 'targetPath']
      }
    },
    {
      name: 'fs.clean_temp',
      description: 'Clean unneeded temporary files from Windows %TEMP% and return total megabytes freed.',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  if (name === 'fs.explore_directory') {
    const dir = resolveSmartPath(String(args.dirPath || '.'))
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const results = await Promise.all(
      entries.slice(0, 150).map(async (entry) => {
        const full = path.join(dir, entry.name)
        try {
          const st = await fs.stat(full)
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'folder' : 'file',
            sizeKB: +(st.size / 1024).toFixed(1),
            modified: st.mtime.toISOString()
          }
        } catch {
          return { name: entry.name, type: entry.isDirectory() ? 'folder' : 'file' }
        }
      })
    )
    return { content: [{ type: 'text', text: JSON.stringify({ directory: dir, items: results }, null, 2) }] }
  }

  if (name === 'fs.search_files') {
    const root = resolveSmartPath(String(args.rootDir || '.'))
    const q = String(args.query || '').toLowerCase()
    const limit = typeof args.maxResults === 'number' ? args.maxResults : 40
    const matches: string[] = []

    async function walk(currentDir: string, depth: number) {
      if (depth > 5 || matches.length >= limit) return
      try {
        const list = await fs.readdir(currentDir, { withFileTypes: true })
        for (const item of list) {
          if (matches.length >= limit) break
          if (item.name === 'node_modules' || item.name === '.git') continue
          const full = path.join(currentDir, item.name)
          if (item.name.toLowerCase().includes(q)) {
            matches.push(full)
          }
          if (item.isDirectory()) {
            await walk(full, depth + 1)
          }
        }
      } catch {
        // Skip inaccessible folders
      }
    }

    await walk(root, 0)
    return { content: [{ type: 'text', text: JSON.stringify({ root, matches }, null, 2) }] }
  }

  if (name === 'fs.read_write_edit') {
    const action = String(args.action)
    const target = resolveSmartPath(String(args.targetPath))
    assertSafePath(target)

    if (action === 'read') {
      const data = await fs.readFile(target, 'utf-8')
      return { content: [{ type: 'text', text: data.slice(0, 25000) }] }
    }
    if (action === 'write') {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, String(args.content || ''), 'utf-8')
      return { content: [{ type: 'text', text: `Wrote file: ${target}` }] }
    }
    if (action === 'append') {
      await fs.appendFile(target, String(args.content || ''), 'utf-8')
      return { content: [{ type: 'text', text: `Appended to file: ${target}` }] }
    }
    if (action === 'delete') {
      await fs.rm(target, { recursive: true, force: true })
      return { content: [{ type: 'text', text: `Deleted: ${target}` }] }
    }
    if (action === 'move') {
      const dest = resolveSmartPath(String(args.destinationPath))
      assertSafePath(dest)
      await fs.rename(target, dest)
      return { content: [{ type: 'text', text: `Moved ${target} -> ${dest}` }] }
    }
  }

  if (name === 'fs.clean_temp') {
    const tempDir = os.tmpdir()
    const items = await fs.readdir(tempDir)
    let deleted = 0
    let bytesFreed = 0

    for (const item of items) {
      const full = path.join(tempDir, item)
      try {
        const st = await fs.lstat(full)
        const sz = st.isDirectory() ? 0 : st.size
        await fs.rm(full, { recursive: true, force: true })
        deleted++
        bytesFreed += sz
      } catch {
        // Skip locked active files
      }
    }
    const mb = (bytesFreed / (1024 * 1024)).toFixed(2)
    return {
      content: [{ type: 'text', text: `Cleaned %TEMP%: removed ${deleted} items (${mb} MB freed).` }]
    }
  }

  throw new Error(`Unknown filesystem tool: ${name}`)
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('[Flame FS MCP Error]:', err)
  process.exit(1)
})
