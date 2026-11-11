import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sun, Moon, Laptop, Info, Sparkles, CircleDot, Loader2,
  Terminal, Cpu, MemoryStick, HardDrive, Gauge, Zap, BrainCircuit, Check, RefreshCw, User
} from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Separator } from '@renderer/components/ui/separator'
import { useThemeStore, ACCENT_THEMES } from '@renderer/store/useThemeStore'
import { useOrbStore } from '@renderer/store/useOrbStore'
import { cn } from '@renderer/lib/utils'
import type { OrbAccent, PlatformInfo, AiNetworkStatus, SystemSnapshot, MemoryEntry, UserProfile } from '@shared/types'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop }
] as const

const ORB_ACCENTS: { id: OrbAccent; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: 'radial-gradient(circle at 40% 35%, #7cc4ff, #1b3b6f)' },
  { id: 'black', label: 'Black', swatch: 'radial-gradient(circle at 40% 35%, #3a3f45, #0a0b0c)' }
]

const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'hi-IN', label: 'Hindi' }
]

const GOOGLE_VOICES = [
  { id: 'Aoede', label: 'Aoede (bright)' },
  { id: 'Kore', label: 'Kore (firm)' },
  { id: 'Puck', label: 'Puck (upbeat)' },
  { id: 'Charon', label: 'Charon (deep)' }
]

function StatusDot({ on }: { on: boolean }): React.JSX.Element {
  return <CircleDot className={cn('h-3.5 w-3.5', on ? 'text-success' : 'text-destructive')} />
}

/**
 * Settings page. Consolidates:
 * - Appearance & Preferences
 * - PET mode
 * - Engine & Models (moved from Chat window)
 * - AI Network Configuration (moved from AI Network tab)
 * - About
 */
