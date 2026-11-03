// src/main/mcp/servers/browserServer.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'

const execAsync = promisify(exec)

const QUICK_SITES: Record<string, string> = {
  youtube: 'https://www.youtube.com',
  github: 'https://github.com',
  gmail: 'https://mail.google.com/mail/u/0/#inbox',
  drive: 'https://drive.google.com/drive/my-drive',
  calendar: 'https://calendar.google.com/calendar/u/0/r',
  docs: 'https://docs.google.com/document/u/0/',
  sheets: 'https://docs.google.com/spreadsheets/u/0/',
  whatsapp: 'https://web.whatsapp.com',
  roblox: 'https://www.roblox.com/home',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://aistudio.google.com'
}

function openUrlInWindowsBrowser(url: string, browserApp?: string): Promise<void> {
  const safeUrl = url.replace(/"/g, '%22')
  const cmd = browserApp
    ? `cmd /c start "" "${browserApp}" "${safeUrl}"`
    : `cmd /c start "" "${safeUrl}"`
  return execAsync(cmd).then(() => undefined)
}

const server = new Server(
  { name: 'flame-browser-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browser.open_url',
      description: 'Instantly open any URL or website in the default Windows browser (zero extra RAM).',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL or domain (e.g., https://youtube.com)' },
          browser: { type: 'string', description: 'Optional specific browser executable (msedge, chrome)' }
        },
        required: ['url']
      }
    },
    {
      name: 'browser.search_and_open',
      description: 'Open a popular site, Google Workspace app (Gmail, Drive, Calendar, Docs), or run a direct search on YouTube/Google/GitHub.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['google', 'youtube', 'github', 'gmail', 'drive', 'calendar', 'docs', 'sheets', 'roblox', 'direct'],
            description: 'Target platform or Google app'
          },
          query: { type: 'string', description: 'Search query or topic to open' }
        },
        required: ['platform']
      }
    },
    {
      name: 'browser.automate_page',
      description: 'Use Playwright (via system Edge/Chrome) to navigate to a page, click selectors, fill inputs, and extract live DOM text.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target URL to automate' },
          waitForSelector: { type: 'string', description: 'Optional CSS selector to wait for' },
          clickSelector: { type: 'string', description: 'Optional CSS selector to click' },
          fillSelector: { type: 'string', description: 'Optional CSS input selector to type into' },
          fillText: { type: 'string', description: 'Text to type into fillSelector' },
          extractText: { type: 'boolean', description: 'Extract visible page text (default true)' }
        },
        required: ['url']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  if (name === 'browser.open_url') {
    let rawUrl = String(args.url || '').trim()
    if (QUICK_SITES[rawUrl.toLowerCase()]) {
      rawUrl = QUICK_SITES[rawUrl.toLowerCase()]
    } else if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = `https://${rawUrl}`
    }
    await openUrlInWindowsBrowser(rawUrl, args.browser ? String(args.browser) : undefined)
    return { content: [{ type: 'text', text: `Opened ${rawUrl} in Windows browser.` }] }
  }

  if (name === 'browser.search_and_open') {
    const platform = String(args.platform || 'google').toLowerCase()
    const q = encodeURIComponent(String(args.query || '').trim())
    let targetUrl = QUICK_SITES[platform] || 'https://www.google.com'

    if (q) {
      if (platform === 'google') targetUrl = `https://www.google.com/search?q=${q}`
      else if (platform === 'youtube') targetUrl = `https://www.youtube.com/results?search_query=${q}`
      else if (platform === 'github') targetUrl = `https://github.com/search?q=${q}`
      else if (platform === 'drive') targetUrl = `https://drive.google.com/drive/search?q=${q}`
      else if (platform === 'gmail') targetUrl = `https://mail.google.com/mail/u/0/#search/${q}`
      else if (platform === 'roblox') targetUrl = `https://www.roblox.com/discover/?Keyword=${q}`
    }

    await openUrlInWindowsBrowser(targetUrl)
    return { content: [{ type: 'text', text: `Launched ${platform} at ${targetUrl}` }] }
  }

  if (name === 'browser.automate_page') {
    const url = String(args.url)
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true
    }).catch(() => chromium.launch({ channel: 'chrome', headless: true }))

    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

      if (args.waitForSelector) {
        await page.waitForSelector(String(args.waitForSelector), { timeout: 8000 })
      }
      if (args.fillSelector && args.fillText !== undefined) {
        await page.fill(String(args.fillSelector), String(args.fillText))
      }
      if (args.clickSelector) {
        await page.click(String(args.clickSelector))
        await page.waitForTimeout(1200)
      }

      const title = await page.title()
      const bodyText =
        args.extractText !== false
          ? (await page.evaluate(() => document.body?.innerText || '')).slice(0, 6000)
          : ''

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ title, url: page.url(), extractedText: bodyText }, null, 2)
          }
        ]
      }
    } finally {
      await browser.close()
    }
  }

  throw new Error(`Unknown browser tool: ${name}`)
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('[Flame Browser MCP Error]:', err)
  process.exit(1)
})
