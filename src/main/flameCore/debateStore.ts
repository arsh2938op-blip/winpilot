import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

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

export async function getDebateRounds(): Promise<number> {
  const secrets = await readSecrets()
  const rounds = Number(secrets.debateRounds)
  return Number.isFinite(rounds) ? Math.max(2, Math.min(40, Math.floor(rounds))) : 16
}

export async function setDebateRounds(rounds: number): Promise<void> {
  const secrets = await readSecrets()
  secrets.debateRounds = Math.max(2, Math.min(40, Math.floor(rounds)))
  await writeSecrets(secrets)
}
