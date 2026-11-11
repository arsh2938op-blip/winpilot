/**
 * Types shared between the main process (system access) and the renderer
 * (UI). Defining a feature's data shape here, once, keeps both sides in
 * sync as features are implemented.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UserProfile {
  nickname: string
  username: string
  preferred_ai_tone: string
}

export interface PlatformInfo {
  osVersion: string
  arch: string
  appVersion: string
}

// Winget Manager
export interface WingetPackage {
  id: string
  name: string
  version: string
  availableVersion?: string
  source: string
  icon?: string
  description?: string
  publisher?: string
  homepage?: string
}

export type WingetActionStatus = 'idle' | 'running' | 'success' | 'error'

export interface WingetProgressEvent {
  packageId: string
  status: WingetActionStatus
  message: string
  percent?: number
}

// System telemetry snapshot
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

/* ------------------------------------------------------------------ */
/* Combos Automation Engine                                           */
/* ------------------------------------------------------------------ */

export type ComboActionType =
  | 'launch_app'
  | 'focus_window'
  | 'command'
  | 'system_command'
  | 'wait'

export type SpecialSystemCommand =
  | 'close yourself'
  | 'close flame'
  | 'close pet mode'

export interface ComboStep {
  id: string
  action: ComboActionType
  target: string
  description?: string
  waitMsAfter?: number
}

export interface Combo {
  id: string
  name: string
  description?: string
  toDo?: string
  steps: ComboStep[]
  createdAt: number
  updatedAt: number
  lastRunAt?: number
}

export interface ComboStepExecutionResult {
  stepId: string
  action: ComboActionType
  target: string
  success: boolean
  message: string
}

export interface ComboRunResult {
  comboId: string
  comboName: string
  success: boolean
  message: string
  stepsExecuted: ComboStepExecutionResult[]
}

export interface ComboProgressEvent {
  comboId: string
  stepIndex: number
  totalSteps: number
  stepTarget: string
  status: 'running' | 'success' | 'error'
  message: string
}

// AI Assistant intent contract
export type AiIntentType =
  | 'launch_app'
  | 'install_app'
  | 'update_app'
  | 'uninstall_app'
  | 'run_combo'
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
  | 'osint'
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

export interface SkillUnlockedEvent {
  featureName: string
  at: number
}

export interface AgentStatusEvent {
  status: 'idle' | 'ready' | 'coding' | string
  message: string
  at: number
}

export interface AiNetworkStatus {
  ollama: { running: boolean; modelReady: boolean }
  gemini: { configured: boolean; keyCount: number }
}

/* ------------------------------------------------------------------ */
/* Unified chat / task modes                                           */
/* ------------------------------------------------------------------ */

/**
 * Chat  = conversational desktop assistant (local Ollama / Gemini).
 * Task  = agentic coding mode, routed through the Coder Engine with
 *         snapshots, AST guards and optional OpenCode HTTP transport.
 */
export type ChatMode = 'chat' | 'task'

/* ------------------------------------------------------------------ */
/* AI Network — user-editable endpoint federation                      */
/* ------------------------------------------------------------------ */

export type AiEndpointKind = 'gemini' | 'ollama' | 'opencode'
export type AiEndpointRole = 'chat' | 'triage' | 'coding' | 'reasoning'
export type OpenCodeTransport = 'auto' | 'http' | 'cli'

/**
 * One collaborator in the AI Network. Everything here is read from
 * `.flame/coder_config.json` — no endpoint is hardcoded in the UI or in
 * the router. Keys themselves stay in the encrypted-by-OS secrets file;
 * this only stores the env var name that holds a key.
 */
export interface AiNetworkEndpoint {
  id: string
  label: string
  kind: AiEndpointKind
  enabled: boolean
  baseUrl: string
  model: string
  roles: AiEndpointRole[]
  priority: number
  transport?: OpenCodeTransport
  endpointPath?: string
  apiKeyEnv?: string
  /** CLI command for the OpenCode endpoint, e.g. ['opencode','run','{task}']. */
  command?: string[] | string
}

export interface AiNetworkRouting {
  chat: string[]
  task: string[]
}

export interface AiNetworkGuards {
  ast: boolean
  maxFilesPerRun: number
  protectedGlobs: string[]
  allowElectronInRenderer: boolean
}

export interface AiNetworkConfig {
  version: number
  endpoints: AiNetworkEndpoint[]
  routing: AiNetworkRouting
  guards: AiNetworkGuards
  /** Absolute path of the `.flame/coder_config.json` that was read. */
  configPath: string
}

export interface AiNetworkEndpointState {
  id: string
  label: string
  kind: AiEndpointKind
  enabled: boolean
  online: boolean
  detail: string
  model: string
  roles: AiEndpointRole[]
}

