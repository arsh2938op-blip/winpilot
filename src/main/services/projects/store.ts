import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { ImportedProject, ProjectPermissions } from '@shared/types'

function storePath(): string {
  return path.join(app.getPath('userData'), 'projects.json')
}

export async function listImportedProjects(): Promise<ImportedProject[]> {
  try {
    return JSON.parse(await fs.readFile(storePath(), 'utf8'))
  } catch {
    return []
  }
}

async function save(list: ImportedProject[]): Promise<void> {
  await fs.writeFile(storePath(), JSON.stringify(list, null, 2), 'utf8')
}

export async function addImportedProject(projectPath: string): Promise<ImportedProject[]> {
  const list = await listImportedProjects()
  if (list.some((p) => p.path === projectPath)) return list

  const next = [
    ...list,
    {
      id: crypto.randomUUID(),
      name: path.basename(projectPath),
      path: projectPath,
      permissions: { read: true, write: false, execute: false },
      addedAt: Date.now()
    }
  ]

  await save(next)
  return next
}

export async function removeImportedProject(id: string): Promise<ImportedProject[]> {
  const next = (await listImportedProjects()).filter((p) => p.id !== id)
  await save(next)
  return next
}

export async function setProjectPermissions(id: string, permissions: ProjectPermissions): Promise<ImportedProject[]> {
  const list = await listImportedProjects()
  const next = list.map((p) => (p.id === id ? { ...p, permissions } : p))
  await save(next)
  return next
}
