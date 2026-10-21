import { registerAppIpc } from './app.ipc'
import { registerWingetIpc } from './winget.ipc'
import { registerSystemIpc } from './system.ipc'
import { registerWindowIpc } from './window.ipc'
import { registerAiIpc } from './ai.ipc'
import { registerMemoryIpc } from './memory.ipc'
import { registerProjectIpc } from './project.ipc'
import { registerProjectsIpc } from './projects.ipc'
import { registerContactsIpc } from './contacts.ipc'
import { registerAiNetworkIpc } from './aiNetwork.ipc'
import { registerMinecraftIpc } from './minecraft.ipc'
import { registerFilesIpc } from './files.ipc'
import { registerOrbIpc } from './orb.ipc'

/**
 * Registers every feature's IPC handlers.
 *
 * Pattern for adding a new feature:
 *  1. Add its channel names to shared/ipc-channels.ts
 *  2. Add its data shapes to shared/types.ts
 *  3. Create src/main/services/<feature>/ with the real logic (or a TODO
 *     placeholder for now)
 *  4. Create src/main/ipc/<feature>.ipc.ts that wires ipcMain.handle(...)
 *     to that service
 *  5. Expose the matching function in src/preload/index.ts
 *  6. Register it below
 *
 * Keeping "receive the request" (ipc/) separate from "do the work"
 * (services/) means services stay pure and testable, and later the plugin
 * system can register services without touching this wiring.
 */
export function registerIpcHandlers(): void {
  registerAppIpc()
  registerWingetIpc()
  registerSystemIpc()
  registerWindowIpc()
  registerAiIpc()
  registerMemoryIpc()
  registerProjectIpc()
  registerProjectsIpc()
  registerContactsIpc()
  registerAiNetworkIpc()
  registerMinecraftIpc()
  registerFilesIpc()
  registerOrbIpc()
}