export interface AiNetworkSnapshot {
  config: AiNetworkConfig
  endpoints: AiNetworkEndpointState[]
  /** True when the active chat mode is 'task' in at least one window. */
  taskMode: boolean
}

/* ------------------------------------------------------------------ */
/* Native coder runs (Task mode)                                       */
/* ------------------------------------------------------------------ */

export type TaskRunStatus = 'applied' | 'rolled_back' | 'failed' | 'noop' | 'answered'

export interface TaskRunFileChange {
  path: string
  action: 'create' | 'modify' | 'delete'
  added?: number
  removed?: number
  check?: string
}

export interface TaskRunResult {
  runId: string
  status: TaskRunStatus
  backend: string
  summary: string
  files: TaskRunFileChange[]
  warnings: string[]
  error?: string
  answer?: string
  startedAt: number
  finishedAt: number
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

export type ChatModelId = 'flame' | 'gemini'
export type FlameDifficulty = 'easy' | 'normal' | 'hard' | 'expert'

export interface WhatsAppContact {
  name: string
  phoneNumber: string
}
/**
 * Actions that modify the system (install, update, uninstall, file operations)
 * require user confirmation. The assistant hands back a pending action,
 * the renderer displays a confirmation dialog/card, and only executes
 * if the user approves.
 */
export interface AiPendingAction {
  type: 'uninstall' | 'install' | 'update' | 'fileOperation' | 'selfHeal'
  packageId?: string
  packageName?: string
  operationId?: string
  operationLabel?: string
  icon?: string
  runId?: string
  healHash?: string
}

export interface AiResponse {
  reply: string
  intent: AiIntentType
  app?: string
  actionSuccess?: boolean
  pendingAction?: AiPendingAction
  promptArtifact?: { forTool: string; prompt: string }
  /** Which mode produced this reply (Chat vs Task). */
  mode?: ChatMode
  /** Structured coder-run details when Task mode edited code. */
  task?: TaskRunResult
  /** Generated image metadata if image generation occurred */
  generatedImage?: {
    dataUri?: string
    filePath?: string
    prompt: string
    fileName?: string
  }
  /** Multiple images or screenshots returned by tools, media, or attachments */
  images?: Array<{
    src: string
    caption?: string
    filePath?: string
    fileName?: string
  }>
}

export interface AiStatus {
  running: boolean
  modelReady: boolean
  status?: 'idle' | 'ready' | 'coding' | string
  message?: string
  activeModel?: string
}

export interface ModelConfig {
  localModel: string
  cloudModel: string
  localKeepAlive?: string
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

/* ---- Chess Director & 2-Player Multi-API Arena ---- */

export type ChessGameMode = 'human_vs_ai' | 'ai_vs_ai'

export interface ChessPlayerProfile {
  slot: 'player_1' | 'player_2'
  color: 'White' | 'Black'
  display_name: string
  type: 'human' | 'ai'
  ai_profile: string
  avatar: string
  title: string
}

export interface ChessApiProfile {
  name: string
  provider: 'gemini' | 'ollama' | 'openai' | 'anthropic' | string
  model: string
  endpoint: string
  api_key_masked?: string
}

export interface ChessPlayersState {
  game_mode: ChessGameMode
  player_1: ChessPlayerProfile
  player_2: ChessPlayerProfile
  available_api_profiles: ChessApiProfile[]
}

export interface ChessPieceCoord {
  square: string
  symbol: string
  piece: string
  unicode?: string
  points?: number
}
export type ChessPiece = ChessPieceCoord

export interface ChessMaterialInfo {
  captured_by_white: string[]
  captured_by_black: string[]
  white_points: number
  black_points: number
  net_white_advantage: number
}

export interface ChessLegalMoveDetail {
  uci: string
  san: string
  from: string
  to: string
  piece: string
  is_capture: boolean
  is_castling: boolean
  promotion: string | null
}
export type ChessMoveDetail = ChessLegalMoveDetail

export interface ChessGameStatus {
  status: 'active' | 'checkmate' | 'stalemate' | 'draw_50_moves' | string
  is_game_over: boolean
  turn?: 'White' | 'Black' | string
  winner?: 'White' | 'Black' | string | null
  message?: string
  fullmove?: number
  legal_move_count?: number
}

export interface ChessPositionTelemetry {
  active_turn: 'White' | 'Black' | string
  turn_code: 'w' | 'b' | string
  fullmove_number: number
  fen: string
  castling_rights: string
  en_passant_target: string
  white_pieces: ChessPieceCoord[]
  black_pieces: ChessPieceCoord[]
  occupied_squares: Record<string, string>
  material?: ChessMaterialInfo
  last_move?: { uci: string; san: string; from: string; to: string } | null
  legal_moves_count: number
  legal_moves_uci: string[]
  legal_moves_san: string[]
  legal_moves_detailed: ChessLegalMoveDetail[]
  move_history_uci: string[]
  board_visual: string
  game_status?: ChessGameStatus
  ui_king_in_check_square?: string | null
}

export interface ChessMoveClassification {
  move_number: number
  player: 'White' | 'Black' | string
  move_uci: string
  move_san: string
  from?: string
  to?: string
  classification:
    | 'Brilliant'
    | 'Great'
    | 'Best'
    | 'Book'
    | 'Excellent'
    | 'Good'
    | 'Inaccuracy'
    | 'Mistake'
    | 'Miss'
    | 'Blunder'
    | string
  symbol: string
  color_hex: string
  cp_loss: number
  eval_before_cp?: number
  eval_after_cp?: number
  eval_pawns: number
  move_accuracy_pct: number
  best_move_was: string
  explanation: string
}

export interface ChessSideReview {
  accuracy_pct: number
  counts: Record<string, number>
  avg_cp_loss: number
}

export interface ChessGameReview {
  White: ChessSideReview
  Black: ChessSideReview
  total_moves_graded: number
  recent_moves: ChessMoveClassification[]
  all_moves?: ChessMoveClassification[]
}

export interface ChessArenaState {
  telemetry: ChessPositionTelemetry
  review: ChessGameReview
  players_state: ChessPlayersState
  ui_king_in_check_square: string | null
}

export interface ChessMoveResult {
  move_played: string
  uci: string
  move_classification: ChessMoveClassification
  game_status: ChessGameStatus
  next_player_telemetry: ChessPositionTelemetry
}

export interface ChessMatchTurn {
  ply: number
  player: string
  profile: string
  move: string
  classification: string
  eval_pawns: number
  reasoning: string
}

export interface ChessMatchResult {
  match_Active: string
  ply_executed: number
  turns: ChessMatchTurn[]
  game_review: ChessGameReview
  final_fen: string
  game_status: {
    is_game_over: boolean
    message?: string
  }
  board_ascii: string
}

/* ------------------------------------------------------------------ */
/* Due Messages / Deferred Task Tracker                               */
/* ------------------------------------------------------------------ */

export type DueMessageStatus = 'pending' | 'completed' | 'dismissed'

export interface DueMessage {
  id: string
  title: string
  content?: string
  dueAt?: number
  dueHint?: string
  workspaceContext?: string
  tags?: string[]
  status: DueMessageStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
  dismissedAt?: number
}

export interface CreateDueMessageInput {
  title: string
  content?: string
  dueAt?: number
  dueHint?: string
  workspaceContext?: string
  tags?: string[]
}

/* ------------------------------------------------------------------ */
/* Dynamic Plugin Registry & Toggles                                  */
/* ------------------------------------------------------------------ */

export type FlamePluginCategory = 'system' | 'analysis' | 'ai' | 'developer' | 'tools' | 'communication'

export interface FlamePluginMeta {
  id: string
  name: string
  description: string
  category: FlamePluginCategory
  enabled: boolean
  capabilities: string[]
  links?: { label: string; to: string }[]
  subSections?: { name: string; description?: string; status?: string; to: string }[]
}

/* ------------------------------------------------------------------ */
/* Image Generation                                                   */
/* ------------------------------------------------------------------ */

export interface ImageGenerationOptions {
  prompt: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  sampleCount?: number
  outputFormat?: 'image/jpeg' | 'image/png'
}

export interface GeneratedImageResult {
  success: boolean
  message: string
  prompt: string
  filePath?: string
  fileName?: string
  dataUri?: string
  aspectRatio?: string
  createdAt: number
  error?: string
}

/* ------------------------------------------------------------------ */
/* Model Context Protocol (MCP)                                       */
/* ------------------------------------------------------------------ */

export interface McpServerStatus {
  id: string
  name: string
  running: boolean
  online?: boolean
  toolCount: number
  tools: string[]
  error?: string
  pid?: number | null
}

/* ------------------------------------------------------------------ */
/* Error Guardian                                                     */
/* ------------------------------------------------------------------ */

export interface ErrorGuardianIncident {
  hash: string
  errorMessage: string
  stack?: string
  timestamp: number
  circuitBroken?: boolean
  proposal?: unknown
}

export interface HealProposalPayload {
  hash: string
  errorMessage: string
  timestamp: number
  proposal: {
    run_id?: string
    status: string
    files: Array<{ path: string; action: string; added?: number; removed?: number }>
    summary?: string
  }
}
