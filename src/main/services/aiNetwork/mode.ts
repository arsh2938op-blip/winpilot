import type { ChatMode } from '@shared/types'

/**
 * The renderer owns the Chat/Task toggle (persisted in localStorage), but the
 * main process needs to know which pipeline ran for the AI Network panel and
 * telemetry. The router updates this on every prompt.
 */
let activeMode: ChatMode = 'chat'

export function setActiveChatMode(mode: ChatMode): void {
  activeMode = mode
}

export function getActiveChatMode(): ChatMode {
  return activeMode
}
