import { BrowserWindow } from 'electron'
import type { WingetPackage, WingetProgressEvent } from '@shared/types'
import { IpcChannels } from '@shared/ipc-channels'
import { runCommand } from '../../utils/runCommand'
import { parseWingetTable } from './parseWingetTable'

export async function listInstalled(): Promise<WingetPackage[]> {
  const { stdout } = await runCommand('winget', ['list', '--accept-source-agreements'])
  const rows = parseWingetTable(stdout)

  return rows.map(
    (row): WingetPackage => ({
      id: row.Id ?? '',
      name: row.Name ?? '',
      version: row.Version ?? '',
      availableVersion: row.Available || undefined,
      source: row.Source || 'winget'
    })
  )
}

/**
 * Apps with a real update available. Unlike listInstalled(), `winget
 * upgrade` on its own only returns rows that actually have a newer
 * version — so this is the correct source for the Updates tab, rather
 * than filtering listInstalled() client-side.
 */
export async function listUpgradable(): Promise<WingetPackage[]> {
  const { stdout } = await runCommand('winget', ['upgrade', '--accept-source-agreements'])
  const rows = parseWingetTable(stdout)

  return rows
    .filter((row) => row.Id) // winget sometimes prints a trailing summary line with no Id
    .map(
      (row): WingetPackage => ({
        id: row.Id ?? '',
        name: row.Name ?? '',
        version: row.Version ?? '',
        availableVersion: row.Available || undefined,
        source: row.Source || 'winget'
      })
    )
}

export async function search(query: string): Promise<WingetPackage[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const { stdout } = await runCommand('winget', [
    'search',
    trimmed,
    '--accept-source-agreements'
  ])
  const rows = parseWingetTable(stdout)

  return rows.map(
    (row): WingetPackage => ({
      id: row.Id ?? '',
      name: row.Name ?? '',
      version: row.Version ?? '',
      source: row.Source || 'winget'
    })
  )
}

function broadcastProgress(event: WingetProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.winget.onProgress, event)
  }
}

export async function install(packageId: string): Promise<void> {
  broadcastProgress({ packageId, status: 'running', message: 'Starting install…' })
  try {
    await runCommand(
      'winget',
      ['install', '--id', packageId, '-e', '--accept-source-agreements', '--accept-package-agreements'],
      { timeoutMs: 5 * 60_000 }
    )
    broadcastProgress({ packageId, status: 'success', message: 'Installed successfully.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Install failed.'
    broadcastProgress({ packageId, status: 'error', message })
    throw err
  }
}

export async function update(packageId: string): Promise<void> {
  broadcastProgress({ packageId, status: 'running', message: 'Starting update…' })
  try {
    await runCommand(
      'winget',
      ['upgrade', '--id', packageId, '-e', '--accept-source-agreements', '--accept-package-agreements'],
      { timeoutMs: 5 * 60_000 }
    )
    broadcastProgress({ packageId, status: 'success', message: 'Updated successfully.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed.'
    broadcastProgress({ packageId, status: 'error', message })
    throw err
  }
}

/**
 * Uninstall. This is the only destructive winget action — the renderer
 * MUST show a confirmation dialog before ever calling this (see
 * ConfirmDialog usage in WingetManager/index.tsx). This function itself
 * doesn't re-confirm anything; by the time this runs, the user has
 * already agreed.
 */
export async function uninstall(packageId: string): Promise<void> {
  broadcastProgress({ packageId, status: 'running', message: 'Uninstalling…' })
  try {
    await runCommand(
      'winget',
      ['uninstall', '--id', packageId, '-e', '--accept-source-agreements'],
      { timeoutMs: 3 * 60_000 }
    )
    broadcastProgress({ packageId, status: 'success', message: 'Uninstalled successfully.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Uninstall failed.'
    broadcastProgress({ packageId, status: 'error', message })
    throw err
  }
}