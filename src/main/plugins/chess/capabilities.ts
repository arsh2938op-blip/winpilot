import { registerCapability } from '../../flameCore/capabilities'
import {
  arenaNewGame,
  makeMove,
  directAiTurn,
  getPosition,
  getReview,
  runMatch
} from '../../services/chess/engine'

export function registerChessCapabilities(): void {
  registerCapability({
    id: 'chess.newGame',
    label: 'Start new chess game',
    description: 'Resets the chess board and begins a new game. Accepts an optional FEN string.',
    run: async (args) => {
      const fen = (args.fen as string | undefined)?.trim()
      try {
        const state = await arenaNewGame(fen || undefined)
        return {
          success: true,
          message: `New chess game started. Active turn: ${state.telemetry.active_turn}. FEN: ${state.telemetry.fen}`
        }
      } catch (err) {
        return { success: false, message: `Failed to start new chess game: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'chess.makeMove',
    label: 'Play chess move',
    description: 'Plays a move on the board (e.g. "e4", "e2e4", "Nf3"). Returns move classification and updated position.',
    run: async (args) => {
      const move = (args.move as string | undefined)?.trim()
      if (!move) return { success: false, message: 'Which move do you want to play?' }
      try {
        const res = await makeMove(move)
        const classification = res.move_classification
        const grade = classification ? `[${classification.classification} ${classification.symbol}]` : ''
        const status = res.game_status.is_game_over
          ? `Game Over: ${res.game_status.message || res.game_status.status}`
          : `Next to play: ${res.next_player_telemetry.active_turn}`
        return {
          success: true,
          message: `Played ${res.move_played} (${res.uci}) ${grade}. ${status}`
        }
      } catch (err) {
        return { success: false, message: `Move failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'chess.directAiTurn',
    label: 'Direct AI chess turn',
    description: 'Prompts an AI profile (e.g. "gemini-flash" or "local-qwen") to analyze the current position and play the best move.',
    run: async (args) => {
      const profile = (args.profile as string | undefined)?.trim() || 'gemini-flash'
      try {
        const res = (await directAiTurn(profile)) as { move_played_san?: string; uci?: string; error?: string }
        if (res.error) return { success: false, message: `AI error: ${res.error}` }
        return {
          success: true,
          message: `AI (${profile}) played: ${res.move_played_san || res.uci}`
        }
      } catch (err) {
        return { success: false, message: `AI turn failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'chess.getPosition',
    label: 'Get chess board state',
    description: 'Returns the current board position, active turn, piece coordinates, and legal moves.',
    run: async () => {
      try {
        const pos = await getPosition()
        return {
          success: true,
          message: `Turn: ${pos.active_turn} (move ${pos.fullmove_number}). Legal moves (${pos.legal_moves_count}): ${pos.legal_moves_san.slice(0, 10).join(', ')}${pos.legal_moves_count > 10 ? '...' : ''}. FEN: ${pos.fen}`
        }
      } catch (err) {
        return { success: false, message: `Could not get position: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'chess.getReview',
    label: 'Get chess game review',
    description: 'Returns accuracy scores, average centipawn loss, and move ratings for White and Black.',
    run: async () => {
      try {
        const rev = await getReview()
        return {
          success: true,
          message: `White: ${rev.White.accuracy_pct}% accuracy (${rev.White.avg_cp_loss} avg CPL). Black: ${rev.Black.accuracy_pct}% accuracy (${rev.Black.avg_cp_loss} avg CPL). Graded moves: ${rev.total_moves_graded}.`
        }
      } catch (err) {
        return { success: false, message: `Could not get review: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'chess.runMatch',
    label: 'Run AI vs AI chess match',
    description: 'Runs an automated match between two AI profiles (e.g. "gemini-flash" vs "local-qwen").',
    run: async (args) => {
      const white = (args.whiteProfile as string | undefined)?.trim() || 'gemini-flash'
      const black = (args.blackProfile as string | undefined)?.trim() || 'local-qwen'
      const ply = typeof args.maxPly === 'number' ? args.maxPly : 6
      try {
        const res = await runMatch(white, black, ply, false)
        return {
          success: true,
          message: `Match finished: ${res.ply_executed} half-moves executed between ${white} (White) and ${black} (Black). Final FEN: ${res.final_fen}`
        }
      } catch (err) {
        return { success: false, message: `Match error: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}
