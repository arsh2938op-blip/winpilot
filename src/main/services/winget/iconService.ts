import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { runCommand } from '../../utils/runCommand'
import type { WingetPackage } from '@shared/types'

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Strips surrounding quotes, trailing argument indexes (e.g. ",0" or ",-101"),
 * and resolves environment variables.
 */
export function cleanDisplayIconPath(rawPath: string): string {
  if (!rawPath) return ''
  let p = rawPath.trim()

  if (p.startsWith('"')) {
    const nextQuote = p.indexOf('"', 1)
    if (nextQuote !== -1) {
      p = p.substring(1, nextQuote)
    } else {
      p = p.replace(/^"|"$/g, '')
    }
  } else {
    const commaIndex = p.lastIndexOf(',')
    if (commaIndex !== -1 && /,[-\d]+$/.test(p.substring(commaIndex))) {
      p = p.substring(0, commaIndex)
    }
  }

  p = p.trim().replace(/^"|"$/g, '')

  // Expand standard environment variables if present
  p = p.replace(/%([^%]+)%/g, (_, n) => process.env[n] ?? `%${n}%`)

  return p
}

interface RegistryAppRecord {
  DisplayName?: string
  displayName?: string
  DisplayIcon?: string
  displayIcon?: string
  PSChildName?: string
  psChildName?: string
  Publisher?: string
  publisher?: string
}

// In-memory icon data-URL caches
const iconDataUrlCache = new Map<string, string>()
const registryPathMap = new Map<string, string>()
let registryLoaded = false
let registryLoadingPromise: Promise<void> | null = null

/**
 * Common brand icons in clean data URIs for popular winget packages when
 * not yet installed or not in local registry.
 */
const KNOWN_APP_ICONS: Record<string, string> = {
  // Browsers
  chrome: 'https://cdn.simpleicons.org/googlechrome/4285F4',
  googlechrome: 'https://cdn.simpleicons.org/googlechrome/4285F4',
  brave: 'https://cdn.simpleicons.org/brave/FB542B',
  bravebrowser: 'https://cdn.simpleicons.org/brave/FB542B',
  firefox: 'https://cdn.simpleicons.org/firefox/FF7139',
  edge: 'https://cdn.simpleicons.org/microsoftedge/0078D7',
  microsoftedge: 'https://cdn.simpleicons.org/microsoftedge/0078D7',
  opera: 'https://cdn.simpleicons.org/opera/FF1B2D',
  // Dev tools
  vscode: 'https://cdn.simpleicons.org/visualstudiocode/007ACC',
  visualstudiocode: 'https://cdn.simpleicons.org/visualstudiocode/007ACC',
  visualstudio: 'https://cdn.simpleicons.org/visualstudio/5C2D91',
  git: 'https://cdn.simpleicons.org/git/F05032',
  githubdesktop: 'https://cdn.simpleicons.org/github/181717',
  nodejs: 'https://cdn.simpleicons.org/nodedotjs/5FA04E',
  node: 'https://cdn.simpleicons.org/nodedotjs/5FA04E',
  python: 'https://cdn.simpleicons.org/python/3776AB',
  python3: 'https://cdn.simpleicons.org/python/3776AB',
  docker: 'https://cdn.simpleicons.org/docker/2496ED',
  postman: 'https://cdn.simpleicons.org/postman/FF6C37',
  windowsnull: 'https://cdn.simpleicons.org/windowsterminal/4D4D4D',
  windowsterminal: 'https://cdn.simpleicons.org/windowsterminal/4D4D4D',
  neovim: 'https://cdn.simpleicons.org/neovim/57A143',
  sublimetext: 'https://cdn.simpleicons.org/sublimetext/FF9800',
  // Media & Utilities
  vlc: 'https://cdn.simpleicons.org/vlcmediaplayer/FF8800',
  vlcmediaplayer: 'https://cdn.simpleicons.org/vlcmediaplayer/FF8800',
  spotify: 'https://cdn.simpleicons.org/spotify/1ED760',
  discord: 'https://cdn.simpleicons.org/discord/5865F2',
  slack: 'https://cdn.simpleicons.org/slack/4A154B',
  telegram: 'https://cdn.simpleicons.org/telegram/26A5E4',
  notion: 'https://cdn.simpleicons.org/notion/000000',
  obsstudio: 'https://cdn.simpleicons.org/obsstudio/302E31',
  steam: 'https://cdn.simpleicons.org/steam/000000',
  sevenzip: 'https://cdn.simpleicons.org/7zip/000000',
  '7zip': 'https://cdn.simpleicons.org/7zip/000000',
  minecraft: 'https://cdn.simpleicons.org/mojang/DD3333',
  mojang: 'https://cdn.simpleicons.org/mojang/DD3333',
  sklauncher: 'https://cdn.simpleicons.org/mojang/DD3333',
  epicgames: 'https://cdn.simpleicons.org/epicgames/313131',
  whatsapp: 'https://cdn.simpleicons.org/whatsapp/25D366',
  zoom: 'https://cdn.simpleicons.org/zoom/2D8CFF',
  anydesk: 'https://cdn.simpleicons.org/anydesk/EF443B',
  blender: 'https://cdn.simpleicons.org/blender/E87D0D',
  gimp: 'https://cdn.simpleicons.org/gimp/5C5543',
  inkscape: 'https://cdn.simpleicons.org/inkscape/000000',
  audacity: 'https://cdn.simpleicons.org/audacity/0000EB',
  bitwarden: 'https://cdn.simpleicons.org/bitwarden/175DDC',
  powershell: 'https://cdn.simpleicons.org/powershell/5391FE',
  thunderbird: 'https://cdn.simpleicons.org/thunderbird/0A84FF'
}

