import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { toggleOrb } from './orb/window'
import { showMainWindow } from './appWindow'

/**
 * The tray is the always-available escape hatch while the companion is
 * running: with the main window closed the app has no taskbar entry, so
 * without this there would be no obvious way to bring it back or quit it.
 * It is created when the orb is enabled and removed again when it is
 * disabled, so ordinary (orb-less) use keeps the normal app lifecycle.
 */

let tray: Tray | null = null

function trayIconPath(): string {
  return join(__dirname, '../../resources/icon.png')
}

export function ensureTray(): void {
  if (tray) return

  let image = nativeImage.createFromPath(trayIconPath())
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 })

  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('FlameAGI')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open FlameAGI', click: () => showMainWindow() },
      { label: 'Toggle floating orb', click: () => void toggleOrb() },
      { type: 'separator' },
      { label: 'Quit FlameAGI', click: () => app.quit() }
    ])
  )
  // Left click restores the full app; the menu covers everything else.
  tray.on('click', () => showMainWindow())
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export function isTrayVisible(): boolean {
  return tray !== null
}
