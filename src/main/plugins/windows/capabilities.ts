import { registerCapability } from '../../flameCore/capabilities'
import { launchApp } from '../../services/apps/launchApp'
import * as winget from '../../services/winget'
import { findBestMatch } from '../../services/winget/matchPackage'

export function registerWindowsCapabilities(): void {
  registerCapability({
    id: 'windows.launchApp',
    label: 'Launch an application',
    description: 'Opens an installed Windows app by name.',
    run: async (args) => {
      const app = (args.app as string | undefined)?.trim()
      if (!app) return { success: false, message: 'Which app did you want to open?' }
      return launchApp(app)
    }
  })

  registerCapability({
    id: 'winget.install',
    label: 'Install an application',
    description: 'Finds and installs an app via winget.',
    run: async (args) => {
      const app = (args.app as string | undefined)?.trim()
      if (!app) return { success: false, message: 'Which app should I install?' }
      try {
        const results = await winget.search(app)
        const match = findBestMatch(app, results)
        if (!match) return { success: false, message: `Couldn't find "${app}" in winget's catalog.` }
        await winget.install(match.id)
        return { success: true, message: `Installed ${match.name}.` }
      } catch (err) {
        return { success: false, message: `Couldn't install "${app}": ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'winget.update',
    label: 'Update an application',
    description: 'Finds and updates an app via winget.',
    run: async (args) => {
      const app = (args.app as string | undefined)?.trim()
      if (!app) return { success: false, message: 'Which app should I update?' }
      try {
        const upgradable = await winget.listUpgradable()
        const match = findBestMatch(app, upgradable)
        if (!match) return { success: false, message: `"${app}" doesn't have an update available (or isn't installed).` }
        await winget.update(match.id)
        return { success: true, message: `Updated ${match.name}.` }
      } catch (err) {
        return { success: false, message: `Couldn't update "${app}": ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}