export default function Settings(): React.JSX.Element {
  const { mode, setMode, accent, setAccent } = useThemeStore()
  const orbVisible = useOrbStore((s) => s.visible)
  const orbAlwaysOnTop = useOrbStore((s) => s.alwaysOnTop)
  const orbTransparency = useOrbStore((s) => s.transparencySupported)
  const orbAccent = useOrbStore((s) => s.accent)
  const orbAlwaysListening = useOrbStore((s) => s.alwaysListening)
  const orb = useOrbStore()
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)

  // Engine & Models state (from Chat configuration)
  const [voiceProvider, setVoiceProviderState] = useState<'browser' | 'google'>(() =>
    localStorage.getItem('flame:voice-provider') === 'google' ? 'google' : 'browser'
  )
  const [language, setLanguageState] = useState(() => localStorage.getItem('flame:voice-language') || 'en-US')
  const [googleVoiceName, setGoogleVoiceNameState] = useState(() => localStorage.getItem('flame:voice-name') || 'Aoede')

  const setVoiceProvider = (p: 'browser' | 'google'): void => {
    setVoiceProviderState(p)
    localStorage.setItem('flame:voice-provider', p)
  }
  const setLanguage = (lang: string): void => {
    setLanguageState(lang)
    localStorage.setItem('flame:voice-language', lang)
  }
  const setGoogleVoiceName = (name: string): void => {
    setGoogleVoiceNameState(name)
    localStorage.setItem('flame:voice-name', name)
  }
  const [hasGoogleKey, setHasGoogleKey] = useState(false)
  const [googleKeyInput, setGoogleKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [geminiKeyCount, setGeminiKeyCount] = useState(0)

  const [geminiModels, setGeminiModels] = useState<string[]>([])
  const [activeGeminiModel, setActiveGeminiModelState] = useState<string | null>(null)
  const [newModelId, setNewModelId] = useState('')

  const [visionEnabled, setVisionEnabledState] = useState(true)
  const [visionModel, setVisionModelState] = useState('')
  const [visionModelInput, setVisionModelInput] = useState('')

  const [zapierUrlInput, setZapierUrlInput] = useState('')
  const [hasZapierUrl, setHasZapierUrl] = useState(false)
  const [savingZapierUrl, setSavingZapierUrl] = useState(false)
  const [zapierTools, setZapierTools] = useState<{ name: string; description: string }[]>([])

  const [hwSnapshot, setHwSnapshot] = useState<SystemSnapshot | null>(null)
  const [memories, setMemories] = useState<MemoryEntry[]>([])

  // Local Ollama Models state
  const [localModel, setLocalModel] = useState('qwen2.5-coder:1.5b')
  const [installedOllamaModels, setInstalledOllamaModels] = useState<string[]>([])
  const [customModelInput, setCustomModelInput] = useState('')
  const [refreshingOllama, setRefreshingOllama] = useState(false)
  const [ollamaRunning, setOllamaRunning] = useState(false)
  const [savingModelConfig, setSavingModelConfig] = useState(false)
  const [modelFeedback, setModelFeedback] = useState<string | null>(null)

  // AI Network Configuration state (from AI Network tab)
  const [networkStatus, setNetworkStatus] = useState<AiNetworkStatus | null>(null)
  const [testingGemini, setTestingGemini] = useState(false)
  const [geminiTestResult, setGeminiTestResult] = useState<string | null>(null)
  const [debateRounds, setDebateRounds] = useState(16)
  const [savedDebateRounds, setSavedDebateRounds] = useState(16)
  const [netVisionEnabled, setNetVisionEnabled] = useState(false)
  const [netVisionModel, setNetVisionModel] = useState('')
  const [savedNetVisionModel, setSavedNetVisionModel] = useState('')
  const [savingNetVisionModel, setSavingNetVisionModel] = useState(false)
  const [openCodeEnabled, setOpenCodeEnabledState] = useState(false)
  const [openCodeCommand, setOpenCodeCommandInput] = useState('')
  const [savedOpenCodeCommand, setSavedOpenCodeCommand] = useState('')
  const [savingOpenCodeCommand, setSavingOpenCodeCommand] = useState(false)

  // User Profile state
  const [userProfile, setUserProfile] = useState<UserProfile>({
    nickname: 'Arsh',
    username: 'Arsh',
    preferred_ai_tone: 'witty'
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  useEffect(() => {
    if (!window.api?.app) return
    window.api.app.getPlatformInfo().then(setPlatformInfo).catch(() => {})
    window.api?.profile?.get?.().then((p) => {
      if (p) setUserProfile(p)
    }).catch(() => {})
  }, [])

  const handleSaveProfile = async (): Promise<void> => {
    setSavingProfile(true)
    try {
      if (window.api?.profile?.set) {
        const updated = await window.api.profile.set(userProfile)
        setUserProfile(updated)
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 2500)
      }
    } catch (err) {
      console.error('Failed to save user profile:', err)
    } finally {
      setSavingProfile(false)
    }
  }

  // Load Engine & Models data
  useEffect(() => {
    if (!window.api?.ai) return
    window.api.ai.hasGoogleApiKey().then(setHasGoogleKey).catch(() => {})
    window.api.ai.googleKeyCount?.().then(setGeminiKeyCount).catch(() => {})
    window.api.ai.hasZapierMcpUrl().then(setHasZapierUrl).catch(() => {})
    window.api.ai.listZapierTools().then(setZapierTools).catch(() => {})
    window.api.memory.list().then(setMemories).catch(() => {})
    window.api.aiNetwork?.listConfiguredGeminiModels().then(setGeminiModels).catch(() => {})
    window.api.aiNetwork?.getActiveGeminiModel().then(setActiveGeminiModelState).catch(() => {})
    window.api.aiNetwork?.isVisionEnabled().then(setVisionEnabledState).catch(() => {})
    window.api.aiNetwork?.getVisionModel().then((m) => setVisionModelState(m || '')).catch(() => {})

    // Load local model configuration from .flame/coder_config.json and query Ollama
    window.api.ai.getModelConfig?.().then((cfg) => {
      if (cfg?.localModel) setLocalModel(cfg.localModel)
    }).catch(() => {})
    window.api.ai.getOllamaModels?.().then(setInstalledOllamaModels).catch(() => {})
    window.api.ai.checkStatus?.().then((st) => setOllamaRunning(!!st.running)).catch(() => {})
  }, [])

  // Hardware snapshot polling for Engine & Models
  useEffect(() => {
    if (!window.api?.system) return
    let cancelled = false
    const poll = (): void => {
      window.api.system.getSnapshot().then((s) => !cancelled && setHwSnapshot(s)).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Load AI Network data
  useEffect(() => {
    if (!window.api?.aiNetwork) return
    window.api.aiNetwork.status().then(setNetworkStatus).catch(() => {})
    window.api.aiNetwork.getDebateRounds().then((rounds) => {
      setDebateRounds(rounds)
      setSavedDebateRounds(rounds)
    }).catch(() => {})
    window.api.aiNetwork.getVisionModel().then((m) => {
      setNetVisionModel(m ?? '')
      setSavedNetVisionModel(m ?? '')
    }).catch(() => {})
    window.api.aiNetwork.isVisionEnabled().then(setNetVisionEnabled).catch(() => {})
    window.api.aiNetwork.getOpenCodeCommand().then((cmd) => {
      setOpenCodeCommandInput(cmd)
      setSavedOpenCodeCommand(cmd)
    }).catch(() => {})
    window.api.aiNetwork.isOpenCodeEnabled().then(setOpenCodeEnabledState).catch(() => {})
  }, [])

  // Handlers for Engine & Models
  const saveGoogleKey = async (): Promise<void> => {
    if (!googleKeyInput.trim() || !window.api?.ai) return
    setSavingKey(true)
    try {
      await window.api.ai.setGoogleApiKey(googleKeyInput.trim())
      setHasGoogleKey(true)
      setGoogleKeyInput('')
      window.api.ai.googleKeyCount?.().then(setGeminiKeyCount).catch(() => {})
    } finally {
      setSavingKey(false)
    }
  }

  const addModel = async (): Promise<void> => {
    if (!newModelId.trim() || !window.api?.aiNetwork) return
    const next = await window.api.aiNetwork.addGeminiModel(newModelId.trim())
    setGeminiModels(next)
    setNewModelId('')
    window.api.aiNetwork.getActiveGeminiModel().then(setActiveGeminiModelState).catch(() => {})
  }

  const removeModel = async (id: string): Promise<void> => {
    if (!window.api?.aiNetwork) return
    setGeminiModels(await window.api.aiNetwork.removeGeminiModel(id))
    window.api.aiNetwork.getActiveGeminiModel().then(setActiveGeminiModelState).catch(() => {})
  }

  const selectModel = async (id: string): Promise<void> => {
    if (!window.api?.aiNetwork) return
    await window.api.aiNetwork.setActiveGeminiModel(id)
    setActiveGeminiModelState(id)
  }

  const saveVisionModel = async (): Promise<void> => {
    if (!visionModelInput.trim() || !window.api?.aiNetwork) return
    await window.api.aiNetwork.setVisionModel(visionModelInput.trim())
    setVisionModelState(visionModelInput.trim())
    setVisionModelInput('')
  }

  const toggleVision = async (v: boolean): Promise<void> => {
    setVisionEnabledState(v)
    await window.api?.aiNetwork?.setVisionEnabled(v)
  }

  const saveZapierUrl = async (): Promise<void> => {
    if (!zapierUrlInput.trim() || !window.api?.ai) return
    setSavingZapierUrl(true)
    try {
      await window.api.ai.setZapierMcpUrl(zapierUrlInput.trim())
      setHasZapierUrl(true)
      setZapierUrlInput('')
      window.api.ai.listZapierTools().then(setZapierTools).catch(() => {})
    } finally {
      setSavingZapierUrl(false)
    }
  }

  // Handlers for AI Network Configuration
  const testGemini = async (): Promise<void> => {
    if (!window.api?.aiNetwork) return
    setTestingGemini(true)
    try {
      const res = await window.api.aiNetwork.testGemini()
      setGeminiTestResult(res.message)
    } finally {
      setTestingGemini(false)
    }
  }

  const saveDebateRounds = async (): Promise<void> => {
    if (!window.api?.aiNetwork) return
    const rounds = Math.max(2, Math.min(40, Math.floor(debateRounds)))
    await window.api.aiNetwork.setDebateRounds(rounds)
    setDebateRounds(rounds)
    setSavedDebateRounds(rounds)
  }

  const saveNetVisionModel = async (): Promise<void> => {
    if (!window.api?.aiNetwork) return
    const next = netVisionModel.trim()
    if (!next) return
    setSavingNetVisionModel(true)
    try {
      await window.api.aiNetwork.setVisionModel(next)
      setSavedNetVisionModel(next)
      setNetVisionModel(next)
    } finally {
      setSavingNetVisionModel(false)
    }
  }

  const toggleNetVision = async (enabled: boolean): Promise<void> => {
    if (!window.api?.aiNetwork) return
    await window.api.aiNetwork.setVisionEnabled(enabled)
    setNetVisionEnabled(enabled)
  }

  const saveOpenCodeCommand = async (): Promise<void> => {
    if (!window.api?.aiNetwork || !openCodeCommand.trim()) return
    setSavingOpenCodeCommand(true)
    try {
      const cmd = openCodeCommand.trim()
      await window.api.aiNetwork.setOpenCodeCommand(cmd)
      setOpenCodeCommandInput(cmd)
      setSavedOpenCodeCommand(cmd)
    } finally {
      setSavingOpenCodeCommand(false)
    }
  }

  const toggleOpenCode = async (enabled: boolean): Promise<void> => {
    if (!window.api?.aiNetwork) return
    await window.api.aiNetwork.setOpenCodeEnabled(enabled)
    setOpenCodeEnabledState(enabled)
  }

  const showModelFeedback = (msg: string): void => {
    setModelFeedback(msg)
    setTimeout(() => setModelFeedback(null), 3500)
  }

  const refreshOllamaModels = async (): Promise<void> => {
    if (!window.api?.ai) return
    setRefreshingOllama(true)
    try {
      const [models, status] = await Promise.all([
        window.api.ai.getOllamaModels?.() ?? Promise.resolve([]),
        window.api.ai.checkStatus?.() ?? Promise.resolve({ running: false, modelReady: false })
      ])
      setInstalledOllamaModels(models)
      setOllamaRunning(!!status.running)
      if (models.length > 0) {
        showModelFeedback(`Refreshed: ${models.length} model(s) discovered in Ollama`)
      } else {
        showModelFeedback(status.running ? 'Connected to Ollama (no models found)' : 'Ollama is offline')
      }
    } catch {
      setOllamaRunning(false)
    } finally {
      setRefreshingOllama(false)
    }
  }

  const selectLocalModel = async (modelTag: string): Promise<void> => {
    const chosen = modelTag.trim()
    if (!chosen || !window.api?.ai) return
    setLocalModel(chosen)
    setSavingModelConfig(true)
    try {
      await window.api.ai.saveModelConfig?.({ localModel: chosen })
      showModelFeedback(`✨ Active local model set to ${chosen}`)
    } catch (err) {
      console.error('Failed to save model config', err)
    } finally {
      setSavingModelConfig(false)
    }
  }

  const addCustomModel = async (): Promise<void> => {
    const custom = customModelInput.trim()
    if (!custom || !window.api?.ai) return
    if (!installedOllamaModels.includes(custom)) {
      setInstalledOllamaModels((prev) => [...prev, custom])
    }
    setLocalModel(custom)
    setCustomModelInput('')
    setSavingModelConfig(true)
    try {
      await window.api.ai.saveModelConfig?.({ localModel: custom })
      showModelFeedback(`✨ Custom model "${custom}" saved to .flame/coder_config.json`)
    } catch (err) {
      console.error('Failed to save model config', err)
    } finally {
      setSavingModelConfig(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Appearance, preferences, engine models, and network configuration." />

      <div className="space-y-6">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how FlameAGI looks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-md border px-4 py-3 text-sm transition-colors',
                    mode === option.value
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border hover:bg-secondary'
                  )}
                >
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium">Colour theme</p>
              <div className="flex flex-wrap gap-2">
                {ACCENT_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setAccent(theme.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                      accent === theme.id
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border hover:bg-secondary'
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/10"
                      style={{ background: theme.swatch }}
                    />
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Profile & Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> User Profile & Identity
            </CardTitle>
            <CardDescription>
              Set your nickname, username, and conversational tone. FlameAGI and the Minecraft agent use this context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Nickname (Spoken & Chat)</label>
                <Input
                  value={userProfile.nickname}
                  onChange={(e) => setUserProfile({ ...userProfile, nickname: e.target.value })}
                  placeholder="e.g. Arsh"
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Flame addresses you by this name in chat and speech.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Username / Gamer Tag</label>
                <Input
                  value={userProfile.username}
                  onChange={(e) => setUserProfile({ ...userProfile, username: e.target.value })}
                  placeholder="e.g. Arsh"
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Authorized leader in Minecraft alongside Emperorop7528.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Preferred AI Tone</label>
              <div className="flex flex-wrap gap-2">
                {['witty', 'professional', 'cyberpunk', 'friendly', 'concise'].map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setUserProfile({ ...userProfile, preferred_ai_tone: tone })}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                      userProfile.preferred_ai_tone === tone
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {profileSaved ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Profile saved and synced!
                  </span>
                ) : (
                  'Synced across Desktop Flame, WhatsApp brain, and Minecraft bot.'
                )}
              </span>
              <Button
                size="sm"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="text-xs"
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>General application preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Launch on startup, notification preferences, and update settings will live here.</p>
          </CardContent>
        </Card>

        {/* PET mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> PET mode
            </CardTitle>
            <CardDescription>A small frameless FlameAGI orb that lives on your desktop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">PET mode</p>
                <p className="text-xs text-muted-foreground">
                  Drag it anywhere. Click it for a quick chat — it uses the conversation
                  currently open in the main window.
                </p>
              </div>
              <Switch
                checked={orbVisible}
                onCheckedChange={(v) => void (v ? orb.enable() : orb.disable())}
                aria-label="PET mode"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Always on top</p>
                <p className="text-xs text-muted-foreground">
                  Keep the orb above ordinary windows.
                </p>
              </div>
              <Switch
                checked={orbAlwaysOnTop}
                onCheckedChange={(v) => void orb.setAlwaysOnTop(v)}
                aria-label="Always on top"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Companion colour</p>
                <p className="text-xs text-muted-foreground">
                  Blue or black only, applied live — no restart needed.
                </p>
              </div>
              <div className="flex gap-2">
                {ORB_ACCENTS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => void orb.setAccent(option.id)}
                    aria-pressed={orbAccent === option.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                      orbAccent === option.id
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border hover:bg-secondary'
                    )}
                  >
                    <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: option.swatch }} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Always Listening</p>
                <p className="text-xs text-muted-foreground">
                  The orb keeps a microphone monitor open and listens for speech. Speech
                  detection runs locally on your device; only a detected phrase is sent for
                  transcription. Turn it off for an immediate, silent mute.
                </p>
              </div>
              <Switch
                checked={orbAlwaysListening}
                onCheckedChange={(v) => void orb.setAlwaysListening(v)}
                aria-label="Always Listening"
              />
            </div>

            {orbAlwaysListening && !orbVisible && (
              <p className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
                Always Listening takes effect once PET mode is shown.
              </p>
            )}

            {!orbTransparency && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-300">
                This platform can&apos;t give the orb a truly transparent window, so it falls
                back to an opaque surface.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Engine & Models Section: Local Ollama Models */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" /> Local Ollama Models
                </CardTitle>
                <CardDescription>
                  Autonomous local models (Qwen 2.5 Coder, Gemma 2, Llama 3) with 30s RAM unloader.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={refreshOllamaModels}
                disabled={refreshingOllama}
                className="gap-1.5 self-start sm:self-auto"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshingOllama && 'animate-spin')} />
                Refresh Models
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Active Model Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 p-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex h-3 w-3 rounded-full',
                    ollamaRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground'
                  )}
                />
                <div>
                  <div className="text-xs text-muted-foreground">Active Local Model</div>
                  <div className="font-mono text-sm font-semibold text-foreground">
                    {localModel || 'qwen2.5-coder:1.5b'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    ollamaRunning ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
                  )}
                >
                  {ollamaRunning ? 'Ollama Online' : 'Ollama Offline'}
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  RAM Guard: 30s keep-alive
                </span>
              </div>
            </div>

            {/* Installed Models list/pills */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Installed Models</label>
                {installedOllamaModels.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {installedOllamaModels.length} model{installedOllamaModels.length === 1 ? '' : 's'} installed
                  </span>
                )}
              </div>

              {installedOllamaModels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {installedOllamaModels.map((m) => {
                    const isActive = localModel === m
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => selectLocalModel(m)}
                        className={cn(
                          'group flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          isActive
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-muted/50 text-foreground hover:bg-muted hover:border-primary/50'
                        )}
                      >
                        {isActive && <Check className="h-3 w-3" />}
                        <span className="font-mono">{m}</span>
                        {isActive && <span className="text-[10px] opacity-80">(active)</span>}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground">
                  {ollamaRunning
                    ? 'No models returned from Ollama. Pull a model via `ollama run qwen2.5-coder:1.5b` or enter a custom tag below.'
                    : 'Ollama is offline (http://127.0.0.1:11434). Start Ollama or enter any custom model tag below to persist to .flame/coder_config.json.'}
                </div>
              )}
            </div>

            {/* Custom Model Input */}
            <div className="border-t border-border/60 pt-3">
              <label className="text-xs font-medium text-muted-foreground">Add Custom Model Tag</label>
              <p className="mb-2 text-xs text-muted-foreground">
                Type any custom Ollama tag (e.g. <code className="font-mono text-primary">qwen2.5-coder:1.5b</code>, <code className="font-mono text-primary">qwen2.5:1.5b</code>, <code className="font-mono text-primary">gemma2:2b</code>)
              </p>
              <div className="flex gap-2">
                <Input
                  value={customModelInput}
                  onChange={(e) => setCustomModelInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomModel()}
                  placeholder="e.g. qwen2.5-coder:1.5b"
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  onClick={addCustomModel}
                  disabled={!customModelInput.trim() || savingModelConfig}
                  className="shrink-0"
                >
                  {savingModelConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add Custom Model'}
                </Button>
              </div>
              {modelFeedback && (
                <p className="mt-2 text-xs text-success flex items-center gap-1.5 animate-fade-in">
                  <Check className="h-3 w-3" /> {modelFeedback}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Engine & Models Section (Consolidated from Chat) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" /> Engine &amp; Models
            </CardTitle>
            <CardDescription>
              Voice, speech, Gemini model selection, vision inspection, and external integrations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Voice provider</label>
                <div className="mt-1.5 flex gap-2">
                  <Button size="sm" variant={voiceProvider === 'browser' ? 'default' : 'outline'} onClick={() => setVoiceProvider('browser')}>Browser</Button>
                  <Button size="sm" variant={voiceProvider === 'google' ? 'default' : 'outline'} onClick={() => setVoiceProvider('google')}>Google</Button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Language (STT)</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm">
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            {voiceProvider === 'google' && (
              <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Google voice</label>
                  <select value={googleVoiceName} onChange={(e) => setGoogleVoiceName(e.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm">
                    {GOOGLE_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Google API key(s) {hasGoogleKey && <span className="text-success font-normal">({geminiKeyCount} saved)</span>}
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <Input type="password" value={googleKeyInput} onChange={(e) => setGoogleKeyInput(e.target.value)} placeholder="KEY_1, KEY_2…" />
                    <Button size="sm" onClick={saveGoogleKey} disabled={savingKey || !googleKeyInput.trim()}>
                      {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <label className="text-xs font-medium text-muted-foreground">Gemini &amp; LLM Models</label>
              <p className="text-xs text-muted-foreground">Dynamic model configuration (cloud models e.g. gemini-4-argon, claude-opus-4-6 or local models e.g. qwen2.5-coder:1.5b)</p>
              <div className="mt-2 flex gap-2">
                <Input value={newModelId} onChange={(e) => setNewModelId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModel()} placeholder="e.g. gemini-2.5-flash, gemini-4-argon" />
                <Button size="sm" onClick={addModel} disabled={!newModelId.trim()}>Add</Button>
              </div>
              <div className="mt-2 space-y-1">
                {geminiModels.map((id) => (
                  <div key={id} className="flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5">{activeGeminiModel === id && <Check className="h-3 w-3 text-success" />} {id}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant={activeGeminiModel === id ? 'secondary' : 'outline'} onClick={() => selectModel(id)} disabled={activeGeminiModel === id}>
                        {activeGeminiModel === id ? 'Active' : 'Use'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => removeModel(id)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Vision (Gemini)</p>
                  <p className="text-xs text-muted-foreground">Image inspection and multi-modal analysis.</p>
                </div>
                <Switch checked={visionEnabled} onCheckedChange={toggleVision} />
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={visionModelInput} onChange={(e) => setVisionModelInput(e.target.value)} placeholder={visionModel || 'e.g. gemini-2.0-flash'} />
                <Button size="sm" onClick={saveVisionModel} disabled={!visionModelInput.trim()}>Save</Button>
              </div>
              {visionModel && <p className="mt-1 text-xs text-muted-foreground">Active model: {visionModel}</p>}
            </div>

            <div className="border-t border-border pt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Zapier MCP URL {hasZapierUrl && <span className="text-success font-normal">(connected)</span>}
                </label>
                <p className="text-xs text-muted-foreground">Connects external actions via Model Context Protocol.</p>
              </div>
              <div className="mt-2 flex gap-2">
                <Input type="password" value={zapierUrlInput} onChange={(e) => setZapierUrlInput(e.target.value)} placeholder="Paste MCP connect URL…" />
                <Button size="sm" onClick={saveZapierUrl} disabled={savingZapierUrl || !zapierUrlInput.trim()}>
                  {savingZapierUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>
              {zapierTools.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{zapierTools.length} action(s) available.</p>}
            </div>

            {hwSnapshot && (
              <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5" /> CPU: {hwSnapshot.cpuPercent}%</span>
                <span className="flex items-center gap-1"><MemoryStick className="h-3.5 w-3.5" /> RAM: {hwSnapshot.ramPercent}%</span>
                <span className="flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" /> Disk: {hwSnapshot.diskPercent}%</span>
                <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> GPU: {hwSnapshot.gpuPercent ?? 0}%</span>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <Link to="/memory" className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs hover:bg-muted/70">
                <span className="flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5" /> {memories.length} memories saved</span>
                <span className="text-muted-foreground">Manage memories →</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* AI Network Configuration Section (Consolidated from AI Network tab) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4" /> AI Network Configuration
            </CardTitle>
            <CardDescription>
              Collaborator model backends, debate settings, and autonomous coding tools.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Ollama */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Ollama ({localModel || 'Flame Local'})</p>
                  <p className="text-xs text-muted-foreground">Local — Flame&apos;s main brain for chat and intent parsing.</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <StatusDot on={!!networkStatus?.ollama.modelReady} />
                {networkStatus?.ollama.modelReady ? 'Ready' : networkStatus?.ollama.running ? 'Model not pulled' : 'Not running'}
              </div>
            </div>

            {/* Gemini Collaborator */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Gemini Collaborator</p>
                    <p className="text-xs text-muted-foreground">
                      {networkStatus?.gemini.configured
                        ? `${networkStatus.gemini.keyCount} key(s) configured.`
                        : 'No key configured yet — add one in Engine & Models above.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <StatusDot on={!!networkStatus?.gemini.configured} />
                    {networkStatus?.gemini.configured ? 'Configured' : 'Not configured'}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!networkStatus?.gemini.configured || testingGemini}
                    onClick={testGemini}
                  >
                    {testingGemini ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
                  </Button>
                </div>
              </div>
              {geminiTestResult && <p className="mt-3 text-xs text-muted-foreground">{geminiTestResult}</p>}
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                <label htmlFor="debate-rounds-settings" className="flex-1 text-xs text-muted-foreground">
                  Maximum debate turns (2–40)
                </label>
                <Input
                  id="debate-rounds-settings"
                  type="number"
                  min={2}
                  max={40}
                  value={debateRounds}
                  onChange={(e) => setDebateRounds(Number(e.target.value))}
                  className="w-24"
                />
                <Button size="sm" variant="outline" onClick={saveDebateRounds} disabled={debateRounds === savedDebateRounds}>
                  Save
                </Button>
              </div>
            </div>

            {/* Vision Model Config */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Terminal className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Vision Service</p>
                    <p className="text-xs text-muted-foreground">Gemini image inspection for local files.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{netVisionEnabled ? 'Enabled' : 'Disabled'}</span>
                  <Switch checked={netVisionEnabled} onCheckedChange={toggleNetVision} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                <Input
                  value={netVisionModel}
                  onChange={(e) => setNetVisionModel(e.target.value)}
                  placeholder={savedNetVisionModel || 'gemini-2.0-flash-preview-image-generation'}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveNetVisionModel}
                  disabled={savingNetVisionModel || !netVisionModel.trim()}
                >
                  {savingNetVisionModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            {/* OpenCode Config */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Terminal className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">OpenCode (RSI Backend)</p>
                    <p className="text-xs text-muted-foreground">Used for confirmed RSI self-coding tasks on the active project.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{openCodeEnabled ? 'Enabled' : 'Disabled'}</span>
                  <Switch checked={openCodeEnabled} onCheckedChange={toggleOpenCode} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                <Input
                  value={openCodeCommand}
                  onChange={(e) => setOpenCodeCommandInput(e.target.value)}
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
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4" /> About
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Version" value={platformInfo?.appVersion ?? '—'} />
              <Separator />
              <Row label="Windows version" value={platformInfo?.osVersion ?? '—'} />
              <Separator />
              <Row label="Architecture" value={platformInfo?.arch ?? '—'} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  )
}
