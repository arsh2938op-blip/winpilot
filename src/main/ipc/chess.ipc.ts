import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { ChessGameMode, ChessPlayerProfile } from '@shared/types'
import {
  startChessServer,
  stopChessServer,
  getChessStatus,
  getPosition,
  makeMove,
  getReview,
  newGame,
  undoMove,
  directAiTurn,
  runMatch,
  listApis,
  saveApi,
  getPlayers,
  setPlayers,
  getArenaState,
  arenaNewGame,
  arenaUndo,
  playHumanVsAiMove,
  saveApiProfile,
  listApiProfiles
} from '../services/chess/engine'

export function registerChessIpc(): void {
  // Arena & Director high-level API (v2.1)
  ipcMain.handle(IpcChannels.chess.getState, async () => {
    return getArenaState()
  })

  ipcMain.handle(IpcChannels.chess.newGame, async (_event, fen?: string) => {
    return arenaNewGame(fen)
  })

  ipcMain.handle(IpcChannels.chess.undo, async (_event, count?: number) => {
    return arenaUndo(count)
  })

  ipcMain.handle(IpcChannels.chess.makeMove, async (_event, move: string) => {
    return makeMove(move)
  })

  ipcMain.handle(IpcChannels.chess.playHumanVsAiMove, async (_event, move: string, aiProfile?: string) => {
    return playHumanVsAiMove(move, aiProfile)
  })

  ipcMain.handle(IpcChannels.chess.directAiTurn, async (_event, profileName?: string) => {
    return directAiTurn(profileName || 'gemini-flash')
  })

  ipcMain.handle(
    IpcChannels.chess.runAiVsAiMatch,
    async (_event, whiteProfile?: string, blackProfile?: string, maxPly?: number, resetFirst?: boolean) => {
      return runMatch(whiteProfile || 'gemini-flash', blackProfile || 'local-qwen', maxPly ?? 6, resetFirst ?? false)
    }
  )

  ipcMain.handle(IpcChannels.chess.getPlayers, async () => {
    return getPlayers()
  })

  ipcMain.handle(
    IpcChannels.chess.setPlayers,
    async (
      _event,
      payload: {
        game_mode?: ChessGameMode
        player_1?: Partial<ChessPlayerProfile>
        player_2?: Partial<ChessPlayerProfile>
      }
    ) => {
      return setPlayers(payload)
    }
  )

  ipcMain.handle(
    IpcChannels.chess.saveApiProfile,
    async (
      _event,
      profile: {
        name: string
        provider: string
        model: string
        endpoint?: string
        api_key?: string
      }
    ) => {
      return saveApiProfile(profile)
    }
  )

  ipcMain.handle(IpcChannels.chess.listApiProfiles, async () => {
    return listApiProfiles()
  })

  // Low-level compatibility channels
  ipcMain.handle(IpcChannels.chess.startServer, async (_event, port?: number) => {
    return startChessServer(port)
  })

  ipcMain.handle(IpcChannels.chess.stopServer, async () => {
    return stopChessServer()
  })

  ipcMain.handle(IpcChannels.chess.getStatus, async () => {
    return getChessStatus()
  })

  ipcMain.handle(IpcChannels.chess.getPosition, async () => {
    return getPosition()
  })

  ipcMain.handle(IpcChannels.chess.getReview, async () => {
    return getReview()
  })

  ipcMain.handle(
    IpcChannels.chess.runMatch,
    async (_event, whiteProfile: string, blackProfile: string, maxPly?: number, resetFirst?: boolean) => {
      return runMatch(whiteProfile, blackProfile, maxPly, resetFirst)
    }
  )

  ipcMain.handle(IpcChannels.chess.listApis, async () => {
    return listApis()
  })

  ipcMain.handle(
    IpcChannels.chess.saveApi,
    async (
      _event,
      profile: {
        name: string
        provider: string
        model: string
        endpoint?: string
        api_key?: string
      }
    ) => {
      return saveApi(profile)
    }
  )
}
