import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Crown,
  Swords,
  RotateCcw,
  Undo2,
  Play,
  Bot,
  User,
  Settings as SettingsIcon,
  Sparkles,
  ArrowLeft,
  Power,
  RefreshCw,
  Trophy,
  Activity,
  Layers,
  ChevronRight,
  ShieldAlert,
  Save,
  Plus
} from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import type {
  ChessArenaState,
  ChessGameMode,
  ChessPlayerProfile,
  ChessPlayersState,
  ChessApiProfile,
  ChessMoveClassification,
  ChessPositionTelemetry,
  ChessGameReview,
  ChessMatchResult,
  ChessMatchTurn
} from '@shared/types'

/* ---------------------------------------------------------------------------
 * High-Definition Staunton SVG Chess Pieces
 * ------------------------------------------------------------------------ */
function StauntonPiece({ symbol, className }: { symbol: string; className?: string }): React.JSX.Element {
  const isWhite = symbol === symbol.toUpperCase()
  const type = symbol.toUpperCase()

  const fill = isWhite ? '#f8fafc' : '#1e293b'
  const stroke = isWhite ? '#334155' : '#0f172a'
  const highlight = isWhite ? '#ffffff' : '#475569'

  switch (type) {
    case 'K':
      return (
        <svg viewBox="0 0 45 45" className={cn('drop-shadow-md select-none', className)}>
          <g fill="none" fillRule="evenodd" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22.5 11.63V6M20 8h5" strokeLinejoin="miter" />
            <path
              d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
              fill={fill}
              stroke={stroke}
            />
            <path
              d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z"
              fill={fill}
            />
            <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" />
          </g>
        </svg>
      )
    case 'Q':
      return (
        <svg viewBox="0 0 45 45" className={cn('drop-shadow-md select-none', className)}>
          <g fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-13.5V25l-7-11 2 12z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
            <path d="M11.5 30c3.5-1 18.5-1 22 0m-21.5 4c4-1 15-1 19 0m-19 3c4-1 15-1 19 0" stroke={stroke} fill="none" />
            <circle cx="6" cy="12" r="2" fill={highlight} />
            <circle cx="14" cy="9" r="2" fill={highlight} />
            <circle cx="22.5" cy="8" r="2" fill={highlight} />
            <circle cx="31" cy="9" r="2" fill={highlight} />
            <circle cx="39" cy="12" r="2" fill={highlight} />
          </g>
        </svg>
      )
    case 'R':
      return (
        <svg viewBox="0 0 45 45" className={cn('drop-shadow-md select-none', className)}>
          <g fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 39h27v-3H9v3zm3-3v-4.5h21V36H12zm2-4.5l1.5-12.5h14L31 31.5H14zM11 14h23l-2 5H13l-2-5zm0-5h4v3h-4V9zm9 0h5v3h-5V9zm10 0h4v3h-4V9z" />
            <path d="M14 29.5h17m-18-4h19m-18-4h17m-17-4h17" stroke={stroke} fill="none" />
          </g>
        </svg>
      )
    case 'B':
      return (
        <svg viewBox="0 0 45 45" className={cn('drop-shadow-md select-none', className)}>
          <g fill="none" fillRule="evenodd" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <g fill={fill}>
              <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z" />
              <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
              <circle cx="22.5" cy="8.5" r="1.5" fill={highlight} />
            </g>
            <path d="M17.5 26h10M15 30h15m-7.5-14.5v5m-3-2.5h6" />
          </g>
        </svg>
      )
    case 'N':
      return (
        <svg viewBox="0 0 45 45" className={cn('drop-shadow-md select-none', className)}>
          <g fill="none" fillRule="evenodd" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"
              fill={fill}
            />
            <path
              d="M24 18c.338 1.5-3.5 4.5-6 3-2.5-1.5-3.5-4-1-6.5 2.5-2.5 6.5-1.5 7 3.5z"
              fill={fill}
            />
            <path
              d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.5-8.5c1.5-1 3.5-1.5 5.5-1.5 4 0 7.5 2 9.5 5.5 1.5 2.5 1.5 5.5 1.5 8.5 0 3-.5 6-2 8.5-1.5 2.5-4 4.5-7 5.5-3 1-6.5 1-9.5 0-3-1-5.5-3-7-5.5-1.5-2.5-2-5.5-2-8.5 0-3 .5-6 2-8.5 1.5-2.5 4-4 6.5-5z"
              fill={fill}
            />
            <circle cx="15" cy="14" r="1.5" fill={stroke} />
          </g>
        </svg>
      )
    case 'P':
    default:
      return (
        <svg viewBox="0 0 45 45" className={cn('drop-shadow-md select-none', className)}>
          <g fill={fill} fillRule="evenodd" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38-1.95 1.12-3.28 3.21-3.28 5.62 0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" />
          </g>
        </svg>
      )
  }
}

