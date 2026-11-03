import { registerWindowsCapabilities } from '../plugins/windows/capabilities'
import { registerZapierCapabilities } from '../plugins/zapier/capabilities'
import { registerMemoryCapabilities } from './memoryCapability'
import { registerAiNetworkCapabilities } from '../plugins/aiNetwork/capabilities'
import { registerDevToolsCapabilities } from '../plugins/devTools/capabilities'
import { registerSearchCapabilities } from '../plugins/search/capabilities'
import { registerFileCapabilities } from '../plugins/files/capabilities'
import { registerRsiCapabilities } from '../plugins/rsi/capabilities'
import { registerCoderCapabilities } from '../plugins/coder/capabilities'
import { registerChessCapabilities } from '../plugins/chess/capabilities'
import { registerOsintCapabilities } from '../plugins/osint/capabilities'
import { registerReaCapabilities } from '../plugins/rea/capabilities'
import { registerImageCapabilities } from '../plugins/image/capabilities'
import { registerDueMessagesCapabilities } from '../plugins/dueMessages/capabilities'
import { registerBrowserCapabilities } from '../plugins/browser/capabilities'
import { registerWhatsAppCapabilities } from '../plugins/whatsapp/capabilities'
import { initPluginManager } from './pluginManager'

/**
 * The one place every plugin's capabilities get registered at startup.
 * Adding a new plugin later (GitHub, Minecraft, Robot) means adding one
 * line here — nothing in services/ai/index.ts ever needs to change.
 */
export function registerAllCapabilities(): void {
  registerWindowsCapabilities()
  registerZapierCapabilities()
  registerMemoryCapabilities()
  registerAiNetworkCapabilities()
  registerDevToolsCapabilities()
  registerSearchCapabilities()
  registerFileCapabilities()
  registerRsiCapabilities()
  registerCoderCapabilities()
  registerChessCapabilities()
  registerOsintCapabilities()
  registerReaCapabilities()
  registerImageCapabilities()
  registerDueMessagesCapabilities()
  registerBrowserCapabilities()
  registerWhatsAppCapabilities()

  // Initialize and apply dynamic plugin toggle states
  initPluginManager()
}
