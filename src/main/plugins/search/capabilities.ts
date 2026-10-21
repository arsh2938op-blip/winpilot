import { registerCapability } from '../../flameCore/capabilities'
import { emitAgentActivity } from '../../utils/broadcast'

interface WikiSummary {
  title: string
  summary: string
  url?: string
}

async function searchWikipedia(query: string): Promise<WikiSummary | null> {
  const searchRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`
  )
  if (!searchRes.ok) throw new Error(`Wikipedia search failed (${searchRes.status}).`)
  const [, titles] = (await searchRes.json()) as [string, string[]]
  const title = titles[0]
  if (!title) return null

  const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  if (!summaryRes.ok) throw new Error(`Wikipedia summary failed (${summaryRes.status}).`)
  const data = (await summaryRes.json()) as {
    title?: string
    extract?: string
    content_urls?: { desktop?: { page?: string } }
  }
  return { title: data.title || title, summary: data.extract || 'No summary available.', url: data.content_urls?.desktop?.page }
}

export function registerSearchCapabilities(): void {
  registerCapability({
    id: 'search.currentInfo',
    label: 'Look up current information',
    description: 'Searches Wikipedia for up-to-date factual/reference information on a topic.',
    run: async (args) => {
      const query = (args.query as string | undefined)?.trim()
      const requestId = args.requestId as string | undefined
      if (!query) return { success: false, message: 'What should I look up?' }
      try {
        emitAgentActivity(requestId, `[Search] Looking up: ${query}`)
        const result = await searchWikipedia(query)
        if (!result) return { success: false, message: `Couldn't find anything for "${query}".` }
        emitAgentActivity(requestId, '[Search] Results ready')
        return { success: true, message: `${result.summary}${result.url ? `\n\nSource: ${result.url}` : ''}` }
      } catch (err) {
        emitAgentActivity(requestId, '[Search] Failed')
        return { success: false, message: `Search failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}
