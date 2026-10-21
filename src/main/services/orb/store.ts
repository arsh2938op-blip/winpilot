import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { OrbAccent } from '@shared/types'

/**
 * Persisted floating-orb preferences.
 *
 * Kept as its own file (rather than inside secrets.json) because it holds
 * no credentials — it's just window placement, the always-on-top choice,
 * the companion colour and the always-listening preference, and both the
 * main window and the orb window need to agree on them across restarts.
 */

function asAccent(value: unknown): OrbAccent {
  return value === 'black' ? 'black' : 'blue'
}

interface OrbPrefs {
  x?: number
  y?: number
  alwaysOnTop: boolean
  enabled: boolean
  accent: OrbAccent
  alwaysListening: boolean
}

const DEFAULT_PREFS: OrbPrefs = {
  alwaysOnTop: true,
  enabled: false,
  accent: 'blue',
  alwaysListening: false
}

let cached: OrbPrefs | null = null

function prefsPath(): string {
  return path.join(app.getPath('userData'), 'orb-prefs.json')
}

export function getOrbPrefs(): OrbPrefs {
  return cached ?? DEFAULT_PREFS
}

export async function loadOrbPrefs(): Promise<OrbPrefs> {
  if (cached) return cached
  try {
    const parsed = JSON.parse(await fs.readFile(prefsPath(), 'utf8')) as Partial<OrbPrefs>
    cached = {
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      alwaysOnTop: parsed.alwaysOnTop !== false,
      enabled: parsed.enabled === true,
      accent: asAccent(parsed.accent),
      alwaysListening: parsed.alwaysListening === true
    }
  } catch {
    cached = { ...DEFAULT_PREFS }
  }
  return cached
}

export async function updateOrbPrefs(patch: Partial<OrbPrefs>): Promise<OrbPrefs> {
  const current = await loadOrbPrefs()
  const next: OrbPrefs = { ...current, ...patch }
  cached = next
  try {
    await fs.writeFile(prefsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* non-fatal — a failed write only costs us the remembered position */
  }
  return next
}