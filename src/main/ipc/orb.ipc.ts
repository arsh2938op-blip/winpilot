import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { OrbAccent, OrbWindowState } from '@shared/types'
import {
  disableOrb,
  enableOrb,
  getOrbWindow,
  getState,
  moveOrbBy,
  notePetActivity,
  setAccent,
  setAlwaysListening,
  setAlwaysOnTop,
  setOrbPanelOpen,
  toggleOrb
} from '../services/orb/window'
import { showMainWindow } from '../services/appWindow'
import { destroyTray, ensureTray } from '../services/tray'

/**
 * Bridge between the renderer surfaces and the orb's native window.
 *
 * The main process owns only the window and the shared preferences. The
 * orb talks to the same `ai:*` service the main window uses, so it needs
 * no relay through the main renderer — that is what lets the companion
 * keep working when the main window is closed or reloading.
 */

function isSender(event: Electron.IpcMainInvokeEvent, expected: BrowserWindow | null): boolean {
  return expected !== null && BrowserWindow.fromWebContents(event.sender) === expected
}

function win32Number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000
}

function asAccent(value: unknown): OrbAccent {
  return value === 'black' ? 'black' : 'blue'
}

export function registerOrbIpc(): void {
  ipcMain.handle(IpcChannels.orb.getState, () => getState())

  ipcMain.handle(IpcChannels.orb.enable, async (): Promise<OrbWindowState> => {
    const state = await enableOrb()
    if (state.visible) ensureTray()
    return state
  })

  ipcMain.handle(IpcChannels.orb.disable, (): OrbWindowState => {
    disableOrb()
    destroyTray()
    return getState()
  })

  ipcMain.handle(IpcChannels.orb.toggle, async (): Promise<OrbWindowState> => {
    const state = await toggleOrb()
    if (state.visible) ensureTray()
    else destroyTray()
    return state
  })

  ipcMain.handle(IpcChannels.orb.setAlwaysOnTop, async (_event, value: unknown) => {
    return setAlwaysOnTop(value === true)
  })

  ipcMain.handle(IpcChannels.orb.setAccent, async (_event, value: unknown) => {
    return setAccent(asAccent(value))
  })

  ipcMain.handle(IpcChannels.orb.setAlwaysListening, async (_event, value: unknown) => {
    return setAlwaysListening(value === true)
  })

  ipcMain.handle(IpcChannels.orb.openMain, (): boolean => showMainWindow())

  // --- orb renderer -> native window ------------------------------------
  // These are pure window operations and are only accepted from the orb.

  ipcMain.handle(IpcChannels.orb.setPanelSize, (event, open: unknown) => {
    if (!isSender(event, getOrbWindow())) return
    setOrbPanelOpen(open === true)
  })

  ipcMain.handle(IpcChannels.orb.moveBy, (event, dx: unknown, dy: unknown) => {
    if (!isSender(event, getOrbWindow())) return
    if (!win32Number(dx) || !win32Number(dy)) return
    // Dragging can move the window but must never change its collapsed
    // size back out of sync with the renderer layout.
    moveOrbBy(Math.round(dx), Math.round(dy))
  })

  ipcMain.handle(IpcChannels.orb.dragEnd, () => {
    /* position persistence is handled by the 'moved' listener */
  })

  // Any renderer may report user activity; it only ever resets the idle clock.
  ipcMain.on(IpcChannels.orb.activity, () => {
    notePetActivity()
  })
}
