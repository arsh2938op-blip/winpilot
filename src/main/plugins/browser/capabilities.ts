import { shell } from 'electron'
import { registerCapability } from '../../flameCore/capabilities'

export function registerBrowserCapabilities(): void {
  registerCapability({
    id: 'browser.open_url',
    name: 'Open Browser URL',
    description: 'Opens a website or URL in the default system browser.',
    pluginId: 'browser',
    run: async (args: Record<string, unknown>) => {
      let url = String(args.url || '').trim()
      if (!url) return { success: false, message: 'URL is required.' }

      const knownSites: Record<string, string> = {
        github: 'https://github.com',
        google: 'https://www.google.com',
        youtube: 'https://www.youtube.com',
        reddit: 'https://www.reddit.com',
        twitter: 'https://x.com',
        x: 'https://x.com',
        wikipedia: 'https://www.wikipedia.org'
      }
      if (knownSites[url.toLowerCase()]) {
        url = knownSites[url.toLowerCase()]
      }

      if (!/^https?:\/\//i.test(url) && !url.startsWith('file://')) {
        if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/\S*)?$/.test(url)) {
          url = `https://${url}`
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
        }
      }

      try {
        await shell.openExternal(url)
        return { success: true, message: `Opened ${url} in your default browser.` }
      } catch (err) {
        return { success: false, message: `Failed to open ${url}: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}

