// src/main/mcp/servers/whatsappServer.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { whatsappEngine, KAOMOJI_BANK } from '../../services/whatsapp/whatsappEngine'

const server = new Server(
  {
    name: 'flame-whatsapp-mcp',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'whatsapp.send_message',
        description: 'Send a WhatsApp message (with optional kaomoji or GIF) to a user or group JID.',
        inputSchema: {
          type: 'object',
          properties: {
            jid: { type: 'string', description: 'Target WhatsApp JID (e.g., 919876543210@s.whatsapp.net or group@g.us)' },
            text: { type: 'string', description: 'Message text to send' },
            gifQuery: { type: 'string', description: 'Optional GIF search query to attach' }
          },
          required: ['jid', 'text']
        }
      },
      {
        name: 'whatsapp.get_archived_media',
        description: 'Retrieve photos, videos, files, audio, or links saved while WhatsApp AI was active.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['photo', 'video', 'document', 'audio', 'link'],
              description: 'Optional filter by media type'
            },
            limit: { type: 'number', description: 'Max items to return (default 20)' }
          }
        }
      },
      {
        name: 'whatsapp.sync_brain_memory',
        description: 'Read or add facts/member notes to the shared FlameAGI + WhatsApp Brain memory.',
        inputSchema: {
          type: 'object',
          properties: {
            newFact: { type: 'string', description: 'Optional new fact to store in shared memory' },
            memberJid: { type: 'string', description: 'Optional member JID to attach a note to' },
            memberNote: { type: 'string', description: 'Custom note/vibe about that member' }
          }
        }
      },
      {
        name: 'whatsapp.get_qr',
        description: 'Get current WhatsApp pairing QR code status and base64 image data to link phone.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  if (name === 'whatsapp.send_message') {
    const jid = String(args.jid)
    const text = `${String(args.text)} ${KAOMOJI_BANK.happy[0]}`
    await whatsappEngine.sendDirectMessage(jid, text)
    if (args.gifQuery) {
      await whatsappEngine.sendGif(jid, String(args.gifQuery))
    }
    return {
      content: [{ type: 'text', text: `Sent WhatsApp message to ${jid}.` }]
    }
  }

  if (name === 'whatsapp.get_archived_media') {
    const items = whatsappEngine.getArchivedMedia(
      args.type ? String(args.type) : undefined,
      typeof args.limit === 'number' ? args.limit : 20
    )
    return {
      content: [{ type: 'text', text: JSON.stringify(items, null, 2) }]
    }
  }

  if (name === 'whatsapp.sync_brain_memory') {
    if (args.newFact) {
      await whatsappEngine.addSharedMemoryFact(String(args.newFact))
    }
    const brain = whatsappEngine.getSharedBrain()
    if (args.memberJid && args.memberNote) {
      const mJid = String(args.memberJid)
      if (brain.members[mJid]) {
        brain.members[mJid].customNotes.push(String(args.memberNote))
        await whatsappEngine.saveBrain()
      }
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(brain, null, 2) }]
    }
  }

  if (name === 'whatsapp.get_qr') {
    const status = whatsappEngine.getConnectionStatus()
    if (status.connected) {
      return {
        content: [{ type: 'text', text: 'WhatsApp is already connected and authenticated.' }]
      }
    }
    if (!status.qrDataUrl) {
      void whatsappEngine.start().catch(() => {})
      return {
        content: [{ type: 'text', text: 'WhatsApp engine starting. Generating QR code...' }]
      }
    }
    const base64Data = status.qrDataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '')
    return {
      content: [
        { type: 'text', text: 'Scan this QR code with WhatsApp on your phone (Linked Devices -> Link a Device).' },
        { type: 'image', data: base64Data, mimeType: 'image/png' }
      ]
    }
  }

  throw new Error(`Unknown WhatsApp MCP tool: ${name}`)
})

async function main(): Promise<void> {
  await whatsappEngine.start()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('[Flame WhatsApp MCP Fatal]:', err)
  process.exit(1)
})

