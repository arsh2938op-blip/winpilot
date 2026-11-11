import fsSync from 'node:fs'
import path from 'node:path'
import os from 'node:os'

interface ElectronAppLike {
  isPackaged?: boolean
  getPath?: (name: string) => string
  getAppPath?: () => string
}

function getElectronApp(): ElectronAppLike | null {
  if (process.env.ELECTRON_RUN_AS_NODE) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron')
    if (electron && typeof electron === 'object' && electron.app) {
      return electron.app as ElectronAppLike
    }
  } catch {
    // Not running inside Electron main process
  }
  return null
}

/**
 * Returns the writable userData directory for the running application.
 * Honors `FLAME_USER_DATA` when invoked inside MCP child processes.
 */
export function getUserDataDir(): string {
  const envUserData = process.env.FLAME_USER_DATA?.trim()
  if (envUserData) {
    try {
      fsSync.mkdirSync(envUserData, { recursive: true })
    } catch {
      // ignore
    }
    return envUserData
  }

  const electronApp = getElectronApp()
  if (electronApp?.getPath) {
    try {
      const dir = electronApp.getPath('userData')
      fsSync.mkdirSync(dir, { recursive: true })
      return dir
    } catch {
      // fall through
    }
  }

  const fallback = path.join(os.homedir(), '.flameagi')
  try {
    fsSync.mkdirSync(fallback, { recursive: true })
  } catch {
    // ignore
  }
  return fallback
}

/**
 * Returns the writable root for mutable `.flame` state (user profile, plugins,
 * WhatsApp session/media, due messages, generated assets, MCP config).
 *
 * - Packaged release: `%APPDATA%/FlameAGI/.flame` (never read-only Program Files).
 * - Child processes: inherits `FLAME_DATA_DIR` from the main process.
 * - Development: uses workspace `.flame` if present, else `userData/.flame`.
 */
export function getFlameDir(): string {
  const envFlame = process.env.FLAME_DATA_DIR?.trim()
  if (envFlame) {
    try {
      fsSync.mkdirSync(envFlame, { recursive: true })
    } catch {
      // ignore
    }
    return envFlame
  }

  const electronApp = getElectronApp()
  if (electronApp?.isPackaged) {
    const dir = path.join(getUserDataDir(), '.flame')
    try {
      fsSync.mkdirSync(dir, { recursive: true })
    } catch {
      // ignore
    }
    return dir
  }

  const cwd = process.cwd()
  if (fsSync.existsSync(path.join(cwd, '.flame'))) {
    return path.join(cwd, '.flame')
  }
  const winpilotFlame = path.join(cwd, 'winpilot', '.flame')
  if (fsSync.existsSync(winpilotFlame)) {
    return winpilotFlame
  }
  const parentFlame = path.resolve(cwd, '..', '.flame')
  if (fsSync.existsSync(parentFlame)) {
    return parentFlame
  }

  const dir = path.join(getUserDataDir(), '.flame')
  try {
    fsSync.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
  return dir
}

/**
 * Returns whether the application is running from a packaged release build.
 */
export function isAppPackaged(): boolean {
  return Boolean(getElectronApp()?.isPackaged)
}

/**
 * Returns candidate base directories where bundled scripts/assets may reside.
 */
export function getBundledSearchDirs(): string[] {
  const dirs: string[] = []
  const electronApp = getElectronApp()

  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    dirs.push(process.resourcesPath)
    dirs.push(path.join(process.resourcesPath, 'app'))
    dirs.push(path.join(process.resourcesPath, 'app.asar.unpacked'))
  }
  if (electronApp?.getAppPath) {
    try {
      const appPath = electronApp.getAppPath()
      dirs.push(appPath)
      dirs.push(path.dirname(appPath))
    } catch {
      // ignore
    }
  }
  dirs.push(process.cwd())
  dirs.push(path.resolve(process.cwd(), '..'))
  return [...new Set(dirs)]
}

