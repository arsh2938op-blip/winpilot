import { app, BrowserWindow, powerMonitor, screen } from 'electron'
import { join } from 'path'
import { IpcChannels } from '@shared/ipc-channels'
import type { OrbAccent, OrbWindowState } from '@shared/types'
import { getOrbPrefs, loadOrbPrefs, updateOrbPrefs } from './store'

/**
 * The floating orb's native window.
 *
 * Everything that only the main process can do lives here: creating the
 * window, the real transparency flag, always-on-top, keeping the orb on a
 * visible part of the screen, and remembering where the user put it. The
 * renderer only sends narrow intents (move, resize).
 *
 * Conversation state is NOT handled here either — the orb renderer owns
 * its own transcript and talks to the same main-process AI service as the
 * main window, so nothing here depends on the main window being alive.
 */

/** Idle PET window edge, in DIP. Medium rather than tiny: the mascot has to be
 *  readable, and there is a push-to-talk mic button beneath it. */
export const PET_WIDTH = 152
export const PET_HEIGHT = 200
const PANEL_WIDTH = 360
const PANEL_HEIGHT = 520

let orbWindow: BrowserWindow | null = null
let creating = false
/** True while the quick panel is expanded. Wandering is suspended then so
 *  the pet cannot slide out from under an open panel. */
let panelIsOpen = false

const transparencySupported = process.platform === 'win32' || process.platform === 'darwin'

export function getOrbWindow(): BrowserWindow | null {
  return orbWindow && !orbWindow.isDestroyed() ? orbWindow : null
}

/** Whether the companion is enabled in preferences. Used by the app
 *  lifecycle so closing the main window does not also shut the orb down. */
export function isOrbEnabled(): boolean {
  return getOrbPrefs().enabled
}

/**
 * Keeps the orb reachable. Bounds are matched against the display they
 * mostly sit on and clamped into its work area, so a remembered position
 * from a monitor that has since been unplugged (or a drag past the screen
 * edge) can never strand the orb.
 */
function clampToVisibleDisplay(bounds: Electron.Rectangle): Electron.Rectangle {
  const area = screen.getDisplayMatching(bounds).workArea
  return {
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))),
    width: bounds.width,
    height: bounds.height
  }
}

/** Default spot: bottom-right of the primary work area, clear of the taskbar. */
function defaultBounds(width: number, height: number): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + area.width - width - 24, y: area.y + area.height - height - 24, width, height }
}

/**
 * Remembering where the orb is. Deliberately driven by our own
 * setBounds() calls as well as the native `moved` event: on Windows
 * setBounds does not always emit `moved`, so listening to the event alone
 * silently lost the position after a drag.
 */
let saveTimer: NodeJS.Timeout | null = null

function savePositionNow(): void {
  const win = getOrbWindow()
  if (!win || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  void updateOrbPrefs({ x, y })
}

function schedulePositionSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    savePositionNow()
  }, 400)
}

function flushPositionSave(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  savePositionNow()
}

async function loadRenderer(win: BrowserWindow): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    await win.loadURL(`${devUrl}?surface=orb#/`)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'), { query: { surface: 'orb' } })
  }
}

export async function createOrbWindow(): Promise<BrowserWindow | null> {
  if (creating) return getOrbWindow()
  const existing = getOrbWindow()
  if (existing) {
    existing.showInactive()
    return existing
  }

  creating = true
  try {
    const prefs = await loadOrbPrefs()
    const start =
      prefs.x !== undefined && prefs.y !== undefined
        ? clampToVisibleDisplay({ x: prefs.x, y: prefs.y, width: PET_WIDTH, height: PET_HEIGHT })
        : defaultBounds(PET_WIDTH, PET_HEIGHT)

    const win = new BrowserWindow({
      ...start,
      minWidth: PET_WIDTH,
      minHeight: PET_HEIGHT,
      maxWidth: PANEL_WIDTH,
      maxHeight: PANEL_HEIGHT,
      show: false,
      // The three settings that make this a desktop companion rather than
      // a window: no frame/chrome, real transparency, and it stays put.
      frame: false,
      transparent: transparencySupported,
      backgroundColor: transparencySupported ? '#00000000' : '#0b0d0f',
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      // A companion, not a second app in the taskbar switcher.
      skipTaskbar: true,
      alwaysOnTop: prefs.alwaysOnTop,
      // An idle orb must never steal focus from whatever the user is doing.
      // It becomes focusable again when the quick panel opens so typing works.
      focusable: false,
      title: 'FlameAGI Companion',
      // PET mode shows the mascot; the tile is the application icon and belongs to
// the main window, tray and installer.
icon: join(__dirname, '../../../resources/icon-pet.png'),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // The orb only ever renders the app's own local bundle.
        webviewTag: false
      }
    })

    win.setMenu(null)
    win.setAlwaysOnTop(prefs.alwaysOnTop, prefs.alwaysOnTop ? 'screen-saver' : 'normal')

    // External links must never open inside the companion.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())

    orbWindow = win

    // Debounced position memory — a drag fires a lot of moves.
    win.on('moved', schedulePositionSave)
    win.on('close', flushPositionSave)
    win.on('closed', () => {
      orbWindow = null
      notifyVisibility(false)
    })

    await loadRenderer(win)
    return win
  } catch (error) {
    console.error('[Flame] Failed to create the floating orb window:', error)
    orbWindow = null
    notifyVisibility(false)
    return null
  } finally {
    creating = false
  }
}

