import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import type { FlamePluginMeta, FlamePluginCategory } from '@shared/types'
import { setPluginCapabilityState } from './capabilities'

export interface PluginDefinition {
  id: string
  name: string
  description: string
  category: FlamePluginCategory
  capabilities: string[]
  links?: { label: string; to: string }[]
  subSections?: { name: string; description?: string; status?: string; to: string }[]
  defaultEnabled?: boolean
}

export const KNOWN_PLUGINS: PluginDefinition[] = [
  {
    id: 'windows',
    name: 'Windows Control',
    description: 'Winget package manager, installation safety, application launching, and automation combos.',
    category: 'system',
    capabilities: [
      'windows.launch_app',
      'windows.focus_app',
      'windows.install_app',
      'windows.update_app',
      'windows.uninstall_app',
      'windows.run_command'
    ],
    links: [
      { label: 'Winget', to: '/plugins/windows/winget' },
      { label: 'Combos', to: '/plugins/windows/combos' }
    ],
    defaultEnabled: true
  },
  {
    id: 'osint',
    name: 'OSINT Intelligence Suite',
    description: 'Deep domain reconnaissance, SPF/DMARC email security, TLS certificates, IP RDAP, phone & public identity intelligence.',
    category: 'analysis',
    capabilities: ['osint.domain', 'osint.ip', 'osint.phone', 'osint.identity'],
    links: [{ label: 'Chat Quick-Actions', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'rea',
    name: 'Reverse Engineering Assistant (REA)',
    description: 'Binary inspection, Electron asar exploration, workspace vulnerability audit, folder synthesis, and evidence-driven coding.',
    category: 'developer',
    capabilities: [
      'rea.inspect_file',
      'rea.inspect_asar',
      'rea.audit_workspace',
      'rea.generate_folder',
      'rea.export_zip',
      'rea.code_on_evidence'
    ],
    links: [{ label: 'REA Tools in Chat', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'chess',
    name: 'Chess Director & 2-Player Arena',
    description: 'Multi-API AI chess arena, Human vs AI, live director telemetry, and 10-tier move classification.',
    category: 'tools',
    capabilities: [
      'chess.get_state',
      'chess.new_game',
      'chess.make_move',
      'chess.direct_ai_turn',
      'chess.run_arena_match',
      'chess.get_review'
    ],
    links: [
      { label: 'Open in Games Hub', to: '/games?tab=chess' },
      { label: 'Chess Arena', to: '/plugins/chess' }
    ],
    defaultEnabled: true
  },
  {
    id: 'minecraft',
    name: 'Minecraft Autonomous Agent Dashboard',
    description: 'Autonomous MindCraft bot controller, server management, real-time terminal logs, and model presets.',
    category: 'tools',
    capabilities: ['minecraft.start', 'minecraft.stop', 'minecraft.status', 'minecraft.config'],
    links: [
      { label: 'Open in Games Hub', to: '/games?tab=minecraft' },
      { label: 'Minecraft Dashboard', to: '/plugins/minecraft' }
    ],
    defaultEnabled: true
  },
  {
    id: 'image',
    name: 'Gemini Image Generation',
    description: 'Google Imagen-3 high-fidelity image synthesis with key rotation, inline chat rendering, and asset storage.',
    category: 'ai',
    capabilities: ['image.generate'],
    links: [{ label: 'Generate in Chat', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp AI & Moderation Companion',
    description: 'WhatsApp Baileys companion, shared cross-platform brain, spam/abuse moderation, active media archiver, and group management.',
    category: 'communication',
    capabilities: [
      'whatsapp.send_message',
      'whatsapp.get_archived_media',
      'whatsapp.sync_brain_memory'
    ],
    links: [{ label: 'WhatsApp in Chat', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'dueMessages',
    name: 'Due Messages / Deferred Tasks',
    description: 'Context-aware deferred reminders and scheduled task tracking stored in .flame/state.',
    category: 'tools',
    capabilities: ['due.list', 'due.add', 'due.complete'],
    links: [{ label: 'View Tasks', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'zapier',
    name: 'Zapier MCP Tools',
    description: 'Bridge to external apps and automation workflows via natural language chat commands.',
    category: 'tools',
    capabilities: ['zapier.execute'],
    links: [{ label: 'Manage in Chat', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'memory',
    name: 'Persistent Long-Term Memory',
    description: 'Recall user facts, system preferences, and project guidelines across Flame sessions.',
    category: 'ai',
    capabilities: ['memory.remember_fact', 'memory.remember_plan'],
    defaultEnabled: true
  },
  {
    id: 'files',
    name: 'Filesystem Tools',
    description: 'Staged file reading, directory exploration, and PDF extraction with permission confirmation.',
    category: 'tools',
    capabilities: ['files.list_dir', 'files.read_text', 'files.read_pdf', 'files.inspect_zip', 'files.extract_zip', 'files.search'],
    defaultEnabled: true
  },
  {
    id: 'coder',
    name: 'Flame Coder Engine',
    description: 'Autonomous multi-file code editing, git checkpoints, and syntax repair turns.',
    category: 'developer',
    capabilities: ['coder.read_file', 'coder.write_file', 'coder.edit_file', 'coder.run_command', 'coder.checkpoint'],
    defaultEnabled: true
  },
  {
    id: 'computer',
    name: 'Native Computer Use & Vision',
    description: 'Autonomous Windows mouse, keyboard, and screen capture MCP server with emergency top-left fail-safe.',
    category: 'tools',
    capabilities: [
      'computer.capture_screen',
      'computer.pointer_action',
      'computer.keyboard_input',
      'computer.window_control'
    ],
    links: [{ label: 'Screen Capture in Chat', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'browser',
    name: 'Browser & Web Controller',
    description: 'Native MCP tool server for web navigation, Playwright browser automation, and Google Workspace integration.',
    category: 'tools',
    capabilities: ['browser.open_url', 'browser.automate_page', 'browser.google_workspace'],
    links: [{ label: 'Browse in Chat', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'filesystem',
    name: 'Deep File System Explorer',
    description: 'Native MCP tool server for deep directory exploration, regex search, multi-path reads/writes, and safe temp cleaning.',
    category: 'tools',
    capabilities: ['fs.explore_directory', 'fs.search_files', 'fs.read_write_edit', 'fs.clean_temp'],
    links: [{ label: 'Files in Chat', to: '/' }],
    defaultEnabled: true
  },
  {
    id: 'osControl',
    name: 'Desktop & OS Controller',
    description: 'Native MCP tool server for PowerShell execution, process management, WhatsApp automation, and clipboard operations.',
    category: 'system',
    capabilities: ['os.run_powershell', 'os.manage_processes', 'communication.whatsapp', 'os.clipboard'],
    links: [{ label: 'OS Controls in Chat', to: '/' }],
    defaultEnabled: true
  }
]

let pluginStateMap: Record<string, boolean> | null = null

function getPluginsStatePath(): string {
  try {
    const cwd = process.cwd()
    const flameDir = path.join(cwd, '.flame', 'state')
    if (fs.existsSync(flameDir)) {
      return path.join(flameDir, 'plugins.json')
    }
    const dotFlame = path.join(cwd, '.flame')
    if (fs.existsSync(dotFlame)) {
      const stateDir = path.join(dotFlame, 'state')
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true })
      }
      return path.join(stateDir, 'plugins.json')
    }
    const rootFlame = path.resolve(cwd, '..', '.flame', 'state')
    if (fs.existsSync(rootFlame)) {
      return path.join(rootFlame, 'plugins.json')
    }
    const userData = app.getPath('userData')
    const stateDir = path.join(userData, 'state')
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true })
    }
    return path.join(stateDir, 'plugins.json')
  } catch {
    return path.join(process.cwd(), '.flame', 'state', 'plugins.json')
  }
}

function broadcastPluginState(plugins: FlamePluginMeta[]): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.plugins.onStateChange, plugins)
      }
    }
  } catch {
    // ignore
  }
}

function loadStateFromDisk(): Record<string, boolean> {
  if (pluginStateMap) return pluginStateMap

  const filePath = getPluginsStatePath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        pluginStateMap = parsed
        return pluginStateMap!
      }
    }
  } catch (err) {
    console.error('[PluginManager] Failed to load plugins.json from disk:', err)
  }

  const defaults: Record<string, boolean> = {}
  for (const p of KNOWN_PLUGINS) {
    defaults[p.id] = p.defaultEnabled ?? true
  }
  pluginStateMap = defaults
  return pluginStateMap
}

function saveStateToDisk(states: Record<string, boolean>): void {
  const filePath = getPluginsStatePath()
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(states, null, 2), 'utf8')
    pluginStateMap = states
  } catch (err) {
    console.error('[PluginManager] Failed to save plugins.json to disk:', err)
  }
}

