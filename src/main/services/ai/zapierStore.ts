import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Stores the Zapier MCP server URL (which includes an auth token as a
 * query parameter) the same way as the Google API key — in the app's own
 * user data folder, never in source. Shares the same secrets.json file as
 * googleKeyStore.ts; each store only ever touches its own key, so neither
 * overwrites the other's data.
 */
function secretsPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json')
}

async function readSecrets(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(secretsPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeSecrets(data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(secretsPath(), JSON.stringify(data, null, 2), 'utf8')
}

export async function setZapierMcpUrl(url: string): Promise<void> {
  const secrets = await readSecrets()
  secrets.zapierMcpUrl = url.trim()
  await writeSecrets(secrets)
}

export async function getZapierMcpUrl(): Promise<string | null> {
  const secrets = await readSecrets()
  return (secrets.zapierMcpUrl as string) || null
}

export async function hasZapierMcpUrl(): Promise<boolean> {
  return !!(await getZapierMcpUrl())
}