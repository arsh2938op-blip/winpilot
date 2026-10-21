import { registerCapability } from './capabilities'
import { addMemory, addPlan } from '../services/memory/store'

export function registerMemoryCapabilities(): void {
  registerCapability({
    id: 'memory.remember',
    label: 'Remember a fact',
    description: 'Saves a structured fact about the user for future conversations.',
    run: async (args) => {
      const fact = (args.fact as string | undefined)?.trim()
      if (!fact) return { success: false, message: 'What should I remember?' }
      await addMemory(fact)
      return { success: true, message: "Got it — I'll remember that." }
    }
  })

  registerCapability({
    id: 'memory.rememberPlan',
    label: 'Remember a plan',
    description: 'Saves a plan (e.g. a Minecraft plan) — recallable from any Flame environment.',
    run: async (args) => {
      const plan = (args.plan as string | undefined)?.trim()
      if (!plan) return { success: false, message: 'What plan should I remember?' }
      await addPlan(plan, 'minecraft')
      return { success: true, message: "Got it — I'll remember the plan." }
    }
  })
}
