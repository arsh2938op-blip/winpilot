import { useEffect, useState } from 'react'
import { CircleDot, Loader2, Sparkles, Terminal, Cpu } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import type { AiNetworkStatus } from '@shared/types'

function StatusDot({ on }: { on: boolean }): React.JSX.Element {
  return <CircleDot className={cn('h-3.5 w-3.5', on ? 'text-success' : 'text-destructive')} />
}

export default function AiNetwork(): React.JSX.Element {
  const [status, setStatus] = useState<AiNetworkStatus | null>(null)
  const [testing, setTesting] = useState<'gemini' | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})
  const [debateRounds, setDebateRounds] = useState(16)
  const [savedDebateRounds, setSavedDebateRounds] = useState(16)
  const [visionEnabled, setVisionEnabled] = useState(false)
  const [visionModel, setVisionModel] = useState('')
  const [savedVisionModel, setSavedVisionModel] = useState('')
  const [savingVisionModel, setSavingVisionModel] = useState(false)
  const [openCodeEnabled, setOpenCodeEnabledState] = useState(false)
  const [openCodeCommand, setOpenCodeCommandInput] = useState('')
  const [savedOpenCodeCommand, setSavedOpenCodeCommand] = useState('')
  const [savingOpenCodeCommand, setSavingOpenCodeCommand] = useState(false)

  const refresh = (): void => {
    window.api?.aiNetwork?.status().then(setStatus).catch(() => {})
  }

  useEffect(refresh, [])
  useEffect(() => {
    window.api?.aiNetwork?.getDebateRounds().then((rounds) => {
      setDebateRounds(rounds)
      setSavedDebateRounds(rounds)
    }).catch(() => {})
    window.api?.aiNetwork?.getVisionModel().then((model) => {
      setVisionModel(model ?? '')
      setSavedVisionModel(model ?? '')
    }).catch(() => {})
    window.api?.aiNetwork?.isVisionEnabled().then(setVisionEnabled).catch(() => {})
    window.api?.aiNetwork?.getOpenCodeCommand().then((command) => {
      setOpenCodeCommandInput(command)
      setSavedOpenCodeCommand(command)
    }).catch(() => {})
    window.api?.aiNetwork?.isOpenCodeEnabled().then(setOpenCodeEnabledState).catch(() => {})
  }, [])

  const saveRounds = async (): Promise<void> => {
    if (!window.api?.aiNetwork) return
    const rounds = Math.max(2, Math.min(40, Math.floor(debateRounds)))
    await window.api.aiNetwork.setDebateRounds(rounds)
    setDebateRounds(rounds)
    setSavedDebateRounds(rounds)
  }

  const saveVisionModel = async (): Promise<void> => {
    if (!window.api?.aiNetwork) return
    const next = visionModel.trim()
    if (!next) return
    setSavingVisionModel(true)
    try {
      await window.api.aiNetwork.setVisionModel(next)
      setSavedVisionModel(next)
      setVisionModel(next)
    } finally {
      setSavingVisionModel(false)
    }
  }

  const toggleVision = async (enabled: boolean): Promise<void> => {
    if (!window.api?.aiNetwork) return
    await window.api.aiNetwork.setVisionEnabled(enabled)
    setVisionEnabled(enabled)
  }

  const saveOpenCodeCommand = async (): Promise<void> => {
    if (!window.api?.aiNetwork || !openCodeCommand.trim()) return
    setSavingOpenCodeCommand(true)
    try {
      const command = openCodeCommand.trim()
      await window.api.aiNetwork.setOpenCodeCommand(command)
      setOpenCodeCommandInput(command)
      setSavedOpenCodeCommand(command)
    } finally {
      setSavingOpenCodeCommand(false)
    }
  }

  const toggleOpenCode = async (enabled: boolean): Promise<void> => {
    if (!window.api?.aiNetwork) return
    await window.api.aiNetwork.setOpenCodeEnabled(enabled)
    setOpenCodeEnabledState(enabled)
  }

  const test = async (which: 'gemini'): Promise<void> => {
    if (!window.api?.aiNetwork) return
    setTesting(which)
    try {
      const result = await window.api.aiNetwork.testGemini()
      setTestResult((prev) => ({ ...prev, [which]: result.message }))
    } finally {
      setTesting(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Network"
        description='Specialized AIs Flame can call on. Try "ask gemini…" in Chat.'
      />

      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <Cpu className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Ollama (gemma2:2b)</p>
                <p className="text-xs text-muted-foreground">Local — Flame&apos;s main brain for chat and intent parsing.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <StatusDot on={!!status?.ollama.modelReady} />
              {status?.ollama.modelReady ? 'Ready' : status?.ollama.running ? 'Model not pulled' : 'Not running'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Gemini</p>
                  <p className="text-xs text-muted-foreground">
                    {status?.gemini.configured
                      ? `${status.gemini.keyCount} key(s) configured — same keys used for voice.`
                      : 'No key configured yet — add one in Chat settings.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <StatusDot on={!!status?.gemini.configured} />
                  {status?.gemini.configured ? 'Configured' : 'Not configured'}
                </div>
                <Button size="sm" variant="outline" disabled={!status?.gemini.configured || testing === 'gemini'} onClick={() => test('gemini')}>
                  {testing === 'gemini' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
                </Button>
              </div>
            </div>
            {testResult.gemini && <p className="mt-3 text-xs text-muted-foreground">{testResult.gemini}</p>}
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
              <label htmlFor="debate-rounds" className="flex-1 text-xs text-muted-foreground">Maximum debate turns (2–40)</label>
              <Input
                id="debate-rounds"
                type="number"
                min={2}
                max={40}
                value={debateRounds}
                onChange={(event) => setDebateRounds(Number(event.target.value))}
                className="w-24"
              />
              <Button size="sm" variant="outline" onClick={saveRounds} disabled={debateRounds === savedDebateRounds}>Save</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Terminal className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Vision</p>
                  <p className="text-xs text-muted-foreground">Gemini image inspection for local files.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{visionEnabled ? 'Enabled' : 'Disabled'}</span>
                <Switch checked={visionEnabled} onCheckedChange={toggleVision} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
              <Input
                value={visionModel}
                onChange={(event) => setVisionModel(event.target.value)}
                placeholder={savedVisionModel || 'gemini-2.0-flash-preview-image-generation'}
                className="flex-1"
              />
              <Button size="sm" variant="outline" onClick={saveVisionModel} disabled={savingVisionModel || !visionModel.trim()}>
                {savingVisionModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Terminal className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">OpenCode</p>
                  <p className="text-xs text-muted-foreground">Used for confirmed RSI tasks on the active project.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{openCodeEnabled ? 'Enabled' : 'Disabled'}</span>
                <Switch checked={openCodeEnabled} onCheckedChange={toggleOpenCode} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
              <Input
                value={openCodeCommand}
                onChange={(event) => setOpenCodeCommandInput(event.target.value)}
                placeholder="opencode run '{task}'"
                className="flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveOpenCodeCommand}
                disabled={savingOpenCodeCommand || !openCodeCommand.trim() || openCodeCommand === savedOpenCodeCommand}
              >
                {savingOpenCodeCommand ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Template placeholders: {'{task}'} and {'{cwd}'}.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
