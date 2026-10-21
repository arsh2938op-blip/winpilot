/**
 * Flame Core's capability registry (§7 of the Flame doc: "Plugin
 * Interface"). Any plugin — Windows, Zapier, and later GitHub/
 * Minecraft/Robot — registers what it can do here. Flame Core (see
 * services/ai/index.ts) only ever knows "look up an id, call run()" —
 * it never needs to change when a new plugin is added.
 */
export interface CapabilityResult {
  success: boolean
  message: string
}

export interface FlameCapability {
  id: string
  label: string
  description: string
  run: (args: Record<string, unknown>) => Promise<CapabilityResult>
}

const registry = new Map<string, FlameCapability>()

export function registerCapability(capability: FlameCapability): void {
  registry.set(capability.id, capability)
}

export function getCapability(id: string): FlameCapability | undefined {
  return registry.get(id)
}

export function listCapabilities(): FlameCapability[] {
  return Array.from(registry.values())
}
