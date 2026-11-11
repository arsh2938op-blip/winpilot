import fs from 'fs'
import path from 'path'
import type { Combo } from '@shared/types'
import { parseMacroSteps } from './parser'
import { getFlameDir } from '../../utils/flamePaths'

const DEFAULT_COMBOS: Combo[] = [
  {
    id: 'combo-game-mode',
    name: 'Game Mode',
    description: 'Launches gaming tools and shuts down FlameAGI to free resources.',
    toDo: 'Open sk launcher, launch minecraft, close yourself',
    steps: parseMacroSteps('Open sk launcher, launch minecraft, close yourself'),
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'combo-dev-mode',
    name: 'Coding Session',
    description: 'Launches VS Code and focuses the development window.',
    toDo: 'Open Visual Studio Code, focus Visual Studio Code',
    steps: parseMacroSteps('Open Visual Studio Code, focus Visual Studio Code'),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

let combosCache: Combo[] | null = null

function getStorePath(): string {
  return path.join(getFlameDir(), 'combos.json')
}

export async function loadCombos(): Promise<Combo[]> {
  if (combosCache) return combosCache

  const storeFile = getStorePath()
  try {
    if (fs.existsSync(storeFile)) {
      const raw = fs.readFileSync(storeFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        combosCache = parsed
        return combosCache
      }
    }
  } catch (err) {
    console.error('[Combos] Error reading combos store:', err)
  }

  // Seed with default combos
  combosCache = [...DEFAULT_COMBOS]
  await persistCombos(combosCache)
  return combosCache
}

async function persistCombos(combos: Combo[]): Promise<void> {
  const storeFile = getStorePath()
  try {
    const dir = path.dirname(storeFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(storeFile, JSON.stringify(combos, null, 2), 'utf8')
  } catch (err) {
    console.error('[Combos] Failed to persist combos:', err)
  }
}

export async function getCombo(idOrName: string): Promise<Combo | undefined> {
  const combos = await loadCombos()
  const lower = idOrName.toLowerCase().trim()
  return combos.find((c) => c.id === idOrName || c.name.toLowerCase() === lower)
}

export async function saveCombo(payload: {
  id?: string
  name: string
  description?: string
  toDo?: string
  steps?: Combo['steps']
}): Promise<Combo> {
  const combos = await loadCombos()
  const now = Date.now()

  // Generate steps from toDo if steps are not explicitly provided
  const steps = payload.steps && payload.steps.length > 0
    ? payload.steps
    : parseMacroSteps(payload.toDo || '')

  let saved: Combo
  if (payload.id) {
    const existingIndex = combos.findIndex((c) => c.id === payload.id)
    if (existingIndex !== -1) {
      saved = {
        ...combos[existingIndex],
        name: payload.name,
        description: payload.description,
        toDo: payload.toDo,
        steps,
        updatedAt: now
      }
      combos[existingIndex] = saved
    } else {
      saved = {
        id: payload.id,
        name: payload.name,
        description: payload.description,
        toDo: payload.toDo,
        steps,
        createdAt: now,
        updatedAt: now
      }
      combos.push(saved)
    }
  } else {
    const existingByNameIndex = combos.findIndex((c) => c.name.toLowerCase() === payload.name.toLowerCase().trim())
    if (existingByNameIndex !== -1) {
      saved = {
        ...combos[existingByNameIndex],
        name: payload.name,
        description: payload.description ?? combos[existingByNameIndex].description,
        toDo: payload.toDo,
        steps,
        updatedAt: now
      }
      combos[existingByNameIndex] = saved
    } else {
      saved = {
        id: `combo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: payload.name,
        description: payload.description,
        toDo: payload.toDo,
        steps,
        createdAt: now,
        updatedAt: now
      }
      combos.push(saved)
    }
  }

  combosCache = combos
  await persistCombos(combos)
  return saved
}

export async function deleteCombo(id: string): Promise<boolean> {
  const combos = await loadCombos()
  const filtered = combos.filter((c) => c.id !== id)
  if (filtered.length !== combos.length) {
    combosCache = filtered
    await persistCombos(filtered)
    return true
  }
  return false
}

export async function updateLastRun(id: string): Promise<void> {
  const combos = await loadCombos()
  const target = combos.find((c) => c.id === id)
  if (target) {
    target.lastRunAt = Date.now()
    await persistCombos(combos)
  }
}

