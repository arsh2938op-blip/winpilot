import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { getGoogleApiKey } from '../ai/googleKeyStore'
import type {
  ChessArenaState,
  ChessGameMode,
  ChessPlayerProfile,
  ChessPlayersState,
  ChessApiProfile,
  ChessPositionTelemetry,
  ChessGameReview,
  ChessMoveResult,
  ChessMatchResult
} from '@shared/types'

const DEFAULT_PORT = 8765
let serverProcess: ChildProcess | null = null
let cachedEnginePath: string | undefined

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function walkUp(start: string): string[] {
  const candidates: string[] = []
  let dir = path.resolve(start)
  for (let i = 0; i < 5 && dir !== path.parse(dir).root; i++) {
    candidates.push(path.join(dir, 'chess_engine.py'))
    dir = path.dirname(dir)
  }
  return candidates
}

export async function findChessEngine(): Promise<string> {
  if (cachedEnginePath && (await exists(cachedEnginePath))) return cachedEnginePath

  const candidates = [
    path.join(process.cwd(), 'chess_engine.py'),
    path.join(process.cwd(), '..', 'chess_engine.py'),
    path.join(app.getAppPath(), 'chess_engine.py'),
    path.join(app.getAppPath(), '..', 'chess_engine.py'),
    ...walkUp(process.cwd()),
    ...walkUp(app.getAppPath())
  ]

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      cachedEnginePath = candidate
      return candidate
    }
  }

  throw new Error('chess_engine.py was not found in the workspace root.')
}

let cachedPythonExe: string | undefined