export function generateFallbackIconDataUrl(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9 ]/g, '').trim()
  const initial = (clean[0] || 'A').toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#3b82f6"/><text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initial}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Loads the cached uninstall entries from the Windows Registry to map app
 * names to their native DisplayIcon path.
 */
export async function loadRegistryIconMap(): Promise<void> {
  if (registryLoaded) return
  if (registryLoadingPromise) return registryLoadingPromise

  registryLoadingPromise = (async () => {
    try {
      const psCommand = `Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKCU:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.DisplayIcon } | Select-Object DisplayName, DisplayIcon, PSChildName, Publisher | ConvertTo-Json -Compress`

      const { stdout } = await runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
        timeoutMs: 8000
      })

      if (!stdout || !stdout.trim()) {
        registryLoaded = true
        return
      }

      const parsed = JSON.parse(stdout.trim())
      const records: RegistryAppRecord[] = Array.isArray(parsed) ? parsed : [parsed]

      for (const rec of records) {
        const appName = rec.DisplayName || rec.displayName
        const appIcon = rec.DisplayIcon || rec.displayIcon
        const childName = rec.PSChildName || rec.psChildName
        if (!appName || !appIcon) continue
        const cleanPath = cleanDisplayIconPath(appIcon)
        if (!cleanPath) continue

        const normName = normalize(appName)
        if (normName) registryPathMap.set(normName, cleanPath)

        if (childName) {
          const normChild = normalize(childName)
          if (normChild) registryPathMap.set(normChild, cleanPath)
        }
      }

      registryLoaded = true
    } catch {
      registryLoaded = true
    } finally {
      registryLoadingPromise = null
    }
  })()

  return registryLoadingPromise
}

/**
 * Resolves an icon for a given file path using Electron's native getFileIcon.
 */
export async function getNativeFileIcon(filePath: string): Promise<string | undefined> {
  try {
    if (!fs.existsSync(filePath)) return undefined
    const icon = await app.getFileIcon(filePath, { size: 'normal' })
    return icon.toDataURL()
  } catch {
    return undefined
  }
}

