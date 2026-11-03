import { registerCapability, getCapability } from '../../flameCore/capabilities'
import { launchApp } from '../../services/apps/launchApp'
import * as winget from '../../services/winget'
import { findBestMatch } from '../../services/winget/matchPackage'
import { executeCombo, saveCombo } from '../../services/combos'

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
        if (!args.confirmed) {
          return {
            success: false,
            message: `Installing ${match.name} (${match.id}) requires confirmation. Please use the confirmation card or Winget Manager.`
          }
        }
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
        if (!args.confirmed) {
          return {
            success: false,
            message: `Updating ${match.name} (${match.id}) requires confirmation. Please use the confirmation card or Winget Manager.`
          }
        }
        await winget.update(match.id)
        return { success: true, message: `Updated ${match.name}.` }
      } catch (err) {
        return { success: false, message: `Couldn't update "${app}": ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'windows.runCombo',
    label: 'Run a Combo',
    description: 'Executes a multi-step macro automation combo by name.',
    run: async (args) => {
      const comboName = (args.combo as string | undefined)?.trim()
      if (!comboName) return { success: false, message: 'Which combo should I run?' }
      try {
        const result = await executeCombo(comboName)
        return { success: result.success, message: result.message }
      } catch (err) {
        return { success: false, message: `Combo failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'windows.saveCombo',
    label: 'Save a Combo',
    description: 'Registers or updates a multi-step macro combo by name and steps/toDo.',
    run: async (args) => {
      const name = (args.name as string | undefined)?.trim()
      const toDo = (args.toDo as string | undefined)?.trim()
      const description = (args.description as string | undefined)?.trim()
      if (!name) return { success: false, message: 'Please provide a name for the combo.' }
      if (!toDo) return { success: false, message: 'Please provide the actions or steps for the combo.' }
      try {
        const saved = await saveCombo({ name, toDo, description })
        const stepSummary = saved.steps.map((s, idx) => `${idx + 1}. [${s.action}] ${s.target || ''}`).join(', ')
        return {
          success: true,
          message: `Combo "${saved.name}" has been registered with ${saved.steps.length} steps: ${stepSummary}.`
        }
      } catch (err) {
        return { success: false, message: `Failed to save combo: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'combos.save',
    label: 'Save a Combo',
    description: 'Registers or updates a multi-step macro combo by name and steps/toDo.',
    run: async (args) => {
      const cap = getCapability('windows.saveCombo')
      return cap ? cap.run(args) : { success: false, message: 'Combos service unavailable.' }
    }
  })

  registerCapability({
    id: 'combos.run',
    label: 'Run a Combo',
    description: 'Executes a multi-step macro automation combo by name.',
    run: async (args) => {
      const cap = getCapability('windows.runCombo')
      return cap ? cap.run(args) : { success: false, message: 'Combos service unavailable.' }
    }
  })
}