async function testPythonExecutable(exe: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(exe, ['--version'], { windowsHide: true })
      child.on('error', () => resolve(false))
      child.on('close', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

async function resolvePython(): Promise<string> {
  if (cachedPythonExe && (await testPythonExecutable(cachedPythonExe))) {
    return cachedPythonExe
  }

  const localAppData = process.env.LOCALAPPDATA || ''
  const userProfile = process.env.USERPROFILE || ''
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

  const candidates: string[] = [
    'py',
    'python',
    'python3',
    path.join(localAppData, 'Programs', 'Python', 'Launcher', 'py.exe'),
    path.join(localAppData, 'Python', 'bin', 'python.exe'),
    path.join(localAppData, 'Python', 'bin', 'python3.14.exe'),
    path.join(localAppData, 'Python', 'bin', 'py.exe'),
    path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Launcher', 'py.exe'),
    path.join(userProfile, 'AppData', 'Local', 'Python', 'bin', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python314', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(programFiles, 'Python314', 'python.exe'),
    path.join(programFiles, 'Python313', 'python.exe'),
    path.join(programFiles, 'Python312', 'python.exe'),
    path.join(programFiles, 'Python311', 'python.exe'),
    path.join(programFilesX86, 'Python314', 'python.exe'),
    path.join(programFilesX86, 'Python313', 'python.exe'),
    path.join(programFilesX86, 'Python312', 'python.exe')
  ]

  for (const exe of candidates) {
    if (await testPythonExecutable(exe)) {
      cachedPythonExe = exe
      return exe
    }
  }

  throw new Error('Python was not found on PATH or in standard Windows installation directories.')
}

export async function startChessServer(port = DEFAULT_PORT): Promise<{ success: boolean; message: string; port: number }> {
  if (serverProcess && !serverProcess.killed) {
    return { success: true, message: `Chess server already running on port ${port}`, port }
  }

  // Check if an existing server is already answering on port
  try {
    const checkRes = await fetch(`http://127.0.0.1:${port}/api/position`, { signal: AbortSignal.timeout(600) })
    if (checkRes.ok) {
      return { success: true, message: `Chess server already active on port ${port}`, port }
    }
  } catch {
    // Offline, will spawn
  }

  const py = await resolvePython()
  const script = await findChessEngine()
  const scriptDir = path.dirname(script)

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  }
  try {
    const gKey = await getGoogleApiKey()
    if (gKey && !env.GEMINI_API_KEY) {
      env.GEMINI_API_KEY = gKey
    }
  } catch {
    // ignore
  }

  return new Promise((resolve) => {
    let stderrOutput = ''
    let resolved = false

    const child = spawn(py, [script, '--serve', '--port', String(port)], {
      cwd: scriptDir,
      windowsHide: true,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    serverProcess = child

    child.stderr?.on('data', (chunk) => {
      stderrOutput += chunk.toString()
    })

    child.on('error', (err) => {
      serverProcess = null
      if (!resolved) {
        resolved = true
        resolve({ success: false, message: `Failed to start chess server: ${err.message}`, port })
      }
    })

    child.on('close', (code) => {
      serverProcess = null
      if (!resolved) {
        resolved = true
        resolve({
          success: false,
          message: `Chess server exited with code ${code}: ${stderrOutput.slice(0, 300) || 'process closed'}`,
          port
        })
      }
    })

    // Poll until server answers on http://127.0.0.1:${port}/api/position
    const startTime = Date.now()
    const checkInterval = setInterval(async () => {
      if (resolved) {
        clearInterval(checkInterval)
        return
      }
      try {
        const checkRes = await fetch(`http://127.0.0.1:${port}/api/position`, { signal: AbortSignal.timeout(400) })
        if (checkRes.ok) {
          resolved = true
          clearInterval(checkInterval)
          resolve({ success: true, message: `Chess server active on port ${port}`, port })
          return
        }
      } catch {
        // Still starting
      }

      if (Date.now() - startTime > 7000) {
        resolved = true
        clearInterval(checkInterval)
        resolve({
          success: false,
          message: `Chess server started but timed out waiting for port ${port}. ${stderrOutput.slice(0, 300)}`,
          port
        })
      }
    }, 200)
  })
}

export function stopChessServer(): { success: boolean; message: string } {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill('SIGTERM')
    } catch {
      // ignore
    }
    serverProcess = null
    return { success: true, message: 'Chess server stopped.' }
  }
  return { success: true, message: 'Chess server was not running.' }
}

export function stopChessEngineServer(): { success: boolean; message: string } {
  return stopChessServer()
}

export function isChessServerRunning(): boolean {
  return !!serverProcess && !serverProcess.killed
}

export async function getChessStatus(): Promise<{ running: boolean; port: number }> {
  const running = isChessServerRunning()
  if (running) return { running: true, port: DEFAULT_PORT }

  try {
    const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/position`, { signal: AbortSignal.timeout(800) })
    if (res.ok) return { running: true, port: DEFAULT_PORT }
  } catch {
    // offline
  }
  return { running: false, port: DEFAULT_PORT }
}

async function requestChessApi<T>(pathUrl: string, method = 'GET', body?: unknown): Promise<T> {
  const status = await getChessStatus()
  if (!status.running) {
    await startChessServer(DEFAULT_PORT)
  }

  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}${pathUrl}`, options)
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Chess engine returned status ${res.status}`)
  }
  return (await res.json()) as T
}

export async function getPosition(): Promise<ChessPositionTelemetry> {
  return requestChessApi<ChessPositionTelemetry>('/api/position')
}

export async function makeMove(move: string): Promise<ChessMoveResult> {
  return requestChessApi<ChessMoveResult>('/api/move', 'POST', { move })
}

export async function getReview(): Promise<ChessGameReview> {
  return requestChessApi<ChessGameReview>('/api/review')
}

export async function newGame(fen?: string): Promise<{ message: string; telemetry: ChessPositionTelemetry }> {
  return requestChessApi<{ message: string; telemetry: ChessPositionTelemetry }>('/api/new-game', 'POST', fen ? { fen } : {})
}

export async function undoMove(count = 1): Promise<{ undone_move: string; telemetry: ChessPositionTelemetry }> {
  return requestChessApi<{ undone_move: string; telemetry: ChessPositionTelemetry }>('/api/undo', 'POST', { count })
}

export async function directAiTurn(profileName: string): Promise<Record<string, unknown>> {
  return requestChessApi<Record<string, unknown>>('/api/ai/turn', 'POST', { profile_name: profileName })
}

export async function runMatch(
  whiteProfile: string,
  blackProfile: string,
  maxPly = 6,
  resetFirst = false
): Promise<ChessMatchResult> {
  return requestChessApi<ChessMatchResult>('/api/ai-vs-ai/match', 'POST', {
    white_profile: whiteProfile,
    black_profile: blackProfile,
    max_ply: maxPly,
    reset_first: resetFirst
  })
}

export async function listApis(): Promise<{ profiles: ChessApiProfile[] }> {
  return requestChessApi<{ profiles: ChessApiProfile[] }>('/api/settings/apis')
}

export async function saveApi(profile: {
  name: string
  provider: string
  model: string
  endpoint?: string
  api_key?: string
}): Promise<{ status: string; profile: ChessApiProfile }> {
  return requestChessApi<{ status: string; profile: ChessApiProfile }>('/api/settings/save-api', 'POST', profile)
}

/* ---------------------------------------------------------------------------
 * Arena & 2-Player State Management
 * ------------------------------------------------------------------------ */

function playersFilePath(): string {
  try {
    return path.join(app.getPath('userData'), 'chess_players.json')
  } catch {
    return path.join(process.cwd(), '.flame', 'chess_players.json')
  }
}

const DEFAULT_PLAYERS_STATE: ChessPlayersState = {
  game_mode: 'human_vs_ai',
  player_1: {
    slot: 'player_1',
    color: 'White',
    display_name: 'You',
    type: 'human',
    ai_profile: '',
    avatar: '👤',
    title: 'Challenger'
  },
  player_2: {
    slot: 'player_2',
    color: 'Black',
    display_name: 'Flame Grandmaster',
    type: 'ai',
    ai_profile: 'gemini-flash',
    avatar: '🔥',
    title: 'Grandmaster'
  },
  available_api_profiles: []
}

export async function getPlayers(): Promise<ChessPlayersState> {
  let saved: Partial<ChessPlayersState> = {}
  try {
    const raw = await fs.readFile(playersFilePath(), 'utf-8')
    saved = JSON.parse(raw) as Partial<ChessPlayersState>
  } catch {
    // use defaults
  }

  let profiles: ChessApiProfile[] = []
  try {
    const res = await listApis()
    profiles = res.profiles || []
  } catch {
    profiles = [
      { name: 'gemini-flash', provider: 'gemini', model: 'gemini-2.5-flash', endpoint: 'https://generativelanguage.googleapis.com/v1beta' },
      { name: 'local-qwen', provider: 'ollama', model: 'qwen2.5-coder:1.5b', endpoint: 'http://127.0.0.1:11434/api/generate' }
    ]
  }

  return {
    game_mode: saved.game_mode || DEFAULT_PLAYERS_STATE.game_mode,
    player_1: { ...DEFAULT_PLAYERS_STATE.player_1, ...(saved.player_1 || {}) },
    player_2: { ...DEFAULT_PLAYERS_STATE.player_2, ...(saved.player_2 || {}) },
    available_api_profiles: profiles
  }
}

export async function setPlayers(payload: {
  game_mode?: ChessGameMode
  player_1?: Partial<ChessPlayerProfile>
  player_2?: Partial<ChessPlayerProfile>
}): Promise<ChessPlayersState> {
  const current = await getPlayers()
  const updated: ChessPlayersState = {
    game_mode: payload.game_mode || current.game_mode,
    player_1: { ...current.player_1, ...(payload.player_1 || {}) },
    player_2: { ...current.player_2, ...(payload.player_2 || {}) },
    available_api_profiles: current.available_api_profiles
  }

  try {
    const fPath = playersFilePath()
    await fs.mkdir(path.dirname(fPath), { recursive: true })
    await fs.writeFile(fPath, JSON.stringify(updated, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save chess players state:', err)
  }

  return updated
}

export async function getArenaState(): Promise<ChessArenaState> {
  const telemetry = await getPosition()
  const review = await getReview()
  const players_state = await getPlayers()
  const ui_king_in_check_square = telemetry.ui_king_in_check_square || null

  return {
    telemetry,
    review,
    players_state,
    ui_king_in_check_square
  }
}

export async function arenaNewGame(fen?: string): Promise<ChessArenaState> {
  await newGame(fen)
  return getArenaState()
}

export async function arenaUndo(count = 1): Promise<ChessArenaState> {
  await undoMove(count)
  return getArenaState()
}

export async function playHumanVsAiMove(move: string, aiProfile?: string): Promise<Record<string, unknown>> {
  const humanMoveResult = await makeMove(move)

  if (humanMoveResult.game_status?.is_game_over) {
    const state = await getArenaState()
    return {
      human: humanMoveResult,
      ai: null,
      arena_state: state
    }
  }

  const players = await getPlayers()
  const isNowWhite = humanMoveResult.next_player_telemetry?.turn_code === 'w'
  const chosenProfile =
    aiProfile ||
    (isNowWhite ? players.player_1.ai_profile : players.player_2.ai_profile) ||
    'gemini-flash'

  let aiTurnResult: Record<string, unknown> | null = null
  try {
    aiTurnResult = await directAiTurn(chosenProfile)
  } catch (err) {
    aiTurnResult = { error: err instanceof Error ? err.message : String(err) }
  }

  const state = await getArenaState()
  return {
    human: humanMoveResult,
    ai: aiTurnResult,
    arena_state: state
  }
}

export async function saveApiProfile(profile: {
  name: string
  provider: string
  model: string
  endpoint?: string
  api_key?: string
}): Promise<ChessPlayersState> {
  await saveApi(profile)
  return getPlayers()
}

export async function listApiProfiles(): Promise<ChessApiProfile[]> {
  const res = await listApis()
  return res.profiles || []
}