export async function enableOrb(): Promise<OrbWindowState> {
  await updateOrbPrefs({ enabled: true })
  const win = await createOrbWindow()
  if (win) {
    // Collapse to the idle pet first so a stale panel size never lingers.
    setOrbPanelOpen(false)
    notifyVisibility(true)
    startPetBehaviour()
  }
  return getState()
}

export function disableOrb(): void {
  void updateOrbPrefs({ enabled: false })
  stopPetBehaviour()
  flushPositionSave()
  const win = getOrbWindow()
  if (win) win.destroy()
  orbWindow = null
  notifyVisibility(false)
}

export async function toggleOrb(): Promise<OrbWindowState> {
  if (getOrbWindow()) disableOrb()
  else await enableOrb()
  return getState()
}

export function getState(): OrbWindowState {
  const prefs = getOrbPrefs()
  return {
    visible: getOrbWindow() !== null,
    alwaysOnTop: prefs.alwaysOnTop,
    transparencySupported,
    accent: prefs.accent,
    alwaysListening: prefs.alwaysListening
  }
}

export async function setAlwaysOnTop(alwaysOnTop: boolean): Promise<OrbWindowState> {
  await updateOrbPrefs({ alwaysOnTop })
  getOrbWindow()?.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? 'screen-saver' : 'normal')
  return getState()
}

/** Companion colour — blue or black only. Applied live in the orb (which
 *  listens for orb:onPrefs) and in the main window's Settings toggle. */
export async function setAccent(accent: OrbAccent): Promise<OrbWindowState> {
  await updateOrbPrefs({ accent: accent === 'black' ? 'black' : 'blue' })
  broadcastPrefs()
  return getState()
}

export async function setAlwaysListening(enabled: boolean): Promise<OrbWindowState> {
  await updateOrbPrefs({ alwaysListening: enabled === true })
  broadcastPrefs()
  return getState()
}

/** The prefs both surfaces must agree on, pushed whenever they change. */
function broadcastPrefs(): void {
  const prefs = getOrbPrefs()
  const payload = { accent: prefs.accent, alwaysListening: prefs.alwaysListening }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(IpcChannels.orb.onPrefs, payload)
  }
}

/* ---- PET behaviour ------------------------------------------------------
 * The pet wanders slowly along the work area and speaks up when the user has
 * gone quiet. Both are deliberately cheap: a window move and an IPC message
 * on a timer. No AI call, no audio, no network — the renderer decides what
 * to actually say.
 */

/** Idle seconds before the pet says something. */
const IDLE_NUDGE_SECONDS = 60
const WANDER_INTERVAL_MS = 4500
const WANDER_STEP = 34

let wanderTimer: NodeJS.Timeout | null = null
let idleTimer: NodeJS.Timeout | null = null
let wanderDir = 1
let lastNudgeAt = 0

/** A slow horizontal amble that bounces off the edges of the work area. */
function wanderTick(): void {
  const win = getOrbWindow()
  if (!win || win.isDestroyed() || panelIsOpen) return
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  const area = screen.getPrimaryDisplay().workArea
  let nx = x + wanderDir * WANDER_STEP
  if (nx + w > area.x + area.width) {
    nx = area.x + area.width - w
    wanderDir = -1
  }
  if (nx < area.x) {
    nx = area.x
    wanderDir = 1
  }
  const ny = Math.max(area.y, Math.min(y, area.y + area.height - h))
  if (nx === x && ny === y) return
  // setPosition, not setBounds: re-applying bounds on every tick lets the
  // window creep larger each time.
  win.setPosition(nx, ny)
}

