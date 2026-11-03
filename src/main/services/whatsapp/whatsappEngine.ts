// src/main/services/whatsapp/whatsappEngine.ts
import type {
  WASocket,
  proto,
  WAMessage,
  WAMessageKey
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'
import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { getGoogleApiKey } from '../ai/googleKeyStore'

type BaileysModule = typeof import('@whiskeysockets/baileys')
let baileysModule: BaileysModule | null = null

async function getBaileys(): Promise<BaileysModule> {
  if (!baileysModule) {
    baileysModule = await (new Function('return import("@whiskeysockets/baileys")')() as Promise<BaileysModule>)
  }
  return baileysModule
}

// ============================================================================
// Interfaces & Shared Brain Types
// ============================================================================

export interface MemberProfile {
  jid: string
  pushName: string
  customNotes: string[]
  roleOrVibe: string
  warnings: number
  lastSeen: string
  messageCount: number
}

export interface ArchivedMediaItem {
  id: string
  type: 'photo' | 'video' | 'document' | 'audio' | 'link'
  senderJid: string
  senderName: string
  chatJid: string
  timestamp: string
  filePath?: string
  url?: string
  caption?: string
}

export interface SharedBrainState {
  flameSharedFacts: string[]
  members: Record<string, MemberProfile>
  badWords: string[]
  recentConversations: Array<{
    source: 'whatsapp' | 'desktop'
    sender: string
    text: string
    timestamp: string
  }>
}

interface SpamWindowEntry {
  timestamp: number
  key: WAMessageKey
  text: string
}

// ============================================================================
// Kaomoji & Constants Bank
// ============================================================================

export const KAOMOJI_BANK = {
  happy: ['(≧◡≦)', '(★^O^★)', '(◕‿◕✨)', 'ヽ(>∀<☆)ノ'],
  cool: ['(⌐■_■)', '(▀̿Ĺ̯▀̿ ̿)', '¯\\_(ツ)_/¯', '(¬‿¬)'],
  angry: ['(╬ Ò﹏Ó)', '(ノಠ益ಠ)ノ彡┻━┻', '(￣^￣)ゞ'],
  magic: ['(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '╰( ͡° ͜ʖ ͡° )つ──☆*:・ﾟ'],
  sad: ['(╥﹏╥)', '(;´༎ຶД༎ຶ`)', '(｡•́︿•̀｡)']
}

const DEFAULT_BAD_WORDS = [
  'abuseword1',
  'slur1',
  'idiot_spam_test',
  'fuck',
  'bitch',
  'asshole',
  'bastard',
  'motherfucker',
  'cunt'
]

const MAX_WARNINGS = 7
const SPAM_MESSAGE_LIMIT = 10
const SPAM_WINDOW_MS = 12_000 // 12 seconds window for 10+ rapid messages

// ============================================================================
// WhatsApp AI Engine Class
// ============================================================================

export class FlameWhatsAppEngine {
  private sock: WASocket | null = null
  private baseDir: string
  private authDir: string
  private stateFile: string
  private mediaDir: string
  private mediaIndexFile: string
  private brain: SharedBrainState
  private mediaIndex: ArchivedMediaItem[] = []
  private spamTracker: Map<string, SpamWindowEntry[]> = new Map()
  private geminiApiKey: string
  private geminiModel: string
  private isStarting = false
  public isConnected = false
  private latestQrDataUrl: string | null = null
  private latestRawQr: string | null = null
  private connectionStatus: 'disconnected' | 'qr_ready' | 'connected' = 'disconnected'

  public getConnectionStatus(): {
    connected: boolean
    status: 'disconnected' | 'qr_ready' | 'connected'
    qrDataUrl: string | null
  } {
    return {
      connected: this.isConnected,
      status: this.connectionStatus,
      qrDataUrl: this.latestQrDataUrl
    }
  }

  public getLatestQrDataUrl(): string | null {
    return this.latestQrDataUrl
  }

  private broadcastStatus(): void {
    try {
      const payload = this.getConnectionStatus()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('whatsapp:qr-updated', payload)
        }
      }
    } catch {
      // ignore
    }
  }

  constructor(workspaceRoot?: string) {
    const root =
      workspaceRoot ||
      (fsSync.existsSync(path.join(process.cwd(), '.flame'))
        ? process.cwd()
        : fsSync.existsSync(path.resolve(process.cwd(), '..', '.flame'))
          ? path.resolve(process.cwd(), '..')
          : process.cwd())

    this.baseDir = path.join(root, '.flame')
    this.authDir = path.join(this.baseDir, 'state', 'whatsapp_auth')
    this.stateFile = path.join(this.baseDir, 'state', 'whatsapp_memory.json')
    this.mediaDir = path.join(this.baseDir, 'whatsapp_media')
    this.mediaIndexFile = path.join(this.mediaDir, 'media_index.json')

    this.geminiApiKey = process.env.GEMINI_API_KEY || ''
    this.geminiModel = process.env.FLAME_GEMINI_MODEL || 'gemini-2.5-flash'

    this.brain = {
      flameSharedFacts: [
        'I am FlameAGI, operating across Desktop and WhatsApp with one shared memory.'
      ],
      members: {},
      badWords: DEFAULT_BAD_WORDS,
      recentConversations: []
    }
  }

  // --------------------------------------------------------------------------
  // 1. Initialization & Persistence
  // --------------------------------------------------------------------------

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.authDir,
      path.dirname(this.stateFile),
      path.join(this.mediaDir, 'photos'),
      path.join(this.mediaDir, 'videos'),
      path.join(this.mediaDir, 'files'),
      path.join(this.mediaDir, 'audio')
    ]
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true })
    }

    if (fsSync.existsSync(this.stateFile)) {
      try {
        const raw = await fs.readFile(this.stateFile, 'utf-8')
        const parsed = JSON.parse(raw)
        this.brain = { ...this.brain, ...parsed }
      } catch {
        // Keep default state if corrupted
      }
    } else {
      await this.saveBrain()
    }

    if (fsSync.existsSync(this.mediaIndexFile)) {
      try {
        const raw = await fs.readFile(this.mediaIndexFile, 'utf-8')
        this.mediaIndex = JSON.parse(raw)
      } catch {
        this.mediaIndex = []
      }
    }
  }

  public async saveBrain(): Promise<void> {
    if (this.brain.recentConversations.length > 80) {
      this.brain.recentConversations = this.brain.recentConversations.slice(-80)
    }
    await fs.writeFile(this.stateFile, JSON.stringify(this.brain, null, 2), 'utf-8')
  }

  private async saveMediaIndex(): Promise<void> {
    await fs.writeFile(this.mediaIndexFile, JSON.stringify(this.mediaIndex, null, 2), 'utf-8')
  }

  // --------------------------------------------------------------------------
  // 2. Start Socket & QR / Reconnect Loop
  // --------------------------------------------------------------------------

  public async start(): Promise<void> {
    if (this.sock || this.isStarting) return
    this.isStarting = true

    try {
      await this.ensureDirectories()
      const baileys = await getBaileys()
      const { useMultiFileAuthState, DisconnectReason } = baileys
      const makeWASocket = baileys.default || baileys.makeWASocket
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir)

      const socketFactory =
        typeof makeWASocket === 'function'
          ? makeWASocket
          : (makeWASocket as unknown as { default: typeof makeWASocket }).default

      this.sock = socketFactory({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['FlameAGI-Companion', 'Chrome', '2.0.0']
      })

      this.sock.ev.on('creds.update', saveCreds)

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) {
          this.latestRawQr = qr
          this.connectionStatus = 'qr_ready'
          console.log('\n[FlameAGI WhatsApp] Scan this QR code with your WhatsApp phone app:')
          qrcode.generate(qr, { small: true })
          try {
            this.latestQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 })
            this.broadcastStatus()
          } catch (err) {
            console.error('[FlameAGI WhatsApp] Failed to render QR to data URL:', err)
          }
        }

        if (connection === 'close') {
          this.isConnected = false
          this.connectionStatus = 'disconnected'
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut
          console.log(`[FlameAGI WhatsApp] Connection closed. Reconnecting: ${shouldReconnect}`)
          this.sock = null
          this.broadcastStatus()
          if (shouldReconnect) {
            setTimeout(() => {
              void this.start().catch((err) => console.error('[FlameAGI WhatsApp Reconnect Failed]:', err))
            }, 5000)
          }
        } else if (connection === 'open') {
          this.isConnected = true
          this.connectionStatus = 'connected'
          this.latestQrDataUrl = null
          this.latestRawQr = null
          console.log('[FlameAGI WhatsApp] Connected and active! Shared Brain & Moderation online.')
          this.broadcastStatus()
        }
      })

      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
          await this.handleIncomingMessage(msg).catch((err) =>
            console.error('[FlameAGI WhatsApp Error]:', err)
          )
        }
      })
    } catch (err) {
      console.error('[FlameAGI WhatsApp Start Failed]:', err)
    } finally {
      this.isStarting = false
    }
  }

  public async stop(): Promise<void> {
    if (this.sock) {
      try {
        this.sock.end(undefined)
      } catch {
        // ignore
      }
      this.sock = null
      this.isConnected = false
      this.connectionStatus = 'disconnected'
      this.latestQrDataUrl = null
      this.latestRawQr = null
      this.broadcastStatus()
    }
  }

  // --------------------------------------------------------------------------
  // 3. Member Memory & Profile Tracking
  // --------------------------------------------------------------------------

  private getOrUpdateMember(senderJid: string, pushName?: string | null): MemberProfile {
    if (!this.brain.members[senderJid]) {
      this.brain.members[senderJid] = {
        jid: senderJid,
        pushName: pushName || senderJid.split('@')[0],
        customNotes: [],
        roleOrVibe: 'Group Member',
        warnings: 0,
        lastSeen: new Date().toISOString(),
        messageCount: 0
      }
    }
    const profile = this.brain.members[senderJid]
    if (pushName && pushName.trim()) {
      profile.pushName = pushName.trim()
    }
    profile.lastSeen = new Date().toISOString()
    profile.messageCount += 1
    return profile
  }

  // --------------------------------------------------------------------------
  // 4. Active Media & Link Archiver (Photos, Videos, Files, Audio, Links)
  // --------------------------------------------------------------------------

  private async archiveMediaAndLinks(
    msg: proto.IWebMessageInfo,
    chatJid: string,
    senderJid: string,
    senderName: string,
    textBody: string
  ): Promise<void> {
    if (!msg.message) return

    // A. Extract & Archive Links
    const urlRegex = /https?:\/\/[^\s<>"]+/gi
    const links = textBody.match(urlRegex)
    if (links && links.length > 0) {
      for (const url of links) {
        this.mediaIndex.push({
          id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'link',
          senderJid,
          senderName,
          chatJid,
          timestamp: new Date().toISOString(),
          url,
          caption: textBody
        })
      }
      await this.saveMediaIndex()
    }

    // B. Download & Archive Photos, Videos, Documents, Audio
    const m = msg.message
    let mediaType: 'photo' | 'video' | 'document' | 'audio' | null = null
    let subFolder = 'files'
    let ext = 'bin'
    let caption = ''

    if (m.imageMessage) {
      mediaType = 'photo'
      subFolder = 'photos'
      ext = 'jpg'
      caption = m.imageMessage.caption || ''
    } else if (m.videoMessage) {
      mediaType = 'video'
      subFolder = 'videos'
      ext = 'mp4'
      caption = m.videoMessage.caption || ''
    } else if (m.documentMessage) {
      mediaType = 'document'
      subFolder = 'files'
      const origName = m.documentMessage.fileName || 'file.bin'
      ext = path.extname(origName).replace('.', '') || 'bin'
      caption = m.documentMessage.caption || origName
    } else if (m.audioMessage) {
      mediaType = 'audio'
      subFolder = 'audio'
      ext = 'ogg'
    }

    if (mediaType && this.sock) {
      try {
        const baileys = await getBaileys()
        const buffer = (await baileys.downloadMediaMessage(
          msg as WAMessage,
          'buffer',
          {},
          {
            logger: pino({ level: 'silent' }),
            reuploadRequest: this.sock.updateMediaMessage
          }
        )) as Buffer

        const safeSender = senderJid.split('@')[0].replace(/[^a-zA-Z0-9]/g, '')
        const fileName = `${Date.now()}_${safeSender}.${ext}`
        const fullPath = path.join(this.mediaDir, subFolder, fileName)

        await fs.writeFile(fullPath, buffer)

        this.mediaIndex.push({
          id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: mediaType,
          senderJid,
          senderName,
          chatJid,
          timestamp: new Date().toISOString(),
          filePath: fullPath,
          caption
        })
        await this.saveMediaIndex()
      } catch (err) {
        console.error('[FlameAGI Media Archive Failed]:', err)
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. Abuse & Spam Detection (With 1/7 Warning Counter + Auto-Kick)
  // --------------------------------------------------------------------------

  private containsAbuse(text: string): string | null {
    const lower = text.toLowerCase()
    for (const word of this.brain.badWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'i')
      if (regex.test(lower)) {
        return word
      }
    }
    return null
  }

  private isRubbishText(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.length < 4) return false
    // 1. Massive unbroken string without spaces (>55 chars) and not a URL
    if (trimmed.length > 55 && !trimmed.includes(' ') && !trimmed.startsWith('http')) {
      return true
    }
    // 2. Repeated single character flood (e.g., "aaaaaaaaaaaaaaa")
    if (/(.)\1{11,}/i.test(trimmed)) {
      return true
    }
    // 3. Random symbol/consonant mash (>18 consecutive consonants)
    if (/[bcdfghjklmnpqrstvwxz]{18,}/i.test(trimmed)) {
      return true
    }
    return false
  }

  private async issueWarningAndEnforce(
    chatJid: string,
    senderJid: string,
    reason: string,
    offendingKeys: WAMessageKey[]
  ): Promise<void> {
    if (!this.sock) return

    // 1. Delete all offending messages immediately
    for (const key of offendingKeys) {
      try {
        await this.sock.sendMessage(chatJid, { delete: key })
      } catch {
        // Ignore if bot lacks admin rights in this group
      }
    }

    // 2. Increment warning count (1/7 -> 7/7)
    const member = this.getOrUpdateMember(senderJid)
    member.warnings += 1
    const currentWarn = member.warnings
    await this.saveBrain()

    const tagUser = `@${senderJid.split('@')[0]}`

    if (currentWarn >= MAX_WARNINGS) {
      await this.sock.sendMessage(chatJid, {
        text: `🚨 *FLAME MODERATION*\n${tagUser} has reached *${currentWarn}/${MAX_WARNINGS}* warnings for *${reason}*.\nExecuting automatic removal from group! (╬ Ò﹏Ó)`,
        mentions: [senderJid]
      })

      if (chatJid.endsWith('@g.us')) {
        try {
          await this.sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove')
          member.warnings = 0
          await this.saveBrain()
        } catch {
          await this.sock.sendMessage(chatJid, {
            text: `⚠️ Could not kick ${tagUser} — make sure FlameAGI is a Group Admin!`
          })
        }
      }
    } else {
      await this.sock.sendMessage(chatJid, {
        text: `⚠️ *FLAME WARNING [${currentWarn}/${MAX_WARNINGS}]*\n${tagUser}, your message was deleted.\n*Reason:* ${reason}\n_Reaching 7/7 warnings results in an automatic kick._ (￣^￣)ゞ`,
        mentions: [senderJid]
      })
    }
  }

  private async checkModerationGuards(
    msg: proto.IWebMessageInfo,
    chatJid: string,
    senderJid: string,
    text: string
  ): Promise<boolean> {
    if (!msg.key) return false

    // Guard 1: Abuse Detection
    const matchedBadWord = this.containsAbuse(text)
    if (matchedBadWord) {
      await this.issueWarningAndEnforce(
        chatJid,
        senderJid,
        'Abusive / Prohibited Language',
        [msg.key]
      )
      return true
    }

    // Guard 2: Sliding-Window Spam & Rubbish Detection (>10 messages or rubbish flood)
    const now = Date.now()
    const history = this.spamTracker.get(senderJid) || []
    const recent = history.filter((item) => now - item.timestamp < SPAM_WINDOW_MS)
    recent.push({ timestamp: now, key: msg.key, text })
    this.spamTracker.set(senderJid, recent)

    const rubbishCount = recent.filter((item) => this.isRubbishText(item.text)).length
    const duplicateCount = recent.filter(
      (item) => item.text.trim().toLowerCase() === text.trim().toLowerCase() && text.length > 0
    ).length

    if (recent.length > SPAM_MESSAGE_LIMIT || rubbishCount >= 4 || duplicateCount >= 6) {
      const keysToDelete = recent.map((item) => item.key)
      this.spamTracker.set(senderJid, []) // Reset window after punishing
      await this.issueWarningAndEnforce(
        chatJid,
        senderJid,
        'Spam / Rubbish Message Flood (>10 rapid or gibberish messages)',
        keysToDelete
      )
      return true
    }

    return false
  }

  // --------------------------------------------------------------------------
  // 6. Admin & Utility Commands (!kick, !delete, !warn, !remember, !gif, etc.)
  // --------------------------------------------------------------------------

  private async isGroupAdmin(chatJid: string, userJid: string): Promise<boolean> {
    if (!this.sock || !chatJid.endsWith('@g.us')) return true
    try {
      const metadata = await this.sock.groupMetadata(chatJid)
      const participant = metadata.participants.find((p) => p.id === userJid)
      return Boolean(participant?.admin)
    } catch {
      return false
    }
  }

  private async handleAdminCommands(
    msg: proto.IWebMessageInfo,
    chatJid: string,
    senderJid: string,
    text: string
  ): Promise<boolean> {
    if (!this.sock || !text.startsWith('!')) return false

    const args = text.trim().split(/\s+/)
    const cmd = args[0].toLowerCase()
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo
    const quotedSender = contextInfo?.participant
    const mentionedJids = contextInfo?.mentionedJid || []
    const targetJid = mentionedJids[0] || quotedSender

    // Public Commands
    if (cmd === '!profile') {
      const lookupJid = targetJid || senderJid
      const prof = this.getOrUpdateMember(lookupJid)
      const notes = prof.customNotes.length ? prof.customNotes.join('; ') : 'None saved yet'
      await this.sock.sendMessage(chatJid, {
        text: `👤 *Member Profile: ${prof.pushName}*\n• *Role/Vibe:* ${prof.roleOrVibe}\n• *Warnings:* ${prof.warnings}/${MAX_WARNINGS}\n• *Messages Tracked:* ${prof.messageCount}\n• *Brain Notes:* ${notes} (◕‿◕✨)`
      })
      return true
    }

    if (cmd === '!gif') {
      const query = args.slice(1).join(' ') || 'anime hype'
      await this.sendGif(chatJid, query, `Here's your GIF for *${query}*! (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧`)
      return true
    }

    // Admin-Only Commands
    const adminCommands = ['!delete', '!del', '!kick', '!warn', '!resetwarn', '!remember', '!addbadword']
    if (!adminCommands.includes(cmd)) return false

    const isAdmin = await this.isGroupAdmin(chatJid, senderJid)
    if (!isAdmin && !msg.key?.fromMe) {
      await this.sock.sendMessage(chatJid, {
        text: `⛔ Only Group Admins can use *${cmd}*! (⌐■_■)`
      })
      return true
    }

    // !delete / !del (Deletes replied message)
    if (cmd === '!delete' || cmd === '!del') {
      if (!contextInfo?.stanzaId) {
        await this.sock.sendMessage(chatJid, { text: 'Reply to a message with *!delete* to remove it.' })
        return true
      }
      const deleteKey: WAMessageKey = {
        remoteJid: chatJid,
        fromMe: false,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      }
      await this.sock.sendMessage(chatJid, { delete: deleteKey })
      if (msg.key) {
        await this.reactToMessage(chatJid, msg.key as WAMessageKey, '🗑️')
      }
      return true
    }

    // !kick
    if (cmd === '!kick') {
      if (!targetJid) {
        await this.sock.sendMessage(chatJid, { text: 'Tag a user or reply to their message with *!kick*.' })
        return true
      }
      await this.sock.groupParticipantsUpdate(chatJid, [targetJid], 'remove')
      await this.sock.sendMessage(chatJid, {
        text: `👢 Kicked @${targetJid.split('@')[0]} from the group! (▀̿Ĺ̯▀̿ ̿)`,
        mentions: [targetJid]
      })
      return true
    }

    // !warn
    if (cmd === '!warn') {
      if (!targetJid) {
        await this.sock.sendMessage(chatJid, { text: 'Tag or reply to a user with *!warn [reason]*.' })
        return true
      }
      const reason = args.slice(1).filter((a) => !a.startsWith('@')).join(' ') || 'Admin Warning'
      await this.issueWarningAndEnforce(chatJid, targetJid, reason, [])
      return true
    }

    // !resetwarn
    if (cmd === '!resetwarn') {
      if (!targetJid) return true
      const prof = this.getOrUpdateMember(targetJid)
      prof.warnings = 0
      await this.saveBrain()
      await this.sock.sendMessage(chatJid, {
        text: `✅ Reset warnings for @${targetJid.split('@')[0]} back to *0/${MAX_WARNINGS}*! (≧◡≦)`,
        mentions: [targetJid]
      })
      return true
    }

    // !remember @user <custom data>
    if (cmd === '!remember') {
      if (!targetJid) {
        await this.sock.sendMessage(chatJid, {
          text: 'Usage: *!remember @user <facts about them>*'
        })
        return true
      }
      const note = args.slice(1).filter((a) => !a.startsWith('@')).join(' ')
      if (note) {
        const prof = this.getOrUpdateMember(targetJid)
        prof.customNotes.push(note)
        await this.saveBrain()
        await this.sock.sendMessage(chatJid, {
          text: `🧠 *Flame Brain Updated!* I will remember about @${targetJid.split('@')[0]}: _"${note}"_ (★^O^★)`,
          mentions: [targetJid]
        })
      }
      return true
    }

    // !addbadword <word>
    if (cmd === '!addbadword') {
      const newWord = args[1]?.toLowerCase()
      if (newWord && !this.brain.badWords.includes(newWord)) {
        this.brain.badWords.push(newWord)
        await this.saveBrain()
        await this.sock.sendMessage(chatJid, { text: `🛡️ Added *"${newWord}"* to abuse filter.` })
      }
      return true
    }

    return false
  }

  // --------------------------------------------------------------------------
  // 7. Reactions, GIFs & Connected Gemini Brain
  // --------------------------------------------------------------------------

  public async reactToMessage(chatJid: string, key: WAMessageKey, emoji: string): Promise<void> {
    if (!this.sock) return
    await this.sock.sendMessage(chatJid, {
      react: { text: emoji, key }
    })
  }

  public async sendGif(chatJid: string, searchQuery: string, caption = ''): Promise<void> {
    if (!this.sock) return
    let targetJid = chatJid.trim()
    if (!targetJid.includes('@')) {
      const cleanDigits = targetJid.replace(/\D/g, '')
      targetJid = `${cleanDigits}@s.whatsapp.net`
    }
    try {
      // Public Tenor anonymous demo key for instant MP4 GIF lookup
      const tenorKey = process.env.TENOR_API_KEY || 'LIVDSRZULELA'
      const url = `https://g.tenor.com/v1/search?q=${encodeURIComponent(searchQuery)}&key=${tenorKey}&limit=1`
      const res = await fetch(url)
      const data = (await res.json()) as { results?: Array<{ media?: Array<{ mp4?: { url?: string } }> }> }
      const mp4Url = data?.results?.[0]?.media?.[0]?.mp4?.url

      if (mp4Url) {
        await this.sock.sendMessage(targetJid, {
          video: { url: mp4Url },
          gifPlayback: true,
          caption
        })
      } else {
        await this.sock.sendMessage(targetJid, { text: `${caption} ${KAOMOJI_BANK.magic[0]}` })
      }
    } catch {
      await this.sock.sendMessage(targetJid, { text: `${caption} ${KAOMOJI_BANK.happy[0]}` })
    }
  }

  private async generateFlameReply(
    senderProfile: MemberProfile,
    userMessage: string
  ): Promise<{ replyText: string; reactionEmoji: string | null; gifQuery: string | null }> {
    const recentChatContext = this.brain.recentConversations
      .slice(-12)
      .map((c) => `[${c.source.toUpperCase()}] ${c.sender}: ${c.text}`)
      .join('\n')

    const systemPrompt = `You are FlameAGI, an intelligent, witty AI assistant operating simultaneously on the user's Windows Desktop and WhatsApp with one shared brain.
Current Speaker: ${senderProfile.pushName} (${senderProfile.jid})
Speaker Role/Vibe: ${senderProfile.roleOrVibe}
Known Facts about Speaker: ${senderProfile.customNotes.join('; ') || 'No special notes yet'}
Speaker Warnings: ${senderProfile.warnings}/${MAX_WARNINGS}
Shared Flame Facts: ${this.brain.flameSharedFacts.join(' | ')}${(() => {
      try {
        const mcFile = path.join(this.baseDir, 'state', 'minecraft_state.json');
        if (fsSync.existsSync(mcFile)) {
          const m = JSON.parse(fsSync.readFileSync(mcFile, 'utf8'));
          return ' | Minecraft Guard: ' + m.botName + ' (' + (m.leaderDefense?.defenseSummary || 'Guarding ' + m.leaderDefense?.targetLeader) + ', HP: ' + m.health + '/20, Coords: ' + (m.position ? m.position.x + ',' + m.position.y + ',' + m.position.z : 'N/A') + ', Action: ' + m.currentAction + ')';
        }
      } catch {}
      return '';
    })()}

Recent Cross-Platform Memory (Desktop + WhatsApp):
${recentChatContext}

Style Rules:
1. Talk naturally like a smart peer, using emojis and expressive kaomojis like (≧◡≦), (⌐■_■), ¯\\_(ツ)_/¯, or (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧.
2. Tailor how you talk to ${senderProfile.pushName} based on their Known Facts and Role.
3. Optional Control Tags at the very end of your response:
   - Include [REACT:🔥] (with any single emoji) if you want to react to their message.
   - Include [GIF:search query] if a reaction GIF would make the reply awesome.`

    let apiKey = this.geminiApiKey
    if (!apiKey) {
      try {
        apiKey = (await getGoogleApiKey()) || ''
      } catch {
        // ignore
      }
    }

    if (!apiKey) {
      return {
        replyText: `Hey ${senderProfile.pushName}! FlameAGI is online ${KAOMOJI_BANK.cool[0]} (Configure Gemini API key to unlock full LLM chat!)`,
        reactionEmoji: '⚡',
        gifQuery: null
      }
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${apiKey}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        })
      })

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      let rawText: string =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        `Got it, ${senderProfile.pushName}! ${KAOMOJI_BANK.happy[0]}`

      let reactionEmoji: string | null = null
      let gifQuery: string | null = null

      const reactMatch = rawText.match(/\[REACT:([^\]]+)\]/i)
      if (reactMatch) {
        reactionEmoji = reactMatch[1].trim()
        rawText = rawText.replace(reactMatch[0], '').trim()
      }

      const gifMatch = rawText.match(/\[GIF:([^\]]+)\]/i)
      if (gifMatch) {
        gifQuery = gifMatch[1].trim()
        rawText = rawText.replace(gifMatch[0], '').trim()
      }

      return { replyText: rawText, reactionEmoji, gifQuery }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        replyText: `Brain sync hiccup: ${errMsg} ${KAOMOJI_BANK.sad[0]}`,
        reactionEmoji: '⚠️',
        gifQuery: null
      }
    }
  }

  // --------------------------------------------------------------------------
  // 8. Main Incoming Message Router
  // --------------------------------------------------------------------------

  private async handleIncomingMessage(msg: proto.IWebMessageInfo): Promise<void> {
    if (!msg.key || !msg.message || !msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') return

    const key = msg.key as WAMessageKey
    const chatJid = key.remoteJid!
    const isGroup = chatJid.endsWith('@g.us')
    const senderJid = isGroup ? key.participant || chatJid : chatJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ''

    const member = this.getOrUpdateMember(senderJid, msg.pushName)

    // 1. Always archive incoming photos, videos, files, audio, and links while active
    await this.archiveMediaAndLinks(msg, chatJid, senderJid, member.pushName, text)

    if (!text.trim() || key.fromMe) return

    // 2. Run Abuse & Spam Moderation Guards (Skip if message is from bot itself)
    const blockedByModeration = await this.checkModerationGuards(msg, chatJid, senderJid, text)
    if (blockedByModeration) return

    // 3. Handle !admin and utility commands
    const handledCommand = await this.handleAdminCommands(msg, chatJid, senderJid, text)
    if (handledCommand) return

    // 4. Record to Shared Brain Memory
    this.brain.recentConversations.push({
      source: 'whatsapp',
      sender: member.pushName,
      text,
      timestamp: new Date().toISOString()
    })
    await this.saveBrain()

    // 5. Decide if Flame should reply (DM, or tagged/named "flame" in group, or replied to bot)
    const botMentioned =
      !isGroup ||
      /\bflame\b/i.test(text) ||
      Boolean(
        msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.some((jid) =>
          jid.includes(this.sock?.user?.id?.split(':')[0] || '___')
        )
      )

    if (botMentioned && this.sock) {
      const { replyText, reactionEmoji, gifQuery } = await this.generateFlameReply(member, text)

      if (reactionEmoji) {
        await this.reactToMessage(chatJid, key, reactionEmoji)
      }

      await this.sock.sendMessage(chatJid, { text: replyText }, { quoted: msg as WAMessage })

      if (gifQuery) {
        await this.sendGif(chatJid, gifQuery)
      }

      this.brain.recentConversations.push({
        source: 'whatsapp',
        sender: 'FlameAGI',
        text: replyText,
        timestamp: new Date().toISOString()
      })
      await this.saveBrain()
    }
  }

  // --------------------------------------------------------------------------
  // 9. Public Methods for FlameCore Desktop / MCP Server Access
  // --------------------------------------------------------------------------

  public async sendDirectMessage(jid: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp socket is not connected.')
    let targetJid = jid.trim()
    if (!targetJid.includes('@')) {
      const cleanDigits = targetJid.replace(/\D/g, '')
      targetJid = `${cleanDigits}@s.whatsapp.net`
    }
    await this.sock.sendMessage(targetJid, { text })
  }

  public getArchivedMedia(filterType?: string, limit = 25): ArchivedMediaItem[] {
    const items = filterType
      ? this.mediaIndex.filter((m) => m.type === filterType)
      : this.mediaIndex
    return items.slice(-limit)
  }

  public getSharedBrain(): SharedBrainState {
    return this.brain
  }

  public async addSharedMemoryFact(fact: string): Promise<void> {
    this.brain.flameSharedFacts.push(fact)
    await this.saveBrain()
  }

  public async addDesktopConversation(sender: string, text: string): Promise<void> {
    this.brain.recentConversations.push({
      source: 'desktop',
      sender,
      text,
      timestamp: new Date().toISOString()
    })
    await this.saveBrain()
  }
}

export const whatsappEngine = new FlameWhatsAppEngine()