/* ---------------------------------------------------------------------------
 * Move Classification Pill Component
 * ------------------------------------------------------------------------ */
function ClassificationBadge({ classification }: { classification?: ChessMoveClassification | null }): React.JSX.Element | null {
  if (!classification) return null

  const tierColors: Record<string, { bg: string; text: string; border: string }> = {
    Brilliant: { bg: 'bg-[#1ba6ac]/20', text: 'text-[#1ba6ac]', border: 'border-[#1ba6ac]/50' },
    Great: { bg: 'bg-[#5c8bb0]/20', text: 'text-[#5c8bb0]', border: 'border-[#5c8bb0]/50' },
    Best: { bg: 'bg-[#96bc4b]/20', text: 'text-[#96bc4b]', border: 'border-[#96bc4b]/50' },
    Book: { bg: 'bg-[#a88865]/20', text: 'text-[#d4af37]', border: 'border-[#a88865]/50' },
    Excellent: { bg: 'bg-[#96bc4b]/20', text: 'text-[#96bc4b]', border: 'border-[#96bc4b]/50' },
    Good: { bg: 'bg-[#81b64c]/20', text: 'text-[#81b64c]', border: 'border-[#81b64c]/50' },
    Inaccuracy: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50' },
    Mistake: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
    Miss: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/50' },
    Blunder: { bg: 'bg-red-600/25', text: 'text-red-400', border: 'border-red-500/50' }
  }

  const cTier = classification.classification || 'Good'
  const style = tierColors[cTier] || { bg: 'bg-primary/20', text: 'text-primary', border: 'border-primary/40' }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all shadow-sm',
        style.bg,
        style.text,
        style.border
      )}
      title={`${cTier}: ${classification.explanation} (Loss: ${classification.cp_loss} cp)`}
    >
      <span>{classification.symbol}</span>
      <span>{cTier}</span>
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * Main Chess Arena Component
 * ------------------------------------------------------------------------ */
