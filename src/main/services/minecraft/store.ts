import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { MinecraftConfig } from '@shared/types'

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

// Defaults copied directly from settings.js's own fallbacks — not
// invented: 127.0.0.1:55916, mindserver 8080, spawn_timeout 30.
const DEFAULT_CONFIG: MinecraftConfig = {
  active: false,
  projectPath: null,
  serverIp: '127.0.0.1',
  serverPort: 55916,
  mindserverPort: 8080,
  autoOpenUi: true,
  botCount: 1,
  botNames: '',
  modelsOrPreset: '',
  spawnDelaySeconds: 30,
  viewer: false,
  apiRotation: false,
  speakjs: false,
  ownership: false,
  essentials: false
}

export async function getMinecraftConfig(): Promise<MinecraftConfig> {
  const secrets = await readSecrets()
  return { ...DEFAULT_CONFIG, ...((secrets.minecraft as Partial<MinecraftConfig>) || {}) }
}

export async function saveMinecraftConfig(config: MinecraftConfig): Promise<void> {
  const secrets = await readSecrets()
  secrets.minecraft = config
  await writeSecrets(secrets)
}

/**
 * Writes .env into the MindCraft folder in EXACTLY the shape run.bat
 * itself produces. This is not a new mechanism — launcher.js already
 * calls dotenv.config() and reads this same file. FlameAGI becomes the
 * source of truth by writing to it, without touching launcher.js or
 * settings.js at all.
 */
export async function writeMinecraftEnvFile(config: MinecraftConfig): Promise<void> {
  if (!config.projectPath) throw new Error('No MindCraft folder configured.')
  const yn = (b: boolean): string => (b ? 'Y' : 'N')
  const lines = [
    `SERVER_IP=${config.serverIp}`,
    `SERVER_PORT=${config.serverPort}`,
    `MODELS=${config.modelsOrPreset}`,
    `BOT_COUNT=${config.botCount}`,
    `BOT_NAMES=${config.botNames}`,
    // SPAWN_DELAY: what run.bat writes. SPAWN_TIMEOUT: what settings.js
    // actually reads. Writing both from one field since the repo's own
    // two files disagree on the name — unverified which (if either
    // beyond settings.js) is truly consumed elsewhere.
    `SPAWN_DELAY=${config.spawnDelaySeconds}`,
    `SPAWN_TIMEOUT=${config.spawnDelaySeconds}`,
    `VIEWER=${config.viewer ? 'true' : 'false'}`,
    // Written for compatibility; no confirmed consumer found in
    // settings.js/launcher.js — may be read deeper in main.js/agent code.
    `API_ROTATION=${yn(config.apiRotation)}`,
    `SPEAKJS=${yn(config.speakjs)}`,
    `OWNERSHIP=${yn(config.ownership)}`,
    `ESSENTIALS=${yn(config.essentials)}`,
    `MINDSERVER_PORT=${config.mindserverPort}`,
    `AUTO_OPEN_UI=${config.autoOpenUi ? 'true' : 'false'}`
  ]
  await fs.writeFile(path.join(config.projectPath, '.env'), lines.join('\n') + '\n', 'utf8')
}

export async function listModelPresets(projectPath: string): Promise<Record<string, string[]>> {
  try {
    const raw = await fs.readFile(path.join(projectPath, 'models.json'), 'utf8')
    const parsed = JSON.parse(raw) as { presets?: Record<string, string[]> }
    return parsed.presets || {}
  } catch {
    return {}
  }
}

