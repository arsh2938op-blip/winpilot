import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { FlameDifficulty } from '@shared/types'
export type { FlameDifficulty } from '@shared/types'

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json')
}
async function readSecrets(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(secretsPath(), 'utf8'))
  } catch {
    return {}
  }
}
async function writeSecrets(data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(secretsPath(), JSON.stringify(data, null, 2), 'utf8')
}

export async function getDifficulty(): Promise<FlameDifficulty> {
  const secrets = await readSecrets()
  const difficulty = secrets.flameDifficulty
  return difficulty === 'easy' || difficulty === 'hard' || difficulty === 'expert' ? difficulty : 'normal'
}

export async function setDifficulty(difficulty: FlameDifficulty): Promise<void> {
  const secrets = await readSecrets()
  secrets.flameDifficulty = difficulty
  await writeSecrets(secrets)
}

export interface DifficultyProfile {
  memoryScale: number
  numPredictScale: number
  verify: boolean
}

export const DIFFICULTY_PROFILES: Record<FlameDifficulty, DifficultyProfile> = {
  easy: { memoryScale: 0.5, numPredictScale: 0.75, verify: false },
  normal: { memoryScale: 1, numPredictScale: 1, verify: false },
  hard: { memoryScale: 1.5, numPredictScale: 1.3, verify: true },
  expert: { memoryScale: 2, numPredictScale: 1.6, verify: true }
}