export default function ChessArena(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'arena' | 'match' | 'review' | 'telemetry' | 'settings'>('arena')
  const [serverOnline, setServerOnline] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Arena state
  const [arenaState, setArenaState] = useState<ChessArenaState | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [flippedBoard, setFlippedBoard] = useState(false)
  const [moveInput, setMoveInput] = useState('')

  // Match director state
  const [matchRunning, setMatchRunning] = useState(false)
  const [maxPly, setMaxPly] = useState(8)
  const [matchTurns, setMatchTurns] = useState<ChessMatchTurn[]>([])

  // New profile creation form
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileProvider, setNewProfileProvider] = useState<'gemini' | 'ollama' | 'openai' | 'anthropic'>('gemini')
  const [newProfileModel, setNewProfileModel] = useState('gemini-2.5-flash')
  const [newProfileEndpoint, setNewProfileEndpoint] = useState('')
  const [newProfileKey, setNewProfileKey] = useState('')

  const chessApi = window.api?.chess || window.winpilot?.chess

  // Fetch complete state
  const refreshState = useCallback(async (): Promise<void> => {
    if (!chessApi) return
    try {
      const state = await chessApi.getState()
      setArenaState(state)
      setServerOnline(true)
    } catch {
      setServerOnline(false)
    }
  }, [chessApi])

  // Initial load and periodic heartbeats
  useEffect(() => {
    void refreshState()
    const timer = setInterval(() => {
      void refreshState()
    }, 4500)
    return () => clearInterval(timer)
  }, [refreshState])

  const telemetry = arenaState?.telemetry
  const review = arenaState?.review
  const playersState = arenaState?.players_state
  const kingInCheck = arenaState?.ui_king_in_check_square

  // Toggle server engine
  const handleToggleServer = async (): Promise<void> => {
    if (!chessApi) return
    setLoading(true)
    setStatusMessage(null)
    try {
      if (serverOnline) {
        await chessApi.stopServer()
        setServerOnline(false)
        setStatusMessage('Chess engine stopped.')
      } else {
        const res = await chessApi.startServer(8765)
        if (res.success) {
          setServerOnline(true)
          setStatusMessage(`Chess engine active on port ${res.port}.`)
          await refreshState()
        }
      }
    } catch (err) {
      setStatusMessage(`Engine error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // Legal moves lookup map: square -> target squares
  const legalMoveDestinations = useMemo(() => {
    if (!selectedSquare || !telemetry?.legal_moves_detailed) return new Set<string>()
    const dests = new Set<string>()
    for (const m of telemetry.legal_moves_detailed) {
      if (m.from.toLowerCase() === selectedSquare.toLowerCase()) {
        dests.add(m.to.toLowerCase())
      }
    }
    return dests
  }, [selectedSquare, telemetry?.legal_moves_detailed])

  // Square Click handler (move execution)
  const handleSquareClick = async (sq: string): Promise<void> => {
    if (!chessApi || loading || matchRunning) return
    const activeColorCode = telemetry?.turn_code || 'w'

    if (!selectedSquare) {
      // Pick piece if it belongs to active turn
      const pieceData = telemetry?.white_pieces.concat(telemetry.black_pieces).find((p) => p.square === sq)
      if (pieceData) {
        const isWhitePiece = pieceData.symbol === pieceData.symbol.toUpperCase()
        if ((isWhitePiece && activeColorCode === 'w') || (!isWhitePiece && activeColorCode === 'b')) {
          setSelectedSquare(sq)
        }
      }
      return
    }

    if (selectedSquare === sq) {
      setSelectedSquare(null)
      return
    }

    // Attempt move from selectedSquare to sq
    const uciCand = `${selectedSquare}${sq}`
    setSelectedSquare(null)
    await handlePlayMove(uciCand)
  }

  const handlePlayMove = async (moveStr: string): Promise<void> => {
    if (!chessApi || !moveStr.trim()) return
    setLoading(true)
    setStatusMessage(null)
    try {
      const mode = playersState?.game_mode || 'human_vs_ai'
      if (mode === 'human_vs_ai') {
        const res = await chessApi.playHumanVsAiMove(moveStr.trim())
        if (res.arena_state) {
          setArenaState(res.arena_state as ChessArenaState)
        } else {
          await refreshState()
        }
        if (res.human) {
          const hm = res.human as { move_played?: string; move_classification?: ChessMoveClassification }
          setStatusMessage(`You played ${hm.move_played || moveStr}.`)
        }
        if (res.ai) {
          const am = res.ai as { move_played_san?: string; error?: string }
          if (am.move_played_san) {
            setStatusMessage((prev) => `${prev} AI responded with ${am.move_played_san}.`)
          }
        }
      } else {
        await chessApi.makeMove(moveStr.trim())
        await refreshState()
      }
      setMoveInput('')
    } catch (err) {
      setStatusMessage(`Illegal move: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleNewGame = async (): Promise<void> => {
    if (!chessApi) return
    setLoading(true)
    try {
      const state = await chessApi.newGame()
      setArenaState(state)
      setSelectedSquare(null)
      setMatchTurns([])
      setStatusMessage('New match initialized.')
    } catch (err) {
      setStatusMessage(`Error starting new game: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async (): Promise<void> => {
    if (!chessApi) return
    setLoading(true)
    try {
      const mode = playersState?.game_mode || 'human_vs_ai'
      const count = mode === 'human_vs_ai' ? 2 : 1
      const state = await chessApi.undo(count)
      setArenaState(state)
      setSelectedSquare(null)
      setStatusMessage(`Undone ${count} half-move(s).`)
    } catch (err) {
      setStatusMessage(`Undo failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDirectAiTurn = async (): Promise<void> => {
    if (!chessApi || !telemetry) return
    const activeColorCode = telemetry.turn_code
    const profile =
      activeColorCode === 'w'
        ? playersState?.player_1.ai_profile || 'gemini-flash'
        : playersState?.player_2.ai_profile || 'local-qwen'

    setLoading(true)
    setStatusMessage(`Directing AI (${profile}) to choose move…`)
    try {
      const res = (await chessApi.directAiTurn(profile)) as { move_played_san?: string; error?: string }
      if (res.error) {
        setStatusMessage(`AI turn error: ${res.error}`)
      } else {
        await refreshState()
        setStatusMessage(`AI (${profile}) played: ${res.move_played_san || 'Move complete'}`)
      }
    } catch (err) {
      setStatusMessage(`AI turn failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRunAiMatch = async (): Promise<void> => {
    if (!chessApi) return
    setMatchRunning(true)
    const white = playersState?.player_1.ai_profile || 'gemini-flash'
    const black = playersState?.player_2.ai_profile || 'local-qwen'
    setStatusMessage(`AI vs AI Arena match running: ${white} vs ${black} (${maxPly} ply)…`)
    try {
      const res = (await chessApi.runAiVsAiMatch(white, black, maxPly, false)) as unknown as ChessMatchResult
      if (res.turns) {
        setMatchTurns(res.turns)
      }
      await refreshState()
      setStatusMessage(`Match finished: ${res.ply_executed || maxPly} half-moves executed.`)
    } catch (err) {
      setStatusMessage(`Match error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setMatchRunning(false)
    }
  }

  const handleSaveApiProfile = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!chessApi || !newProfileName.trim() || !newProfileModel.trim()) return
    setLoading(true)
    try {
      const updated = await chessApi.saveApiProfile({
        name: newProfileName.trim(),
        provider: newProfileProvider,
        model: newProfileModel.trim(),
        endpoint: newProfileEndpoint.trim(),
        api_key: newProfileKey.trim()
      })
      setArenaState((prev) => (prev ? { ...prev, players_state: updated } : null))
      setNewProfileName('')
      setNewProfileKey('')
      setStatusMessage(`Saved AI profile: ${newProfileName.trim()}`)
    } catch (err) {
      setStatusMessage(`Failed to save profile: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateGameMode = async (mode: ChessGameMode): Promise<void> => {
    if (!chessApi) return
    try {
      const updated = await chessApi.setPlayers({
        game_mode: mode,
        player_1: { type: 'human', display_name: 'You' },
        player_2: { type: mode === 'ai_vs_ai' ? 'ai' : 'ai', display_name: mode === 'ai_vs_ai' ? 'AI Black' : 'Flame Grandmaster' }
      })
      setArenaState((prev) => (prev ? { ...prev, players_state: updated } : null))
    } catch (err) {
      console.error(err)
    }
  }

  // Build 64-square grid from telemetry FEN
  const boardSquares = useMemo(() => {
    const fen = telemetry?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const fenBoard = fen.split(' ')[0]
    const ranks = fenBoard.split('/')

    const squares: Array<{ square: string; piece: string | null; isDark: boolean; rank: number; file: number }> = []

    const rankIndices = flippedBoard ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
    const fileIndices = flippedBoard ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]

    for (const r of rankIndices) {
      const rankStr = ranks[7 - r] || '8'
      const rowPieces: Array<string | null> = []
      for (const ch of rankStr) {
        if (ch >= '1' && ch <= '8') {
          const count = parseInt(ch, 10)
          for (let i = 0; i < count; i++) rowPieces.push(null)
        } else {
          rowPieces.push(ch)
        }
      }

      for (const f of fileIndices) {
        const sqName = `${String.fromCharCode(97 + f)}${r + 1}`
        squares.push({
          square: sqName,
          piece: rowPieces[f] || null,
          isDark: (f + r) % 2 === 0,
          rank: r + 1,
          file: f
        })
      }
    }

    return squares
  }, [telemetry?.fen, flippedBoard])

  // Get last classification for destination square badge
  const lastMove = telemetry?.last_move
  const lastClassification = review?.recent_moves?.[review.recent_moves.length - 1]

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/plugins" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Plugins
        </Link>
        <span>/</span>
        <span className="text-foreground font-semibold">Chess Director & 2-Player Arena</span>
      </div>

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Chess Director & 2-Player Arena"
          description="Autonomous AI-vs-AI & Human-vs-AI director, 3D SVG Staunton pieces, spoiler-free telemetry, and Chess.com 10-tier move classifier."
        />

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={serverOnline ? 'default' : 'outline'}
            onClick={handleToggleServer}
            disabled={loading}
            className="flex items-center gap-2 shadow-sm"
          >
            <Power className={cn('h-3.5 w-3.5', serverOnline ? 'text-emerald-400' : 'text-muted-foreground')} />
            {serverOnline ? 'Engine Online' : 'Start Engine'}
          </Button>
          <Badge variant={serverOnline ? 'success' : 'secondary'} className="text-xs">
            {serverOnline ? 'REST :8765' : 'Offline'}
          </Badge>
        </div>
      </div>

      {/* Notification / Status Message */}
      {statusMessage && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs text-foreground flex items-center justify-between shadow-sm animate-in fade-in">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-muted-foreground hover:text-foreground text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border/60 gap-1 pb-1 text-sm font-medium">
        <button
          onClick={() => setActiveTab('arena')}
          className={cn(
            'px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'arena' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Crown className="h-4 w-4 text-amber-400" /> Live Board
        </button>
        <button
          onClick={() => setActiveTab('match')}
          className={cn(
            'px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'match' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Swords className="h-4 w-4 text-purple-400" /> AI vs AI Match
        </button>
        <button
          onClick={() => setActiveTab('review')}
          className={cn(
            'px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'review' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Trophy className="h-4 w-4 text-emerald-400" /> Game Review (CAPS)
        </button>
        <button
          onClick={() => setActiveTab('telemetry')}
          className={cn(
            'px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'telemetry' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Layers className="h-4 w-4 text-cyan-400" /> AI Telemetry
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={cn(
            'px-3.5 py-2 rounded-lg transition-colors flex items-center gap-2',
            activeTab === 'settings' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <SettingsIcon className="h-4 w-4 text-muted-foreground" /> 2-Player & API Profiles
        </button>
      </div>

      {/* TAB 1: LIVE BOARD & ARENA */}
      {activeTab === 'arena' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: 2-Player Header + Staunton Chessboard */}
          <div className="lg:col-span-7 space-y-4">
            {/* Player 2 (Black) Scoreboard Header */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl shadow-inner">
                  {playersState?.player_2.avatar || '🔥'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{playersState?.player_2.display_name || 'Black Player'}</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                      {playersState?.player_2.type === 'human' ? 'Human' : playersState?.player_2.ai_profile || 'AI'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{playersState?.player_2.title || 'Grandmaster'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">
                      Accuracy: {review?.Black?.accuracy_pct !== undefined ? `${review.Black.accuracy_pct}%` : '100%'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Black Captured Material */}
              <div className="flex items-center gap-1 text-xs">
                {telemetry?.material?.captured_by_black?.map((piece, i) => (
                  <span key={i} className="text-muted-foreground select-none" title={piece}>
                    {piece}
                  </span>
                ))}
                {(telemetry?.material?.net_white_advantage || 0) < 0 && (
                  <span className="ml-1 text-xs font-semibold text-emerald-400">
                    +{Math.abs(telemetry?.material?.net_white_advantage || 0)}
                  </span>
                )}
              </div>
            </div>

            {/* The Chessboard Container */}
            <div className="relative mx-auto max-w-[540px] aspect-square rounded-2xl overflow-hidden border-2 border-border/80 shadow-2xl bg-zinc-950 p-3 select-none">
              <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden border border-zinc-800">
                {boardSquares.map((cell) => {
                  const isSelected = selectedSquare === cell.square
                  const isLegalTarget = legalMoveDestinations.has(cell.square.toLowerCase())
                  const isLastMoveFrom = lastMove?.from?.toLowerCase() === cell.square.toLowerCase()
                  const isLastMoveTo = lastMove?.to?.toLowerCase() === cell.square.toLowerCase()
                  const isKingCheck = kingInCheck?.toLowerCase() === cell.square.toLowerCase()

                  // Tile background colors
                  let tileColor = cell.isDark ? 'bg-[#b58863]' : 'bg-[#f0d9b5]'
                  if (isLastMoveFrom || isLastMoveTo) {
                    tileColor = cell.isDark ? 'bg-[#cdd26a]' : 'bg-[#f7f784]'
                  }
                  if (isSelected) {
                    tileColor = 'bg-amber-400/80 shadow-inner'
                  }

                  return (
                    <div
                      key={cell.square}
                      onClick={() => handleSquareClick(cell.square)}
                      className={cn(
                        'relative flex items-center justify-center cursor-pointer transition-colors',
                        tileColor,
                        isKingCheck && 'ring-4 ring-inset ring-red-500 bg-red-600/40 animate-pulse'
                      )}
                    >
                      {/* Rank & File Coordinate Labels */}
                      {cell.file === (flippedBoard ? 7 : 0) && (
                        <span
                          className={cn(
                            'absolute top-0.5 left-1 text-[10px] font-bold select-none leading-none pointer-events-none',
                            cell.isDark ? 'text-[#f0d9b5]/80' : 'text-[#b58863]/80'
                          )}
                        >
                          {cell.rank}
                        </span>
                      )}
                      {cell.rank === (flippedBoard ? 8 : 1) && (
                        <span
                          className={cn(
                            'absolute bottom-0.5 right-1 text-[10px] font-bold select-none leading-none pointer-events-none',
                            cell.isDark ? 'text-[#f0d9b5]/80' : 'text-[#b58863]/80'
                          )}
                        >
                          {cell.square[0]}
                        </span>
                      )}

                      {/* Chess Piece SVG */}
                      {cell.piece && (
                        <div className="w-[82%] h-[82%] flex items-center justify-center transition-transform hover:scale-105 active:scale-95">
                          <StauntonPiece symbol={cell.piece} className="w-full h-full" />
                        </div>
                      )}

                      {/* Legal Move Dot or Capture Ring */}
                      {isLegalTarget && (
                        <div
                          className={cn(
                            'pointer-events-none absolute z-10 rounded-full transition-transform',
                            cell.piece
                              ? 'inset-1 border-4 border-black/30'
                              : 'h-4 w-4 bg-black/25 shadow-sm'
                          )}
                        />
                      )}

                      {/* Pin Classification Badge on Destination Square */}
                      {isLastMoveTo && lastClassification && (
                        <div className="absolute -top-1.5 -right-1.5 z-20 scale-75 origin-top-right">
                          <ClassificationBadge classification={lastClassification} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Player 1 (White) Scoreboard Header */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-100 border border-zinc-300 flex items-center justify-center text-xl shadow-inner text-zinc-900">
                  {playersState?.player_1.avatar || '👤'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{playersState?.player_1.display_name || 'White Player'}</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                      {playersState?.player_1.type === 'human' ? 'Human' : playersState?.player_1.ai_profile || 'AI'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{playersState?.player_1.title || 'Challenger'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">
                      Accuracy: {review?.White?.accuracy_pct !== undefined ? `${review.White.accuracy_pct}%` : '100%'}
                    </span>
                  </div>
                </div>
              </div>

              {/* White Captured Material */}
              <div className="flex items-center gap-1 text-xs">
                {telemetry?.material?.captured_by_white?.map((piece, i) => (
                  <span key={i} className="text-muted-foreground select-none" title={piece}>
                    {piece}
                  </span>
                ))}
                {(telemetry?.material?.net_white_advantage || 0) > 0 && (
                  <span className="ml-1 text-xs font-semibold text-emerald-400">
                    +{telemetry?.material?.net_white_advantage}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl border bg-muted/20">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleNewGame} disabled={loading} className="gap-1.5 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" /> New Game
                </Button>
                <Button size="sm" variant="outline" onClick={handleUndo} disabled={loading} className="gap-1.5 text-xs">
                  <Undo2 className="h-3.5 w-3.5" /> Undo
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFlippedBoard((f) => !f)} className="gap-1.5 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Flip
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleDirectAiTurn}
                  disabled={loading || !serverOnline}
                  className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
                >
                  <Bot className="h-3.5 w-3.5" /> AI Turn
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Move Classifier, Game State & History */}
          <div className="lg:col-span-5 space-y-4">
            {/* Status & Evaluation Card */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Turn & Match State
                  </CardTitle>
                  <Badge variant={telemetry?.turn_code === 'w' ? 'outline' : 'secondary'} className="text-xs">
                    {telemetry?.active_turn ? `${telemetry.active_turn} to move` : 'Ready'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {kingInCheck && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 font-semibold animate-pulse">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>Check on square {kingInCheck.toUpperCase()}!</span>
                  </div>
                )}

                {telemetry?.game_status?.is_game_over && (
                  <div className="p-2.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 font-medium">
                    🏆 {telemetry.game_status.message || 'Game Over!'}
                  </div>
                )}

                {/* Move Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handlePlayMove(moveInput)
                  }}
                  className="flex gap-2"
                >
                  <Input
                    placeholder="Enter SAN/UCI move (e.g. e4, Nf3, e2e4)..."
                    value={moveInput}
                    onChange={(e) => setMoveInput(e.target.value)}
                    disabled={loading || !serverOnline}
                    className="h-8 text-xs font-mono"
                  />
                  <Button type="submit" size="sm" disabled={loading || !moveInput.trim() || !serverOnline} className="h-8 px-3 text-xs">
                    Play
                  </Button>
                </form>

                {/* Last Move Classification Banner */}
                {lastClassification && (
                  <div className="p-3 rounded-xl border border-border/70 bg-card/70 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        Move {lastClassification.move_number} ({lastClassification.player}):{' '}
                        <code className="text-primary font-mono">{lastClassification.move_san}</code>
                      </span>
                      <ClassificationBadge classification={lastClassification} />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{lastClassification.explanation}</p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono pt-1 border-t border-border/40">
                      <span>CPL Loss: {lastClassification.cp_loss} cp</span>
                      <span>Eval: {lastClassification.eval_pawns}</span>
                      <span>Best was: {lastClassification.best_move_was || '—'}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Move History Log */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Graded Move History</span>
                  <span className="text-xs font-normal text-muted-foreground font-mono">
                    {telemetry?.move_history_uci?.length || 0} ply
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[360px] overflow-y-auto p-4 space-y-2 text-xs divide-y divide-border/30">
                  {review?.recent_moves && review.recent_moves.length > 0 ? (
                    review.recent_moves.map((m, idx) => (
                      <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-muted-foreground font-mono">{m.move_number}.</span>
                          <span className="font-mono font-semibold">{m.move_san || m.move_uci}</span>
                          <span className="text-[10px] text-muted-foreground">({m.player})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ClassificationBadge classification={m} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      No moves recorded yet. Play a move or direct the AI!
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: AI VS AI MATCH ARENA */}
      {activeTab === 'match' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <Card className="md:col-span-4 border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Swords className="h-5 w-5 text-purple-400" /> Match Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                Pit any two saved AI profiles against each other for an autonomous match.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-foreground mb-1 block">White Player (AI Profile)</label>
                <select
                  value={playersState?.player_1.ai_profile || 'gemini-flash'}
                  onChange={(e) =>
                    void chessApi?.setPlayers({
                      player_1: { ai_profile: e.target.value, display_name: e.target.value, type: 'ai' }
                    })
                  }
                  className="w-full h-9 rounded-lg border bg-background px-3 text-xs"
                >
                  {playersState?.available_api_profiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.provider} • {p.model})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-foreground mb-1 block">Black Player (AI Profile)</label>
                <select
                  value={playersState?.player_2.ai_profile || 'local-qwen'}
                  onChange={(e) =>
                    void chessApi?.setPlayers({
                      player_2: { ai_profile: e.target.value, display_name: e.target.value, type: 'ai' }
                    })
                  }
                  className="w-full h-9 rounded-lg border bg-background px-3 text-xs"
                >
                  {playersState?.available_api_profiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.provider} • {p.model})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-foreground mb-1 block">Max Half-Moves (Ply)</label>
                <Input
                  type="number"
                  min={2}
                  max={60}
                  value={maxPly}
                  onChange={(e) => setMaxPly(parseInt(e.target.value, 10) || 6)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleRunAiMatch}
                  disabled={matchRunning || !serverOnline}
                  className="w-full gap-2 shadow-sm"
                >
                  <Play className="h-4 w-4" />
                  {matchRunning ? 'Match in Progress…' : 'Start AI vs AI Match'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-8 border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Live Match Turns</span>
                <Badge variant="outline">{matchTurns.length} turns played</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[460px] overflow-y-auto p-4 space-y-3">
                {matchTurns.length > 0 ? (
                  matchTurns.map((turn, i) => (
                    <div key={i} className="p-3 rounded-xl border bg-muted/20 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary font-mono">
                          Ply {turn.ply} • {turn.player} ({turn.profile}): {turn.move}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {turn.classification}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{turn.reasoning || 'Evaluated standard continuation.'}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground text-xs">
                    No active match results. Click &quot;Start AI vs AI Match&quot; to begin!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: GAME REVIEW (CAPS) */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* White Review Card */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-zinc-200 border border-zinc-400" /> White Accuracy Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                  <div>
                    <p className="text-3xl font-extrabold text-foreground">{review?.White?.accuracy_pct || 100}%</p>
                    <p className="text-xs text-muted-foreground">Chess.com CAPS Accuracy</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-medium text-foreground">{review?.White?.avg_cp_loss || 0} cp</p>
                    <p className="text-xs text-muted-foreground">Avg Centipawn Loss</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Classification Breakdown</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(review?.White?.counts || {}).map(([k, v]) => (
                      <div key={k} className="p-2 rounded-lg border bg-card/60 flex items-center justify-between">
                        <span>{k}</span>
                        <span className="font-mono font-bold text-primary">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Black Review Card */}
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-zinc-800 border border-zinc-600" /> Black Accuracy Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                  <div>
                    <p className="text-3xl font-extrabold text-foreground">{review?.Black?.accuracy_pct || 100}%</p>
                    <p className="text-xs text-muted-foreground">Chess.com CAPS Accuracy</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-medium text-foreground">{review?.Black?.avg_cp_loss || 0} cp</p>
                    <p className="text-xs text-muted-foreground">Avg Centipawn Loss</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Classification Breakdown</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(review?.Black?.counts || {}).map(([k, v]) => (
                      <div key={k} className="p-2 rounded-lg border bg-card/60 flex items-center justify-between">
                        <span>{k}</span>
                        <span className="font-mono font-bold text-primary">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 4: SPOILER-FREE TELEMETRY */}
      {activeTab === 'telemetry' && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-5 w-5 text-cyan-400" /> Spoiler-Free Position Telemetry (AI View)
            </CardTitle>
            <CardDescription className="text-xs">
              This exact JSON packet is streamed to external LLMs and local Ollama models. It provides full board coordinates
              and legal moves, but strictly strips checkmate spoilers to preserve organic calculation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="p-4 rounded-xl bg-zinc-950 text-emerald-400 text-xs font-mono max-h-[500px] overflow-auto border border-zinc-800">
              {JSON.stringify(telemetry || {}, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* TAB 5: 2-PLAYER & API SETTINGS */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Mode & Player Profiles */}
          <Card className="md:col-span-6 border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-5 w-5 text-primary" /> Game Mode & Players
              </CardTitle>
              <CardDescription className="text-xs">
                Switch between Human vs AI and AI vs AI, and customize player names and avatars.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={playersState?.game_mode === 'human_vs_ai' ? 'default' : 'outline'}
                  onClick={() => handleUpdateGameMode('human_vs_ai')}
                  className="flex-1"
                >
                  Human vs AI
                </Button>
                <Button
                  size="sm"
                  variant={playersState?.game_mode === 'ai_vs_ai' ? 'default' : 'outline'}
                  onClick={() => handleUpdateGameMode('ai_vs_ai')}
                  className="flex-1"
                >
                  AI vs AI Match
                </Button>
              </div>

              <div className="pt-2 border-t space-y-3">
                <p className="font-semibold text-foreground">White Player Profile</p>
                <Input
                  placeholder="White display name"
                  value={playersState?.player_1.display_name || ''}
                  onChange={(e) =>
                    void chessApi?.setPlayers({ player_1: { display_name: e.target.value } })
                  }
                  className="h-8 text-xs"
                />
              </div>

              <div className="pt-2 border-t space-y-3">
                <p className="font-semibold text-foreground">Black Player Profile</p>
                <Input
                  placeholder="Black display name"
                  value={playersState?.player_2.display_name || ''}
                  onChange={(e) =>
                    void chessApi?.setPlayers({ player_2: { display_name: e.target.value } })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Add New API Profile */}
          <Card className="md:col-span-6 border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-400" /> Add Custom AI Endpoint
              </CardTitle>
              <CardDescription className="text-xs">
                Register a new Gemini, Ollama, OpenAI, Groq, or Claude model in <code>.flame/chess_apis.json</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveApiProfile} className="space-y-3 text-xs">
                <div>
                  <label className="font-medium text-foreground mb-1 block">Profile Name</label>
                  <Input
                    placeholder="e.g. gemini-flash, deepseek-r1, llama3"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="font-medium text-foreground mb-1 block">Provider</label>
                  <select
                    value={newProfileProvider}
                    onChange={(e) => setNewProfileProvider(e.target.value as any)}
                    className="w-full h-8 rounded-lg border bg-background px-3 text-xs"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="ollama">Local Ollama</option>
                    <option value="openai">OpenAI / OpenRouter / Groq / DeepSeek</option>
                    <option value="anthropic">Anthropic Claude</option>
                  </select>
                </div>

                <div>
                  <label className="font-medium text-foreground mb-1 block">Model Identifier</label>
                  <Input
                    placeholder="e.g. gemini-2.5-flash, qwen2.5-coder:1.5b, gpt-4o-mini"
                    value={newProfileModel}
                    onChange={(e) => setNewProfileModel(e.target.value)}
                    required
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="font-medium text-foreground mb-1 block">Custom Endpoint (Optional)</label>
                  <Input
                    placeholder="Leave empty for provider default"
                    value={newProfileEndpoint}
                    onChange={(e) => setNewProfileEndpoint(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="font-medium text-foreground mb-1 block">API Key (Masked & Encrypted)</label>
                  <Input
                    type="password"
                    placeholder="API Key (optional for local Ollama)"
                    value={newProfileKey}
                    onChange={(e) => setNewProfileKey(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <Button type="submit" disabled={loading} className="w-full h-8 mt-2 text-xs gap-1.5 shadow-sm">
                  <Save className="h-3.5 w-3.5" /> Save AI Profile
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
