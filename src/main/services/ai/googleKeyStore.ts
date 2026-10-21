import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

interface SecretsFile {
  googleApiKey?: string
  googleApiKeys?: string[]
  failedGoogleApiKeys?: string[]
  geminiModels?: string[]
  geminiActiveModel?: string | null
  geminiVisionModel?: string | null
  visionEnabled?: boolean
}

/**
 * Stores Google API keys in a local JSON file in the app's own user data
 * folder (e.g. %APPDATA%\winpilot on Windows) — outside the project folder,
 * so it's never at risk of ending up in a zip, a git commit, or anywhere
 * you'd share. Note: this file is plain text, not encrypted — fine for a
 * single-user local machine, but don't copy it anywhere shared.
 */
function secretsPath(): string {
  return path.join(app.getPath('userData'), 'secrets.json')
}

async function readSecrets(): Promise<SecretsFile> {
  try {
    const raw = await fs.readFile(secretsPath(), 'utf8')
    return JSON.parse(raw) as SecretsFile
  } catch {
    return {}
  }
}

async function writeSecrets(data: SecretsFile): Promise<void> {
  await fs.writeFile(secretsPath(), JSON.stringify(data, null, 2), 'utf8')
}

function normalizeKeyList(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[\r\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  )]
}

export async function setGoogleApiKeys(raw: string): Promise<void> {
  const keys = normalizeKeyList(raw)
  const secrets = await readSecrets()
  secrets.googleApiKeys = keys
  secrets.googleApiKey = keys[0] ?? ''
  await writeSecrets(secrets)
}

export async function setGoogleApiKey(key: string): Promise<void> {
  await setGoogleApiKeys(key)
}

export async function getAllGoogleApiKeys(): Promise<string[]> {
  const secrets = await readSecrets()
  const keys = Array.isArray(secrets.googleApiKeys) ? secrets.googleApiKeys : []
  return keys.filter(Boolean)
}

export async function getGoogleApiKey(): Promise<string | null> {
  const keys = await getAllGoogleApiKeys()
  return keys[0] || null
}

export async function getNextGoogleApiKey(): Promise<string | null> {
  const secrets = await readSecrets()
  const keys = (Array.isArray(secrets.googleApiKeys) ? secrets.googleApiKeys : []).filter(Boolean)
  const failed = new Set(Array.isArray(secrets.failedGoogleApiKeys) ? secrets.failedGoogleApiKeys : [])
  const next = keys.find((key) => !failed.has(key))
  return next ?? keys[0] ?? null
}

export async function markKeyFailed(key: string): Promise<void> {
  const secrets = await readSecrets()
  const failed = new Set(Array.isArray(secrets.failedGoogleApiKeys) ? secrets.failedGoogleApiKeys : [])
  const trimmed = key.trim()
  if (trimmed) {
    failed.add(trimmed)
  }
  secrets.failedGoogleApiKeys = [...failed]
  await writeSecrets(secrets)
}

export async function keyCount(): Promise<number> {
  return (await getAllGoogleApiKeys()).length
}

export async function hasGoogleApiKey(): Promise<boolean> {
  return (await keyCount()) > 0
}

export async function listConfiguredGeminiModels(): Promise<string[]> {
  const secrets = await readSecrets()
  return (secrets.geminiModels as string[]) || []
}

export async function addGeminiModel(modelId: string): Promise<string[]> {
  const trimmed = modelId.trim()
  if (!trimmed) return listConfiguredGeminiModels()
  const secrets = await readSecrets()
  const existing = (secrets.geminiModels as string[]) || []
  const next = existing.includes(trimmed) ? existing : [...existing, trimmed]
  secrets.geminiModels = next
  // The one case FlameAGI picks a model without being told: the FIRST
  // model the user ever adds becomes active, since otherwise nothing
  // works at all. This is selecting the user's own just-entered id, not
  // inventing one — every model name in this file comes from the user.
  if (!secrets.geminiActiveModel) secrets.geminiActiveModel = trimmed
  await writeSecrets(secrets)
  return next
}

export async function removeGeminiModel(modelId: string): Promise<string[]> {
  const secrets = await readSecrets()
  const existing = ((secrets.geminiModels as string[]) || []).filter((m) => m !== modelId)
  secrets.geminiModels = existing
  if (secrets.geminiActiveModel === modelId) {
    secrets.geminiActiveModel = existing[0] ?? null
  }
  await writeSecrets(secrets)
  return existing
}

export async function setActiveGeminiModel(modelId: string): Promise<void> {
  const secrets = await readSecrets()
  secrets.geminiActiveModel = modelId
  await writeSecrets(secrets)
}

export async function getActiveGeminiModel(): Promise<string | null> {
  const secrets = await readSecrets()
  return (secrets.geminiActiveModel as string) || null
}

export async function getVisionModel(): Promise<string | null> {
  const secrets = await readSecrets()
  return (secrets.geminiVisionModel as string) || null
}

export async function setVisionModel(modelId: string): Promise<void> {
  const secrets = await readSecrets()
  secrets.geminiVisionModel = modelId.trim()
  await writeSecrets(secrets)
}

export async function isVisionEnabled(): Promise<boolean> {
  const secrets = await readSecrets()
  // Default ON. The earlier default-off was the actual cause of vision
  // silently doing nothing — nobody knew they needed to flip a switch
  // first. A missing MODEL is still a hard requirement (see below) —
  // this only removes the invisible second gate.
  return secrets.visionEnabled === undefined ? true : !!secrets.visionEnabled
}

export async function setVisionEnabled(enabled: boolean): Promise<void> {
  const secrets = await readSecrets()
  secrets.visionEnabled = enabled
  await writeSecrets(secrets)
}