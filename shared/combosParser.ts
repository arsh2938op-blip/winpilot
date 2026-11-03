import type { ComboStep } from './types'

function cleanTarget(str: string): string {
  return str.trim().replace(/^["']|["']$/g, '')
}

/**
 * Parses natural language To Do text or comma/newline separated instructions
 * into structured ComboSteps.
 */
export function parseMacroSteps(toDoText: string): ComboStep[] {
  if (!toDoText || !toDoText.trim()) return []

  // Split on newlines, commas, '&&', or semicolons
  const rawItems = toDoText
    .split(/[\r\n,;]+|(?:\s+&&\s+)/)
    .map((s) => s.trim())
    .filter(Boolean)

  const steps: ComboStep[] = []

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i]
    const lower = raw.toLowerCase().trim()

    // 1. Special System Commands
    if (
      lower === 'close yourself' ||
      lower === 'quit yourself' ||
      lower === 'exit flameagi' ||
      lower === 'quit flameagi' ||
      lower === 'shutdown flameagi' ||
      lower === 'exit app' ||
      lower === 'quit app' ||
      lower === 'close app'
    ) {
      steps.push({
        id: `step-${i + 1}`,
        action: 'system_command',
        target: 'close yourself',
        description: 'Shut down FlameAGI entirely'
      })
      continue
    }

    if (
      lower === 'close flame' ||
      lower === 'close flame window' ||
      lower === 'close main window' ||
      lower === 'exit flame' ||
      lower === 'hide flame' ||
      lower === 'close flame interface'
    ) {
      steps.push({
        id: `step-${i + 1}`,
        action: 'system_command',
        target: 'close flame',
        description: 'Close the main Flame window / backend session'
      })
      continue
    }

    if (
      lower === 'close pet mode' ||
      lower === 'dismiss pet mode' ||
      lower === 'terminate pet mode' ||
      lower === 'close pet' ||
      lower === 'disable pet mode' ||
      lower === 'close orb' ||
      lower === 'disable orb' ||
      lower === 'stop pet mode'
    ) {
      steps.push({
        id: `step-${i + 1}`,
        action: 'system_command',
        target: 'close pet mode',
        description: 'Dismiss Pet Mode companion'
      })
      continue
    }

    // 2. Window Focus
    const focusMatch = raw.match(/^(?:focus|switch to|bring to front|activate window)\s+(.+)$/i)
    if (focusMatch) {
      const target = cleanTarget(focusMatch[1])
      steps.push({
        id: `step-${i + 1}`,
        action: 'focus_window',
        target,
        description: `Focus window: ${target}`
      })
      continue
    }

    // 3. Terminal Commands
    const cmdMatch = raw.match(/^(?:cmd|run|exec|terminal|command|powershell|shell):\s*(.+)$/i)
    if (cmdMatch) {
      const target = cleanTarget(cmdMatch[1])
      steps.push({
        id: `step-${i + 1}`,
        action: 'command',
        target,
        description: `Execute terminal command: ${target}`
      })
      continue
    }

    // 4. Standard App Launching
    const launchMatch = raw.match(/^(?:open|launch|start)\s+(.+)$/i)
    if (launchMatch) {
      const target = cleanTarget(launchMatch[1])
      steps.push({
        id: `step-${i + 1}`,
        action: 'launch_app',
        target,
        description: `Launch ${target}`
      })
      continue
    }

    // 5. Default fallback: treat as app to launch
    steps.push({
      id: `step-${i + 1}`,
      action: 'launch_app',
      target: cleanTarget(raw),
      description: `Launch ${cleanTarget(raw)}`
    })
  }

  return steps
}

