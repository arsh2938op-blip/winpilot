import { registerWindowsCapabilities } from '../plugins/windows/capabilities'
import { registerZapierCapabilities } from '../plugins/zapier/capabilities'
import { registerMemoryCapabilities } from './memoryCapability'
import { registerAiNetworkCapabilities } from '../plugins/aiNetwork/capabilities'
import { registerDevToolsCapabilities } from '../plugins/devTools/capabilities'
import { registerSearchCapabilities } from '../plugins/search/capabilities'
import { registerFileCapabilities } from '../plugins/files/capabilities'
import { registerRsiCapabilities } from '../plugins/rsi/capabilities'
import { registerCoderCapabilities } from '../plugins/coder/capabilities'

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
}
