import { registerCapability, type CapabilityResult } from '../../flameCore/capabilities'
import { listDueMessages, addDueMessage, completeDueMessage } from '../../services/dueMessages'
import type { CreateDueMessageInput } from '@shared/types'

export function registerDueMessagesCapabilities(): void {
  registerCapability(
    {
      id: 'due.list',
      name: 'due.list',
      label: 'List Due Messages',
      description: 'List pending or deferred tasks and reminders.',
      pluginId: 'dueMessages',
      parameters: {
        status: { type: 'string', enum: ['pending', 'completed', 'dismissed'] },
        workspaceContext: { type: 'string' }
      },
      run: async (args: Record<string, unknown>): Promise<CapabilityResult> => {
        const items = await listDueMessages(args as any)
        return {
          success: true,
          message: `Found ${items.length} due message(s).`,
          data: items
        }
      }
    },
    'dueMessages'
  )

  registerCapability(
    {
      id: 'due.add',
      name: 'due.add',
      label: 'Add Due Message',
      description: 'Add a new deferred reminder or task.',
      pluginId: 'dueMessages',
      parameters: {
        title: { type: 'string', description: 'Task or reminder title' },
        content: { type: 'string' },
        dueHint: { type: 'string' }
      },
      run: async (args: Record<string, unknown>): Promise<CapabilityResult> => {
        const title = String(args.title || args.instruction || args.text || '').trim()
        if (!title) {
          return { success: false, message: 'Please provide a title for the due message.' }
        }
        const item = await addDueMessage({
          title,
          content: args.content ? String(args.content) : undefined,
          dueHint: args.dueHint ? String(args.dueHint) : undefined
        } as CreateDueMessageInput)
        return {
          success: true,
          message: `Saved due task: "${item.title}".`,
          data: item
        }
      }
    },
    'dueMessages'
  )

  registerCapability(
    {
      id: 'due.complete',
      name: 'due.complete',
      label: 'Complete Due Message',
      description: 'Mark a due task or reminder as completed.',
      pluginId: 'dueMessages',
      parameters: {
        idOrTitle: { type: 'string', description: 'ID or title substring' }
      },
      run: async (args: Record<string, unknown>): Promise<CapabilityResult> => {
        const needle = String(args.idOrTitle || args.id || args.title || '').trim()
        const completed = await completeDueMessage(needle)
        if (!completed) {
          return { success: false, message: `Could not find due message matching "${needle}".` }
        }
        return {
          success: true,
          message: `Completed due task: "${completed.title}".`,
          data: completed
        }
      }
    },
    'dueMessages'
  )
}

