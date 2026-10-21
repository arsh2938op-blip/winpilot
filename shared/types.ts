/**
 * Types shared between the main process (system access) and the renderer
 * (UI). Defining a feature's data shape here, once, keeps both sides in
 * sync as features are implemented.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface PlatformInfo {
  osVersion: string
  arch: string
  appVersion: string
}

// TODO: Winget Manager — flesh out once the feature is implemented.
export interface WingetPackage {
  id: string
  name: string
  version: string
  availableVersion?: string
  source: string
}

export type WingetActionStatus = 'idle' | 'running' | 'success' | 'error'

export interface WingetProgressEvent {
  packageId: string
  status: WingetActionStatus
  message: string
  percent?: number
}

// TODO: Dashboard — system metrics snapshot.
export interface SystemSnapshot {
  cpuPercent: number
  ramPercent: number
  diskPercent: number
  uptimeSeconds: number
  gpuPercent?: number
  temperatureCelsius?: number
  batteryPercent?: number
  networkDownKbps?: number
  networkUpKbps?: number
}

// TODO: Windows Controls — toggleable system features.
export type WindowsControlId =
  | 'bluetooth'
  | 'wifi'
  | 'darkMode'
  | 'notifications'
  | 'gameMode'

export interface WindowsControlState {
  id: WindowsControlId
  label: string
  enabled: boolean
}

// TODO: AI Assistant — the AI decides WHAT the user wants (intent),
// the app decides HOW to execute it. This shape is a placeholder for
// that contract.
export type AiIntentType =
  | 'launch_app'
  | 'install_app'
  | 'update_app'
  | 'uninstall_app'
  | 'external_action'
  | 'remember_fact'
  | 'remember_plan'
  | 'ai_network'
  | 'run_command'
  | 'current_info_search'
  | 'start_debate'
  | 'stop_debate'
  | 'file_operation'
  | 'generate_prompt'
  | 'rsi_improve'
  | 'code_edit'
  | 'unknown'

export type AiNetworkTarget = 'gemini' | 'opencode'
export type PromptTool = 'claude' | 'gemini' | 'chatgpt' | 'opencode' | 'other'

export interface AiIntentResult {
  intent: AiIntentType
  app?: string
  instruction?: string
  factText?: string
  planText?: string
  aiTarget?: AiNetworkTarget
  command?: string
  query?: string
  topic?: string
  fileAction?: 'list' | 'read' | 'inspectZip' | 'extractZip' | 'search'
  path?: string
  destDir?: string
  promptTool?: PromptTool
  reply: string
  rawPrompt: string
}

export interface AgentActivityEvent {
  requestId: string
  label: string
  at: number
}

export interface DebateTurnEvent {
  agent: 'flame' | 'gemini'
  text: string | null
  at: number
}

export interface DebateEndedEvent {
  reason: string
  at: number
}

export interface AiNetworkStatus {
  ollama: { running: boolean; modelReady: boolean }
  gemini: { configured: boolean; keyCount: number }
}

export interface ProjectPermissions {
  read: boolean
  write: boolean
  execute: boolean
}

export interface ImportedProject {
  id: string
  name: string
  path: string
  permissions: ProjectPermissions
  addedAt: number
}

export interface MinecraftConfig {
  active: boolean
  projectPath: string | null
  serverIp: string
  serverPort: number
  mindserverPort: number
  autoOpenUi: boolean
  botCount: number
  botNames: string
  modelsOrPreset: string
  spawnDelaySeconds: number
  viewer: boolean
  apiRotation: boolean
  speakjs: boolean
  ownership: boolean
  essentials: boolean
}

export type MinecraftRunState = 'offline' | 'starting' | 'online' | 'stopping' | 'error' | 'needs_keys'

export interface MinecraftStatus {
  state: MinecraftRunState
  bots: string[]
  serverOnline: boolean
  mindserverOnline: boolean
}

export interface MinecraftLogLine {
  text: string
  at: number
}

export interface MemoryEntry {
  id: string
  text: string
  createdAt: number
}

export interface PlanEntry {
  id: string
  text: string
  status: 'pending' | 'done'
  context: string
  createdAt: number
}

export interface ZapierToolInfo {
  name: string
  description: string
}

export interface GoogleSpeakResult {
  audioBase64: string // WAV, base64-encoded
}

export interface GoogleTranscribeResult {
  text: string
}

export interface GeminiModelInfo {
  id: string
  displayName?: string
}

export type ChatModelId = 'gemma' | 'gemini'
export type FlameDifficulty = 'easy' | 'normal' | 'hard' | 'expert'

export interface WhatsAppContact {
  name: string
  phoneNumber: string
}
/**
 * Uninstall is destructive, so the AI never executes it directly — it
 * hands back a pending action instead. The renderer shows a Confirm/
 * Cancel prompt in the chat itself, and only calls the real uninstall IPC
 * if the user confirms.
 */
export interface AiPendingAction {
  type: 'uninstall' | 'fileOperation'
  packageId?: string
  packageName?: string
  operationId?: string
  operationLabel?: string
}

export interface AiResponse {
  reply: string
  intent: AiIntentType
  app?: string
  actionSuccess?: boolean
  pendingAction?: AiPendingAction
  promptArtifact?: { forTool: string; prompt: string }
}

export interface AiStatus {
  running: boolean
  modelReady: boolean
}

/* ---- Floating orb companion ----
 * The orb is an independent desktop surface of the same assistant, never a
 * second assistant. It uses the same main-process AI service, the same
 * provider credentials and the same persistent memory as the main window;
 * what it owns is its own conversation transcript. Nothing about the orb
 * lives in the main window's React tree, so it survives the main window
 * being closed or reloaded.
 */

export type OrbEffort = 'low' | 'medium' | 'high' | 'auto'

/** Only two companion colours exist, by design. */
export type OrbAccent = 'blue' | 'black'

export interface OrbChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  at?: number
  /** false marks a failed reply so the orb can style it as an error. */
  actionSuccess?: boolean
}

export interface OrbWindowState {
  visible: boolean
  alwaysOnTop: boolean
  /**
   * False on platforms where Electron can't do a real transparent window.
   * The orb then falls back to an opaque, smaller surface instead of
   * pretending transparency works.
   */
  transparencySupported: boolean
  accent: OrbAccent
  /**
   * Main-process persisted flag for the local wake-free listening mode.
   * The orb renderer is what actually opens the microphone; this is only
   * the shared on/off preference both surfaces agree on.
   */
  alwaysListening: boolean
}