/**
 * Fetches Winget metadata for a package by running `winget show --id <packageId>`.
 */
export async function getWingetMetadata(packageId: string): Promise<{
  icon?: string
  description?: string
  publisher?: string
  homepage?: string
}> {
  try {
    const { stdout } = await runCommand(
      'winget',
      ['show', '--id', packageId, '-e', '--accept-source-agreements'],
      { timeoutMs: 10_000 }
    )

    const metadata: { icon?: string; description?: string; publisher?: string; homepage?: string } = {}
    const lines = stdout.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      const descMatch = trimmed.match(/^Description:\s*(.+)$/i)
      if (descMatch && !metadata.description) metadata.description = descMatch[1].trim()

      const pubMatch = trimmed.match(/^Publisher:\s*(.+)$/i)
      if (pubMatch && !metadata.publisher) metadata.publisher = pubMatch[1].trim()

      const homeMatch = trimmed.match(/^Homepage:\s*(.+)$/i)
      if (homeMatch && !metadata.homepage) metadata.homepage = homeMatch[1].trim()

      const iconMatch = trimmed.match(/^(?:Icon|Icon Url|Icons):\s*(.+)$/i)
      if (iconMatch && !metadata.icon) metadata.icon = iconMatch[1].trim()
    }
    return metadata
  } catch {
    return {}
  }
}

/**
 * Finds and returns an icon data URI or URL for a Winget package ID or name.
 */
export async function getIconForPackage(packageId: string, packageName?: string): Promise<string | undefined> {
  const normId = normalize(packageId)
  const normName = packageName ? normalize(packageName) : ''

  if (normId && iconDataUrlCache.has(normId)) {
    return iconDataUrlCache.get(normId)
  }
  if (normName && iconDataUrlCache.has(normName)) {
    return iconDataUrlCache.get(normName)
  }

  // 1. Check local Windows Registry cache
  await loadRegistryIconMap()

  let iconPath = registryPathMap.get(normId) || (normName ? registryPathMap.get(normName) : undefined)

  // Try partial match in registry if not exact
  if (!iconPath && (normName || normId)) {
    const searchTarget = normName || normId
    for (const [key, p] of registryPathMap.entries()) {
      if (key.includes(searchTarget) || searchTarget.includes(key)) {
        iconPath = p
        break
      }
    }
  }

  if (iconPath) {
    const dataUri = await getNativeFileIcon(iconPath)
    if (dataUri) {
      if (normId) iconDataUrlCache.set(normId, dataUri)
      if (normName) iconDataUrlCache.set(normName, dataUri)
      return dataUri
    }
  }

  // 2. Check known icon map
  for (const [key, iconUrl] of Object.entries(KNOWN_APP_ICONS)) {
    if (normId.includes(key) || normName.includes(key)) {
      if (normId) iconDataUrlCache.set(normId, iconUrl)
      if (normName) iconDataUrlCache.set(normName, iconUrl)
      return iconUrl
    }
  }

  // 3. Fallback to clean branded initial SVG data URL
  const fallback = generateFallbackIconDataUrl(packageName || packageId)
  if (normId) iconDataUrlCache.set(normId, fallback)
  if (normName) iconDataUrlCache.set(normName, fallback)
  return fallback
}

/**
 * Enriches a WingetPackage with an icon.
 */
export async function enrichPackageWithIcon(pkg: WingetPackage): Promise<WingetPackage> {
  if (pkg.icon) return pkg
  const icon = await getIconForPackage(pkg.id, pkg.name)
  if (icon) {
    return { ...pkg, icon }
  }
  return pkg
}

/**
 * Enriches an array of WingetPackages with icons.
 */
export async function enrichPackagesWithIcons(packages: WingetPackage[]): Promise<WingetPackage[]> {
  await loadRegistryIconMap()
  const enriched = await Promise.all(packages.map((pkg) => enrichPackageWithIcon(pkg)))
  return enriched
}