/**
 * "How long has the user been away?"
 *
 * `powerMonitor.getSystemIdleTime()` is the correct signal, but it reports
 * near-zero on sessions where no real input is delivered (headless, locked,
 * or automated sessions), which would leave the pet permanently silent. So we
 * take the larger of the OS value and how long it has been since Flame last
 * saw any activity. Activity is reported by the renderers and by window
 * focus, which is enough to keep the pet quiet while the user is working in
 * the app.
 */
let lastActivityAt = Date.now()

export function notePetActivity(): void {
  lastActivityAt = Date.now()
}

function idleSeconds(): number {
  let systemIdle = 0
  try {
    systemIdle = powerMonitor.getSystemIdleTime()
  } catch {
    systemIdle = 0
  }
  const appIdle = Math.floor((Date.now() - lastActivityAt) / 1000)
  return Math.max(systemIdle, appIdle)
}

/**
 * After a minute of no activity the pet checks in, and keeps checking in
 * every minute while the user stays away. Coming back resets the clock.
 */
function idleTick(): void {
  const win = getOrbWindow()
  if (!win || win.isDestroyed() || panelIsOpen) return
  const secs = idleSeconds()
  if (process.env['FLAME_DEBUG_IDLE']) console.log('[Flame] idle=', secs)
  if (secs < IDLE_NUDGE_SECONDS) {
    lastNudgeAt = 0
    return
  }
  const now = Date.now()
  if (now - lastNudgeAt < IDLE_NUDGE_SECONDS * 1000) return
  lastNudgeAt = now
  if (process.env['FLAME_DEBUG_IDLE']) console.log('[Flame] nudge sent after', secs, 's')
  win.webContents.send(IpcChannels.orb.onProactive)
}

export function startPetBehaviour(): void {
  stopPetBehaviour()
  wanderTimer = setInterval(wanderTick, WANDER_INTERVAL_MS)
  idleTimer = setInterval(idleTick, 5000)
}

export function stopPetBehaviour(): void {
  if (wanderTimer) {
    clearInterval(wanderTimer)
    wanderTimer = null
  }
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
  lastNudgeAt = 0
  flushPositionSave()
}

/** Restores the companion on launch if it was left enabled. Called once
 *  after the app is ready and IPC is registered. */
export async function restoreOrbIfEnabled(): Promise<void> {
  const prefs = await loadOrbPrefs()
  if (!prefs.enabled) return
  const win = await createOrbWindow()
  if (win) {
    notifyVisibility(true)
    startPetBehaviour()
  }
}

/** Collapsed = the small idle orb. Open = the quick panel, which grows
 *  down/right from the orb's corner and is clamped to stay on screen. */
export function setOrbPanelOpen(open: boolean): void {
  const win = getOrbWindow()
  if (!win || win.isDestroyed()) return
  panelIsOpen = open

  if (!open) {
    const b = win.getBounds()
    win.setBounds({ x: b.x, y: b.y, width: PET_WIDTH, height: PET_HEIGHT })
    win.setFocusable(false)
    win.showInactive()
    schedulePositionSave()
    return
  }

  const b = win.getBounds()
  win.setBounds(clampToVisibleDisplay({ x: b.x, y: b.y, width: PANEL_WIDTH, height: PANEL_HEIGHT }))
  win.setFocusable(true)
  win.show()
  win.focus()
  schedulePositionSave()
}

export function moveOrbBy(dx: number, dy: number): void {
  const win = getOrbWindow()
  if (!win || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  win.setBounds(clampToVisibleDisplay({ x: x + dx, y: y + dy, width: PET_WIDTH, height: PET_HEIGHT }))
  schedulePositionSave()
}

/** Tells both renderer surfaces the truth, so toggles can't drift out of
 *  sync with reality (e.g. the user closed the orb window itself). */
export function notifyVisibility(visible: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(IpcChannels.orb.onVisibility, visible)
  }
}

/** Never leave an orphaned native window behind. */
export function disposeOrb(): void {
  flushPositionSave()
  const win = getOrbWindow()
  if (win) win.destroy()
  orbWindow = null
}