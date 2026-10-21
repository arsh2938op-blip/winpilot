import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

export function CodeBlock({ code, lang }: { code: string; lang?: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await window.api?.app?.copyText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border bg-background/60">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1">
        <span className="text-[10px] uppercase text-muted-foreground">{lang || 'code'}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={copy} title="Copy code">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="overflow-x-auto p-2.5 text-xs"><code>{code}</code></pre>
    </div>
  )
}
