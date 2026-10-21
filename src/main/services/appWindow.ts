import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

/**
 * The full application window.
 *
 * There is exactly one, and it is the only window that isn't the floating
 * companion. It is tracked here rather than in index.ts so the orb can
 * bring it back (or focus it) without importing the app entry point, and
 * so closing it does not tear the orb down.
 */

let mainWindow: BrowserWindow | null = null

const isDev = !app.isPackaged

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    // Frameless with a custom title bar (see components/layout/TitleBar.tsx)
    // so the whole app — including the window chrome — feels like a single
    // Fluent-styled surface instead of a webpage in a generic OS window.
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    // Genuine native transparency. `backgroundColor: '#00000000'` on its own
    // only tints the compositor while the window stays opaque; `transparent`
    // is the flag that actually lets the desktop through. Verified by
    // sampling real screen pixels behind the window, not just the CSS.
    //
    // `titleBarStyle: 'hidden'` is deliberately kept rather than `frame: false`:
    // it hides the native title bar while preserving the invisible resize
    // frame and drop shadow, so the window stays user-resizable.
    transparent: true,
    backgroundColor: '#00000000',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Only enables the <webview> tag itself — everything it can load
      // (sandbox, contextIsolation) stays governed the same as before.
      // Needed to embed MindCraft's dashboard inline instead of a
      // separate window.
      webviewTag: true
    }
  })

  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })

  // Closing the main window must NOT close the companion. The app keeps
  // running (and quittable from the tray) while floating mode is enabled;
  // when it isn't, `window-all-closed` quits as before.
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Open external links in the OS browser, never inside the app window.
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** Brings the full app up, recreating it if the user already closed it. */
export function showMainWindow(): boolean {
  const win = getMainWindow() ?? createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return true
}
