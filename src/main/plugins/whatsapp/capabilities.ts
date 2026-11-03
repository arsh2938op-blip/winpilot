import { registerCapability } from '../../flameCore/capabilities'
import { whatsappEngine, KAOMOJI_BANK } from '../../services/whatsapp/whatsappEngine'

export function registerWhatsAppCapabilities(): void {
  registerCapability({
    id: 'whatsapp.send_message',
    name: 'Send WhatsApp Message',
    description: 'Sends a WhatsApp message with optional kaomoji or GIF to a user or group JID.',
    pluginId: 'whatsapp',
    run: async (args: Record<string, unknown>) => {
      const jid = String(args.jid || '').trim()
      const rawText = String(args.text || '').trim()
      if (!jid || !rawText) {
        return { success: false, message: 'Both "jid" and "text" are required to send a WhatsApp message.' }
      }

      try {
        const text = `${rawText} ${KAOMOJI_BANK.happy[0]}`
        await whatsappEngine.sendDirectMessage(jid, text)
        if (args.gifQuery) {
          await whatsappEngine.sendGif(jid, String(args.gifQuery))
        }
        return { success: true, message: `✅ Successfully sent WhatsApp message to ${jid}.` }
      } catch (err) {
        return {
          success: false,
          message: `Failed to send WhatsApp message: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }
  })

  registerCapability({
    id: 'whatsapp.get_archived_media',
    name: 'Get Archived WhatsApp Media',
    description: 'Retrieves photos, videos, files, audio, or links archived from WhatsApp chats.',
    pluginId: 'whatsapp',
    run: async (args: Record<string, unknown>) => {
      try {
        const type = args.type ? String(args.type).toLowerCase() : undefined
        const limit = typeof args.limit === 'number' ? args.limit : 20
        const items = whatsappEngine.getArchivedMedia(type, limit)
        if (items.length === 0) {
          return {
            success: true,
            message: type
              ? `No archived WhatsApp ${type}s found yet.`
              : 'No archived WhatsApp media or links found yet.'
          }
        }

        const formatted = items.map((item, idx) => {
          const detail = item.filePath ? `File: ${item.filePath}` : item.url ? `URL: ${item.url}` : ''
          return `${idx + 1}. [${item.type.toUpperCase()}] From ${item.senderName} (${item.timestamp.slice(0, 16)}): ${item.caption || '(no caption)'} ${detail}`
        }).join('\n')

        return {
          success: true,
          message: `📁 **Archived WhatsApp Media (${items.length} item(s)):**\n\n${formatted}`
        }
      } catch (err) {
        return {
          success: false,
          message: `Error retrieving WhatsApp media: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }
  })

  registerCapability({
    id: 'whatsapp.sync_brain_memory',
    name: 'Sync WhatsApp Brain Memory',
    description: 'Reads or adds facts and member notes to the shared Desktop + WhatsApp FlameAGI Brain.',
    pluginId: 'whatsapp',
    run: async (args: Record<string, unknown>) => {
      try {
        if (args.newFact) {
          await whatsappEngine.addSharedMemoryFact(String(args.newFact))
        }

        const brain = whatsappEngine.getSharedBrain()
        if (args.memberJid && args.memberNote) {
          const mJid = String(args.memberJid).trim()
          if (!brain.members[mJid]) {
            brain.members[mJid] = {
              jid: mJid,
              pushName: mJid.split('@')[0],
              customNotes: [],
              roleOrVibe: 'Member',
              warnings: 0,
              lastSeen: new Date().toISOString(),
              messageCount: 0
            }
          }
          brain.members[mJid].customNotes.push(String(args.memberNote).trim())
          await whatsappEngine.saveBrain()
        }

        const factsList = brain.flameSharedFacts.map((f, i) => `• Fact ${i + 1}: ${f}`).join('\n')
        const membersCount = Object.keys(brain.members).length
        const recentCount = brain.recentConversations.length

        return {
          success: true,
          message: `🧠 **Shared FlameAGI Brain Memory:**\n\n**Known Facts (${brain.flameSharedFacts.length}):**\n${factsList || 'None'}\n\n• Tracked WhatsApp Members: ${membersCount}\n• Recent Cross-Platform Turns: ${recentCount}`
        }
      } catch (err) {
        return {
          success: false,
          message: `Failed to sync WhatsApp brain memory: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }
  })
}

