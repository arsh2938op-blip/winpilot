/**
 * Flame Core's capability registry (§7 of the Flame doc: "Plugin
 * Interface"). Any plugin — Windows, Zapier, OSINT, REA, Image, etc. —
 * registers what it can do here. Flame Core (see services/ai/index.ts)
 * only ever knows "look up an id, call run()" — it never needs to change
 * when a new plugin is added.
 */
export interface CapabilityResult {
  success: boolean
  message: string
  data?: unknown
}

export interface FlameCapability {
  id: string
  label?: string
  name?: string
  description: string
  parameters?: Record<string, unknown>
  pluginId?: string
  enabled?: boolean
  run: (args: Record<string, unknown>) => Promise<CapabilityResult>
  execute?: (args: Record<string, unknown>) => Promise<CapabilityResult>
}

const registry = new Map<string, FlameCapability>()
const disabledRegistry = new Map<string, FlameCapability>()
const capabilityToPlugin = new Map<string, string>()
const disabledPlugins = new Set<string>()

function inferPluginId(capabilityId: string): string {
  const prefix = capabilityId.split('.')[0]?.toLowerCase()
  switch (prefix) {
    case 'osint':
      return 'osint'
    case 'rea':
      return 'rea'
    case 'chess':
      return 'chess'
    case 'image':
      return 'image'
    case 'due':
      return 'dueMessages'
    case 'windows':
    case 'winget':
      return 'windows'
    case 'files':
      return 'files'
    case 'fs':
      return 'filesystem'
    case 'os':
    case 'communication':
      return 'osControl'
    case 'computer':
      return 'computer'
    case 'browser':
      return 'browser'
    case 'whatsapp':
      return 'whatsapp'
    case 'coder':
      return 'coder'
    case 'zapier':
      return 'zapier'
    case 'memory':
      return 'memory'
    case 'dev_tools':
      return 'devTools'
    case 'ai_network':
      return 'aiNetwork'
    case 'rsi':
      return 'rsi'
    case 'search':
      return 'search'
    default:
      return prefix || 'unknown'
  }
}

export function registerCapability(
  capability:
    | FlameCapability
    | {
        name: string
        description: string
        parameters?: Record<string, unknown>
        execute: (args: Record<string, unknown>) => Promise<CapabilityResult>
        id?: string
        label?: string
        pluginId?: string
        run?: (args: Record<string, unknown>) => Promise<CapabilityResult>
      },
  overridePluginId?: string
): void {
  const id = (capability as any).id || (capability as any).name
  const runFn = (capability as any).run || (capability as any).execute
  const pluginId = overridePluginId || (capability as any).pluginId || inferPluginId(id)

  const normalized: FlameCapability = {
    id,
    name: id,
    label: (capability as any).label || (capability as any).name || id,
    description: capability.description,
    parameters: capability.parameters,
    pluginId,
    enabled: !disabledPlugins.has(pluginId),
    run: runFn,
    execute: runFn
  }

  capabilityToPlugin.set(id, pluginId)

  if (disabledPlugins.has(pluginId)) {
    disabledRegistry.set(id, normalized)
    registry.delete(id)
  } else {
    registry.set(id, normalized)
    disabledRegistry.delete(id)
  }
}

export function unregisterCapability(id: string): boolean {
  const wasInActive = registry.delete(id)
  const wasInDisabled = disabledRegistry.delete(id)
  capabilityToPlugin.delete(id)
  return wasInActive || wasInDisabled
}

export function unregisterPluginCapabilities(pluginId: string): void {
  disabledPlugins.add(pluginId)
  for (const [id, cap] of registry.entries()) {
    const pId = capabilityToPlugin.get(id) || cap.pluginId
    if (pId === pluginId) {
      cap.enabled = false
      disabledRegistry.set(id, cap)
      registry.delete(id)
    }
  }
}

export function restorePluginCapabilities(pluginId: string): void {
  disabledPlugins.delete(pluginId)
  for (const [id, cap] of disabledRegistry.entries()) {
    const pId = capabilityToPlugin.get(id) || cap.pluginId
    if (pId === pluginId) {
      cap.enabled = true
      registry.set(id, cap)
      disabledRegistry.delete(id)
    }
  }
}

export function setPluginCapabilityState(pluginId: string, enabled: boolean): void {
  if (enabled) {
    restorePluginCapabilities(pluginId)
  } else {
    unregisterPluginCapabilities(pluginId)
  }
}

export function isPluginDisabled(pluginId: string): boolean {
  return disabledPlugins.has(pluginId)
}

export function getCapability(id: string): FlameCapability | undefined {
  return registry.get(id)
}

export function getDisabledReason(id: string): string | null {
  if (disabledRegistry.has(id)) {
    const pluginId = capabilityToPlugin.get(id) || 'unknown'
    return `Plugin "${pluginId}" is currently disabled`
  }
  const pluginId = capabilityToPlugin.get(id) || inferPluginId(id)
  if (disabledPlugins.has(pluginId)) {
    return `Plugin "${pluginId}" is currently disabled`
  }
  return null
}

export function getPluginForCapability(id: string): string | undefined {
  return capabilityToPlugin.get(id) || inferPluginId(id)
}

export function listCapabilities(includeDisabled = false): FlameCapability[] {
  if (!includeDisabled) {
    return Array.from(registry.values())
  }
  return [...registry.values(), ...disabledRegistry.values()]
}
