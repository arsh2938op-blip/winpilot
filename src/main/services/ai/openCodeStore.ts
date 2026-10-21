import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json')
}
async function readSecrets(): Promise<Record<string, unknown>> {
  try { return JSON.parse(await fs.readFile(secretsPath(), 'utf8')) } catch { return {} }
}
async function writeSecrets(data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(secretsPath(), JSON.stringify(data, null, 2), 'utf8')
}

const DEFAULT_COMMAND = `opencode run '{task}'`

export async function getOpenCodeCommand(): Promise<string> {
  const secrets = await readSecrets()
  return (secrets.openCodeCommand as string) || DEFAULT_COMMAND
}

export async function setOpenCodeCommand(cmd: string): Promise<void> {
  const secrets = await readSecrets()
  secrets.openCodeCommand = cmd
  await writeSecrets(secrets)
}

export async function isOpenCodeEnabled(): Promise<boolean> {
  const secrets = await readSecrets()
  return !!secrets.openCodeEnabled
}

export async function setOpenCodeEnabled(enabled: boolean): Promise<void> {
  const secrets = await readSecrets()
  secrets.openCodeEnabled = enabled
  await writeSecrets(secrets)
}
