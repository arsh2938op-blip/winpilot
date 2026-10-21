import { CodeBlock } from '@renderer/components/shared/CodeBlock'

export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'code'; lang: string; code: string }

export function splitMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  const fence = /```([\w+-]*)\r?\n([\s\S]*?)```/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = fence.exec(content)) !== null) {
    if (match.index > cursor) segments.push({ type: 'text', text: content.slice(cursor, match.index) })
    segments.push({ type: 'code', lang: match[1], code: match[2].replace(/\r?\n$/, '') })
    cursor = fence.lastIndex
  }
  if (cursor < content.length || segments.length === 0) segments.push({ type: 'text', text: content.slice(cursor) })
  return segments
}

export function renderMessageContent(content: string): React.JSX.Element[] {
  return splitMessageContent(content).map((segment, index) =>
    segment.type === 'code'
      ? <CodeBlock key={index} code={segment.code} lang={segment.lang} />
      : <p key={index} className="whitespace-pre-wrap">{segment.text}</p>
  )
}
