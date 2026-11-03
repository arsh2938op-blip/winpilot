import { app, session, globalShortcut } from 'electron'
import { registerIpcHandlers } from './ipc'
import { registerAllCapabilities } from './flameCore/registerPlugins'
import { disposeOrb, isOrbEnabled, restoreOrbIfEnabled } from './services/orb/window'
import { createMainWindow, getMainWindow } from './services/appWindow'
import { destroyTray, ensureTray } from './services/tray'
import { stopChessEngineServer } from './services/chess'
import { mcpHost } from './mcp/mcpHost'
import { initErrorGuardian } from './services/errorGuardian'
import { isPluginActive } from './flameCore/pluginManager'
import { whatsappEngine } from './services/whatsapp'

// Initialize Error Guardian auto-healing loop as early as possible
initErrorGuardian()

app.whenReady().then(async () => {
  // 'media' for voice input; clipboard permissions for the chat's Copy
  // button. Everything else stays denied rather than using Electron's
  // insecure "allow everything" fallback.
  const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  // Windows taskbar/notification grouping id — previously set via
  // electronApp.setAppUserModelId() from @electron-toolkit/utils.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.flameagi.app')
  }

  // All system-facing logic is reached through IPC handlers registered here.
  // The renderer never talks to Node/Windows directly — see src/main/ipc
  // and shared/ipc-channels.ts for the full contract.
  registerAllCapabilities()
  registerIpcHandlers()

  // Start Model Context Protocol (MCP) servers and register capabilities
  await mcpHost.initializeAllServers().catch((err) => {
    console.error('[Main] Failed to initialize MCP servers:', err)
  })

  // Start WhatsApp AI & Moderation Companion if plugin is enabled
  if (isPluginActive('whatsapp')) {
    void whatsappEngine.start().catch((err) => console.error('[Main] WhatsApp engine start error:', err))
  }

  createMainWindow()

  // Register Alt / Alt+Space global shortcut for Agent Mode
  const triggerAgentModeToggle = (): void => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      win.webContents.send('toggle-agent-mode')
    }
  }
  globalShortcut.register('Alt+Space', triggerAgentModeToggle)
  try {
    globalShortcut.register('Alt', triggerAgentModeToggle)
  } catch {
    // Alt alone is reserved by Windows menu activation
  }

  // Bring the companion back if it was left enabled. The tray comes with
  // it, so there is always a way to reach the app even before the main
  // window finishes loading.
  void restoreOrbIfEnabled().then(() => {
    if (isOrbEnabled()) ensureTray()
  })

  app.on('activate', () => {
    if (!getMainWindow()) createMainWindow()
  })
})

// A real quit (tray → Quit, or the last window closing without the orb)
// tears everything down. Disabling the orb keeps the normal lifecycle.
app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  void mcpHost.stop()
  void whatsappEngine.stop()
  stopChessEngineServer()
  disposeOrb()
  destroyTray()
})

app.on('window-all-closed', () => {
  // While floating mode is on the orb window is deliberately the app's
  // anchor; if it ever disappears, the tray still offers a clean quit.
  if (process.platform !== 'darwin' && !isOrbEnabled()) {
    app.quit()
  }
})
