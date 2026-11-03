/**
 * McpCapabilityBridge
 *
 * Converts MCP tool call results (which return typed Content arrays or
 * legacy toolResult fields) into the flat `CapabilityResult` format that
 * flameCore/capabilities.ts expects.
 */

export interface CapabilityResult {
  success: boolean
  message: string
  data?: unknown
}

/**
 * Convert an MCP callTool result into a CapabilityResult.
 *
 * - If `result.isError` is true, `success` is false.
 * - Text content blocks (or legacy toolResult) are concatenated into `message`.
 * - Image content blocks are included as data URIs in `data`.
 */
export function bridgeToolResult(result: unknown): CapabilityResult {
  const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>
  const isError = Boolean(r.isError)
  const textParts: string[] = []
  const imageParts: string[] = []

  if (Array.isArray(r.content)) {
    for (const block of r.content) {
      if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>
        if (b.type === 'text' && typeof b.text === 'string') {
          textParts.push(b.text)
        } else if (b.type === 'image' && typeof b.data === 'string') {
          const mime = typeof b.mimeType === 'string' ? b.mimeType : 'image/png'
          imageParts.push(`data:${mime};base64,${b.data}`)
        }
      }
    }
  } else if (r.toolResult !== undefined) {
    textParts.push(typeof r.toolResult === 'string' ? r.toolResult : JSON.stringify(r.toolResult, null, 2))
  }

  const message = textParts.join('\n').trim() || (isError ? 'Tool returned an error.' : 'Done.')

  return {
    success: !isError,
    message,
    data: imageParts.length > 0 ? { images: imageParts } : undefined
  }
}

