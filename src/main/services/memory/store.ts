import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import type { MemoryEntry, PlanEntry } from '@shared/types'

/**
 * Shared storage location — deliberately NOT Electron's sandboxed
 * userData folder. Lives at ~/.flameagi so the MindCraft bot (a
 * separate Node process/project) can read and write the exact same
 * files directly, whether or not this desktop app is running.
 */
const FLAME_DIR = path.join(os.homedir(), '.flameagi')
const MEMORY_PATH = path.join(FLAME_DIR, 'memory.json')
const PLANS_PATH = path.join(FLAME_DIR, 'plans.json')

const MAX_ENTRIES = 200
const MAX_PLANS = 100

async function readJson<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T[]
  } catch {
    return []
  }
}

async function writeJson<T>(filePath: string, data: T[]): Promise<void> {
  await fs.mkdir(FLAME_DIR, { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

// ---- General facts ----

export async function listMemory(): Promise<MemoryEntry[]> {
  return readJson<MemoryEntry>(MEMORY_PATH)
}

export async function addMemory(text: string): Promise<MemoryEntry[]> {
  const trimmed = text.trim()
  if (!trimmed) return listMemory()
  const entries = await listMemory()
  const next = [{ id: crypto.randomUUID(), text: trimmed, createdAt: Date.now() }, ...entries].slice(
    0,
    MAX_ENTRIES
  )
  await writeJson(MEMORY_PATH, next)
  return next
}

export async function removeMemory(id: string): Promise<MemoryEntry[]> {
  const entries = (await listMemory()).filter((e) => e.id !== id)
  await writeJson(MEMORY_PATH, entries)
  return entries
}

export async function getMemoryContext(limit = 15): Promise<string> {
  const entries = await listMemory()
  if (entries.length === 0) return ''
  return entries
    .slice(0, limit)
    .map((e) => `- ${e.text}`)
    .join('\n')
}

// ---- Plans (separate category — e.g. "next time we'll go to the trial
// chamber" — distinct from general facts, per Flame's memory categories) ----

export async function listPlans(): Promise<PlanEntry[]> {
  return readJson<PlanEntry>(PLANS_PATH)
}

export async function addPlan(text: string, context = 'general'): Promise<PlanEntry[]> {
  const trimmed = text.trim()
  if (!trimmed) return listPlans()
  const plans = await listPlans()
  const next = [
    { id: crypto.randomUUID(), text: trimmed, status: 'pending' as const, context, createdAt: Date.now() },
    ...plans
  ].slice(0, MAX_PLANS)
  await writeJson(PLANS_PATH, next)
  return next
}

export async function removePlan(id: string): Promise<PlanEntry[]> {
  const plans = (await listPlans()).filter((p) => p.id !== id)
  await writeJson(PLANS_PATH, plans)
  return plans
}

export async function getPlansContext(limit = 10): Promise<string> {
  const plans = await listPlans()
  if (plans.length === 0) return ''
  return plans
    .slice(0, limit)
    .map((p) => `- [${p.status}] ${p.text} (${p.context})`)
    .join('\n')
}
