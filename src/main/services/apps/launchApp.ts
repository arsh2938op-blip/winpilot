import { shell } from 'electron'
import os from 'os'
import { runCommand } from '../../utils/runCommand'

interface StartApp {
  name: string
  appId: string
}

let appIndexCache: StartApp[] | null = null

async function buildAppIndex(): Promise<StartApp[]> {
  const { stdout } = await runCommand('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-StartApps | ConvertTo-Json -Compress'
  ])
  const parsed = JSON.parse(stdout.trim())
  const rows = Array.isArray(parsed) ? parsed : [parsed]

  return rows
    .filter((r: Record<string, unknown>) => r.Name && r.AppID)
    .map((r: Record<string, unknown>) => ({ name: String(r.Name), appId: String(r.AppID) }))
}

async function getAppIndex(): Promise<StartApp[]> {
  if (!appIndexCache) appIndexCache = await buildAppIndex()
  return appIndexCache
}

export function invalidateAppIndex(): void {
  appIndexCache = null
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// File Explorer's own AppsFolder entry behaves unreliably when launched
// via shell:AppsFolder — Explorer is already the running shell process,
// so "relaunching" it that way doesn't have the same clean success/
// failure semantics a normal packaged app has. Opening a real folder
// path is the well-tested, reliable way to get a normal Explorer window.
const FILE_EXPLORER_NAMES = new Set(['fileexplorer', 'explorer', 'windowsexplorer'])

export interface LaunchResult {
  success: boolean
  message: string
}

export async function launchApp(query: string): Promise<LaunchResult> {
  const target = normalize(query)
  if (!target) return { success: false, message: 'No app name given.' }

  let apps: StartApp[]
  try {
    apps = await getAppIndex()
  } catch (err) {
    return {
      success: false,
      message: `Couldn't read your installed apps list: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const exact = apps.find((a) => normalize(a.name) === target)
  const startsWith = apps.find((a) => normalize(a.name).startsWith(target))
  const contains = apps.find((a) => normalize(a.name).includes(target))
  const match = exact ?? startsWith ?? contains

  if (!match) {
    return { success: false, message: `Couldn't find an app called "${query}".` }
  }

  if (FILE_EXPLORER_NAMES.has(normalize(match.name))) {
    const error = await shell.openPath(os.homedir())
    if (error) {
      return { success: false, message: `Found "${match.name}" but couldn't launch it: ${error}` }
    }
    return { success: true, message: 'Opened File Explorer.' }
  }

  try {
    await shell.openExternal(`shell:AppsFolder\\${match.appId}`)
    return { success: true, message: `Launched ${match.name}.` }
  } catch (err) {
    return {
      success: false,
      message: `Found "${match.name}" but couldn't launch it: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}