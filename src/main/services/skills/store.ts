import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

export interface SkillRecord {
  id: string
  name: string
  description: string
  version: string
  sourceProject: string
  permissions: string[]
  status: 'unvalidated' | 'validated' | 'failed'
  createdAt: number
  lastUpdated: number
  testStatus: 'not_run' | 'passed' | 'failed'
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'skills.json')
}

export async function listSkills(): Promise<SkillRecord[]> {
  try { return JSON.parse(await fs.readFile(storePath(), 'utf8')) } catch { return [] }
}

export async function registerSkill(skill: Omit<SkillRecord, 'id' | 'createdAt' | 'lastUpdated'>): Promise<SkillRecord[]> {
  const list = await listSkills()
  const now = Date.now()
  const next = [...list, { ...skill, id: crypto.randomUUID(), createdAt: now, lastUpdated: now }]
  await fs.writeFile(storePath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