export function initPluginManager(): void {
  const states = loadStateFromDisk()
  for (const plugin of KNOWN_PLUGINS) {
    const isEnabled = states[plugin.id] ?? (plugin.defaultEnabled ?? true)
    setPluginCapabilityState(plugin.id, isEnabled)
  }
}

export function isPluginActive(pluginId: string): boolean {
  const states = loadStateFromDisk()
  return states[pluginId] ?? true
}

export async function listPlugins(): Promise<FlamePluginMeta[]> {
  const states = loadStateFromDisk()
  return KNOWN_PLUGINS.map((p) => {
    const enabled = states[p.id] ?? (p.defaultEnabled ?? true)
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      enabled,
      capabilities: p.capabilities,
      links: p.links,
      subSections: p.subSections
    }
  })
}

export async function togglePlugin(
  pluginId: string,
  targetState?: boolean
): Promise<{ success: boolean; plugin: FlamePluginMeta }> {
  const states = loadStateFromDisk()
  const pluginDef = KNOWN_PLUGINS.find((p) => p.id === pluginId)
  if (!pluginDef) {
    throw new Error(`Plugin "${pluginId}" not found in registry.`)
  }

  const current = states[pluginId] ?? (pluginDef.defaultEnabled ?? true)
  const newState = targetState !== undefined ? targetState : !current

  states[pluginId] = newState
  saveStateToDisk(states)

  // Enforce capability un-registration or restoration
  setPluginCapabilityState(pluginId, newState)

  // Dynamic lifecycle hooks for active services
  if (pluginId === 'whatsapp') {
    try {
      const { whatsappEngine } = await import('../services/whatsapp')
      if (newState) {
        void whatsappEngine.start().catch((err) => console.error('[PluginManager] WhatsApp start error:', err))
      } else {
        void whatsappEngine.stop().catch((err) => console.error('[PluginManager] WhatsApp stop error:', err))
      }
    } catch {
      // ignore
    }
  }

  const allPlugins = await listPlugins()
  broadcastPluginState(allPlugins)

  const updatedMeta = allPlugins.find((p) => p.id === pluginId)!
  return { success: true, plugin: updatedMeta }
}

