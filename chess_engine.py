#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
chess_mcp_engine.py - Flame AGI Chess Director, Multi-API Arena & MCP Server (v2.0.0)
=====================================================================================
An arbiter, director, and analytical chess engine built for AI-vs-AI and Human-vs-AI play.
Here, the Engine does NOT play the game for the AI—it DIRECTS the AI models by feeding
them complete, spoiler-free board geometry and legal moves, then grades every move
using a Chess.com-style Move Classifier.

Key Capabilities (v2.0.0):
1. Multi-API Endpoint Registry (`.flame/chess_apis.json`):
   - Save & route to multiple AI providers: Gemini, OpenAI/OpenRouter/Groq/DeepSeek,
     Anthropic Claude, local Ollama models, or any custom HTTP AI endpoint.
2. Spoiler-Free AI Position Telemetry:
   - Sends complete board state: exact piece coordinates per square, piece lists for
     White and Black, castling rights, move history, and every legal move.
   - STRICT ZERO-SPOILER RULE: Never tells the AI that checkmate or check is coming
     on a square (strips '+' and '#' from candidate moves and hides engine evals).
3. Chess.com-Style Advanced Move Classifier:
   - Grades every played move post-execution into 10 tiers:
     Brilliant (!!), Great (!), Best (★), Book (📖), Excellent (👍),
     Good (✓), Inaccuracy (?!), Mistake (?), Miss (❌), and Blunder (??).
   - Tracks per-player CAPS / Accuracy % and centipawn loss (CPL).
4. AI-vs-AI Arena & Match Director:
   - Orchestrates live AI-vs-AI turns or multi-move matches between any two saved
     AI profiles, with automatic JSON/text move extraction and illegal-move retries.
5. Triple Interface:
   - MCP Server (`--mcp`), HTTP REST API (`--serve`), and Terminal CLI (`--cli`).
   - 100% Python Standard Library (0 external dependencies, <15MB RAM footprint).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time

if sys.platform == 'win32':
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

ENGINE_VERSION = "2.0.0"

def _auto_load_env() -> None:
    for env_path in [Path.cwd() / ".env", Path.cwd() / ".flame" / ".env", Path.cwd() / "winpilot" / ".env"]:
        if env_path.exists():
            try:
                for line in env_path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass
    try:
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            sec_path = Path(appdata) / "FlameAGI" / "secrets.json"
            if sec_path.exists():
                data = json.loads(sec_path.read_text(encoding="utf-8"))
                for k in ("googleApiKey", "geminiApiKey", "GEMINI_API_KEY"):
                    if k in data and data[k] and "GEMINI_API_KEY" not in os.environ:
                        os.environ["GEMINI_API_KEY"] = data[k]
    except Exception:
        pass

_auto_load_env()

START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# ---------------------------------------------------------------------------
# Constants, Piece Values & Opening Book
# ---------------------------------------------------------------------------

PIECE_NAMES = {
    'P': 'White Pawn', 'N': 'White Knight', 'B': 'White Bishop',
    'R': 'White Rook', 'Q': 'White Queen', 'K': 'White King',
    'p': 'Black Pawn', 'n': 'Black Knight', 'b': 'Black Bishop',
    'r': 'Black Rook', 'q': 'Black Queen', 'k': 'Black King',
}

PIECE_TYPE_NAMES = {
    'P': 'Pawn', 'N': 'Knight', 'B': 'Bishop',
    'R': 'Rook', 'Q': 'Queen', 'K': 'King',
}

UNICODE_PIECES = {
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
    '.': '·'
}

ASCII_PIECES = {
    'P': 'P', 'N': 'N', 'B': 'B', 'R': 'R', 'Q': 'Q', 'K': 'K',
    'p': 'p', 'n': 'n', 'b': 'b', 'r': 'r', 'q': 'q', 'k': 'k',
    '.': '.'
}

PIECE_VALUES = {
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000,
    'p': -100, 'n': -320, 'b': -330, 'r': -500, 'q': -900, 'k': -20000
}

ABS_PIECE_VALUES = {
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000,
}

# Standard Opening Book prefixes (UCI move sequences) for "Book (📖)" classification
OPENING_BOOK_LINES: Set[str] = {
    "e2e4", "d2d4", "c2c4", "g1f3",
    "e2e4 e7e5", "e2e4 c7c5", "e2e4 e7e6", "e2e4 c7c6", "e2e4 d7d5", "e2e4 d7d6",
    "e2e4 e7e5 g1f3", "e2e4 e7e5 g1f3 b8c6", "e2e4 e7e5 g1f3 g8f6",
    "e2e4 e7e5 g1f3 b8c6 f1b5", "e2e4 e7e5 g1f3 b8c6 f1c4", "e2e4 e7e5 g1f3 b8c6 d2d4",
    "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6", "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5", "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6",
    "e2e4 c7c5 g1f3", "e2e4 c7c5 g1f3 d7d6", "e2e4 c7c5 g1f3 b8c6", "e2e4 c7c5 g1f3 e7e6",
    "e2e4 c7c5 g1f3 d7d6 d2d4", "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4",
    "d2d4 d7d5", "d2d4 g8f6", "d2d4 d7d5 c2c4", "d2d4 d7d5 c2c4 e7e6", "d2d4 d7d5 c2c4 c7c6",
    "d2d4 g8f6 c2c4", "d2d4 g8f6 c2c4 g7g6", "d2d4 g8f6 c2c4 e7e6",
    "c2c4 e7e5", "c2c4 c7c5", "c2c4 g8f6",
}

# Piece-Square Tables (oriented for White; inverted for Black)
PST_PAWN = [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
]

PST_KNIGHT = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
]

PST_BISHOP = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
]

PST_ROOK = [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0
]

PST_QUEEN = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
]

PST_KING_MIDGAME = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
]


# ---------------------------------------------------------------------------
# Move Data Structure
# ---------------------------------------------------------------------------

class Move:
    __slots__ = ("src", "dst", "promotion", "is_castling", "is_en_passant", "captured", "san", "san_neutral")

    def __init__(
        self,
        src: int,
        dst: int,
        promotion: Optional[str] = None,
        is_castling: bool = False,
        is_en_passant: bool = False,
        captured: Optional[str] = None,
        san: str = "",
        san_neutral: str = ""
    ):
        self.src = src
        self.dst = dst
        self.promotion = promotion.lower() if promotion else None
        self.is_castling = is_castling
        self.is_en_passant = is_en_passant
        self.captured = captured
        self.san = san
        self.san_neutral = san_neutral

    @property
    def uci(self) -> str:
        s = sq_to_name(self.src) + sq_to_name(self.dst)
        if self.promotion:
            s += self.promotion.lower()
        return s

    def __repr__(self) -> str:
        return f"Move({self.uci}, san='{self.san_neutral or self.san}')"

    def __eq__(self, other: Any) -> bool:
        if not isinstance(other, Move):
            return False
        return self.src == other.src and self.dst == other.dst and self.promotion == other.promotion


def sq_to_name(sq: int) -> str:
    file = sq % 8
    rank = sq // 8
    return f"{chr(ord('a') + file)}{rank + 1}"


def name_to_sq(name: str) -> int:
    name = name.strip().lower()
    if len(name) != 2:
        raise ValueError(f"Invalid square coordinate: {name}")
    file = ord(name[0]) - ord('a')
    rank = int(name[1]) - 1
    if not (0 <= file <= 7 and 0 <= rank <= 7):
        raise ValueError(f"Square coordinates out of range: {name}")
    return rank * 8 + file


# ---------------------------------------------------------------------------
# Board Representation & Spoiler-Free Position Telemetry
# ---------------------------------------------------------------------------

class ChessBoard:
    def __init__(self, fen: str = START_FEN):
        self.board: List[Optional[str]] = [None] * 64
        self.turn: str = 'w'
        self.castling: Set[str] = set()
        self.ep_square: Optional[int] = None
        self.halfmove_clock: int = 0
        self.fullmove_number: int = 1
        self.history: List[Tuple[List[Optional[str]], str, Set[str], Optional[int], int, int, Move]] = []
        self.move_evaluations: List[Dict[str, Any]] = []
        self.load_fen(fen)

    def load_fen(self, fen: str) -> None:
        parts = fen.strip().split()
        if len(parts) < 4:
            raise ValueError(f"Invalid FEN string: {fen}")

        rows = parts[0].split('/')
        if len(rows) != 8:
            raise ValueError("FEN must contain 8 ranks")

        self.board = [None] * 64
        for r_idx, row in enumerate(rows):
            rank = 7 - r_idx
            file = 0
            for char in row:
                if char.isdigit():
                    file += int(char)
                else:
                    self.board[rank * 8 + file] = char
                    file += 1

        self.turn = parts[1].lower()
        if self.turn not in ('w', 'b'):
            raise ValueError(f"Invalid turn in FEN: {self.turn}")

        self.castling = set()
        if parts[2] != '-':
            for c in parts[2]:
                if c in "KQkq":
                    self.castling.add(c)

        if parts[3] != '-':
            self.ep_square = name_to_sq(parts[3])
        else:
            self.ep_square = None

        self.halfmove_clock = int(parts[4]) if len(parts) > 4 else 0
        self.fullmove_number = int(parts[5]) if len(parts) > 5 else 1
        self.history.clear()
        self.move_evaluations.clear()

    def to_fen(self) -> str:
        rows = []
        for rank in range(7, -1, -1):
            empty = 0
            row_str = ""
            for file in range(8):
                sq = rank * 8 + file
                piece = self.board[sq]
                if piece is None:
                    empty += 1
                else:
                    if empty > 0:
                        row_str += str(empty)
                        empty = 0
                    row_str += piece
            if empty > 0:
                row_str += str(empty)
            rows.append(row_str)

        fen_board = "/".join(rows)
        fen_turn = self.turn
        fen_castling = "".join([c for c in "KQkq" if c in self.castling]) or '-'
        fen_ep = sq_to_name(self.ep_square) if self.ep_square is not None else '-'
        return f"{fen_board} {fen_turn} {fen_castling} {fen_ep} {self.halfmove_clock} {self.fullmove_number}"

    def is_own_piece(self, piece: Optional[str]) -> bool:
        if piece is None:
            return False
        return piece.isupper() if self.turn == 'w' else piece.islower()

    def is_enemy_piece(self, piece: Optional[str]) -> bool:
        if piece is None:
            return False
        return piece.islower() if self.turn == 'w' else piece.isupper()

    def is_square_attacked(self, sq: int, by_color: str) -> bool:
        target_rank = sq // 8
        target_file = sq % 8

        # 1. Pawns
        pawn_char = 'P' if by_color == 'w' else 'p'
        pawn_dir = -1 if by_color == 'w' else 1
        from_rank = target_rank + pawn_dir
        if 0 <= from_rank <= 7:
            for d_file in (-1, 1):
                from_file = target_file + d_file
                if 0 <= from_file <= 7:
                    if self.board[from_rank * 8 + from_file] == pawn_char:
                        return True

        # 2. Knights
        knight_char = 'N' if by_color == 'w' else 'n'
        for df, dr in [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]:
            f, r = target_file + df, target_rank + dr
            if 0 <= f <= 7 and 0 <= r <= 7:
                if self.board[r * 8 + f] == knight_char:
                    return True

        # 3. King
        king_char = 'K' if by_color == 'w' else 'k'
        for df in (-1, 0, 1):
            for dr in (-1, 0, 1):
                if df == 0 and dr == 0:
                    continue
                f, r = target_file + df, target_rank + dr
                if 0 <= f <= 7 and 0 <= r <= 7:
                    if self.board[r * 8 + f] == king_char:
                        return True

        # 4. Straight rays (Rook / Queen)
        straight_enemies = ('R', 'Q') if by_color == 'w' else ('r', 'q')
        for df, dr in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            f, r = target_file + df, target_rank + dr
            while 0 <= f <= 7 and 0 <= r <= 7:
                p = self.board[r * 8 + f]
                if p is not None:
                    if p in straight_enemies:
                        return True
                    break
                f += df
                r += dr

        # 5. Diagonal rays (Bishop / Queen)
        diagonal_enemies = ('B', 'Q') if by_color == 'w' else ('b', 'q')
        for df, dr in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
            f, r = target_file + df, target_rank + dr
            while 0 <= f <= 7 and 0 <= r <= 7:
                p = self.board[r * 8 + f]
                if p is not None:
                    if p in diagonal_enemies:
                        return True
                    break
                f += df
                r += dr

        return False

    def find_king(self, color: str) -> int:
        king_char = 'K' if color == 'w' else 'k'
        for sq in range(64):
            if self.board[sq] == king_char:
                return sq
        raise ValueError(f"King for color '{color}' missing from board!")

    def is_in_check(self, color: Optional[str] = None) -> bool:
        check_color = color or self.turn
        king_sq = self.find_king(check_color)
        enemy_color = 'b' if check_color == 'w' else 'w'
        return self.is_square_attacked(king_sq, enemy_color)

    def generate_pseudo_legal_moves(self) -> List[Move]:
        moves: List[Move] = []
        is_white = self.turn == 'w'

        for sq in range(64):
            piece = self.board[sq]
            if piece is None or not self.is_own_piece(piece):
                continue

            rank, file = sq // 8, sq % 8
            ptype = piece.upper()

            if ptype == 'P':
                fwd = 8 if is_white else -8
                start_rank = 1 if is_white else 6
                promo_rank = 7 if is_white else 0

                dest1 = sq + fwd
                if 0 <= dest1 < 64 and self.board[dest1] is None:
                    if (dest1 // 8) == promo_rank:
                        for promo in ('q', 'r', 'b', 'n'):
                            moves.append(Move(sq, dest1, promotion=promo))
                    else:
                        moves.append(Move(sq, dest1))
                        if rank == start_rank:
                            dest2 = sq + (2 * fwd)
                            if self.board[dest2] is None:
                                moves.append(Move(sq, dest2))

                for d_file in (-1, 1):
                    target_file = file + d_file
                    if 0 <= target_file <= 7:
                        dest = (rank + (1 if is_white else -1)) * 8 + target_file
                        target_piece = self.board[dest]
                        if target_piece and self.is_enemy_piece(target_piece):
                            if (dest // 8) == promo_rank:
                                for promo in ('q', 'r', 'b', 'n'):
                                    moves.append(Move(sq, dest, promotion=promo, captured=target_piece))
                            else:
                                moves.append(Move(sq, dest, captured=target_piece))
                        elif self.ep_square is not None and dest == self.ep_square:
                            ep_captured = 'p' if is_white else 'P'
                            moves.append(Move(sq, dest, is_en_passant=True, captured=ep_captured))

            elif ptype == 'N':
                for df, dr in [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]:
                    f, r = file + df, rank + dr
                    if 0 <= f <= 7 and 0 <= r <= 7:
                        dest = r * 8 + f
                        target_piece = self.board[dest]
                        if target_piece is None or self.is_enemy_piece(target_piece):
                            moves.append(Move(sq, dest, captured=target_piece))

            if ptype in ('B', 'Q'):
                for df, dr in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
                    f, r = file + df, rank + dr
                    while 0 <= f <= 7 and 0 <= r <= 7:
                        dest = r * 8 + f
                        target_piece = self.board[dest]
                        if target_piece is None:
                            moves.append(Move(sq, dest))
                        else:
                            if self.is_enemy_piece(target_piece):
                                moves.append(Move(sq, dest, captured=target_piece))
                            break
                        f += df
                        r += dr

            if ptype in ('R', 'Q'):
                for df, dr in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                    f, r = file + df, rank + dr
                    while 0 <= f <= 7 and 0 <= r <= 7:
                        dest = r * 8 + f
                        target_piece = self.board[dest]
                        if target_piece is None:
                            moves.append(Move(sq, dest))
                        else:
                            if self.is_enemy_piece(target_piece):
                                moves.append(Move(sq, dest, captured=target_piece))
                            break
                        f += df
                        r += dr

            if ptype == 'K':
                for df in (-1, 0, 1):
                    for dr in (-1, 0, 1):
                        if df == 0 and dr == 0:
                            continue
                        f, r = file + df, rank + dr
                        if 0 <= f <= 7 and 0 <= r <= 7:
                            dest = r * 8 + f
                            target_piece = self.board[dest]
                            if target_piece is None or self.is_enemy_piece(target_piece):
                                moves.append(Move(sq, dest, captured=target_piece))

                enemy_col = 'b' if is_white else 'w'
                if is_white and sq == 4 and not self.is_in_check('w'):
                    if 'K' in self.castling and self.board[5] is None and self.board[6] is None:
                        if not self.is_square_attacked(5, enemy_col) and not self.is_square_attacked(6, enemy_col):
                            moves.append(Move(4, 6, is_castling=True))
                    if 'Q' in self.castling and self.board[1] is None and self.board[2] is None and self.board[3] is None:
                        if not self.is_square_attacked(3, enemy_col) and not self.is_square_attacked(2, enemy_col):
                            moves.append(Move(4, 2, is_castling=True))
                elif not is_white and sq == 60 and not self.is_in_check('b'):
                    if 'k' in self.castling and self.board[61] is None and self.board[62] is None:
                        if not self.is_square_attacked(61, enemy_col) and not self.is_square_attacked(62, enemy_col):
                            moves.append(Move(60, 62, is_castling=True))
                    if 'q' in self.castling and self.board[57] is None and self.board[58] is None and self.board[59] is None:
                        if not self.is_square_attacked(59, enemy_col) and not self.is_square_attacked(58, enemy_col):
                            moves.append(Move(60, 58, is_castling=True))

        return moves

    def make_move(self, move: Move) -> None:
        self.history.append((
            list(self.board),
            self.turn,
            set(self.castling),
            self.ep_square,
            self.halfmove_clock,
            self.fullmove_number,
            move
        ))

        src_piece = self.board[move.src]
        assert src_piece is not None
        dst_piece = self.board[move.dst]
        is_pawn = src_piece.upper() == 'P'
        is_capture = dst_piece is not None or move.is_en_passant

        if is_pawn or is_capture:
            self.halfmove_clock = 0
        else:
            self.halfmove_clock += 1

        self.board[move.dst] = src_piece
        self.board[move.src] = None

        if move.is_en_passant:
            captured_pawn_sq = move.dst - 8 if self.turn == 'w' else move.dst + 8
            self.board[captured_pawn_sq] = None

        if move.promotion:
            self.board[move.dst] = move.promotion.upper() if self.turn == 'w' else move.promotion.lower()

        if move.is_castling:
            if move.dst == 6:
                self.board[7], self.board[5] = None, 'R'
            elif move.dst == 2:
                self.board[0], self.board[3] = None, 'R'
            elif move.dst == 62:
                self.board[63], self.board[61] = None, 'r'
            elif move.dst == 58:
                self.board[56], self.board[59] = None, 'r'

        if is_pawn and abs(move.dst - move.src) == 16:
            self.ep_square = (move.src + move.dst) // 2
        else:
            self.ep_square = None

        if src_piece == 'K':
            self.castling.discard('K')
            self.castling.discard('Q')
        elif src_piece == 'k':
            self.castling.discard('k')
            self.castling.discard('q')
        elif src_piece == 'R':
            if move.src == 0: self.castling.discard('Q')
            elif move.src == 7: self.castling.discard('K')
        elif src_piece == 'r':
            if move.src == 56: self.castling.discard('q')
            elif move.src == 63: self.castling.discard('k')

        if move.dst == 0: self.castling.discard('Q')
        elif move.dst == 7: self.castling.discard('K')
        elif move.dst == 56: self.castling.discard('q')
        elif move.dst == 63: self.castling.discard('k')

        if self.turn == 'b':
            self.fullmove_number += 1

        self.turn = 'b' if self.turn == 'w' else 'w'

    def undo_move(self) -> Optional[Move]:
        if not self.history:
            return None
        old_board, old_turn, old_castling, old_ep, old_half, old_full, move = self.history.pop()
        self.board = old_board
        self.turn = old_turn
        self.castling = old_castling
        self.ep_square = old_ep
        self.halfmove_clock = old_half
        self.fullmove_number = old_full
        return move

    def legal_moves(self) -> List[Move]:
        legal: List[Move] = []
        pseudo = self.generate_pseudo_legal_moves()
        active_turn = self.turn

        for move in pseudo:
            self.make_move(move)
            if not self.is_in_check(active_turn):
                legal.append(move)
            self.undo_move()

        for m in legal:
            m.san_neutral = self.to_san_neutral(m, legal)
            m.san = m.san_neutral  # Default SAN is spoiler-free!
        return legal

    def to_san_neutral(self, move: Move, candidates: Optional[List[Move]] = None) -> str:
        """
        Generates Standard Algebraic Notation WITHOUT '+' (check) or '#' (checkmate)
        spoilers so the AI model is never told checkmate or check is coming on a square!
        """
        if move.is_castling:
            return "O-O" if (move.dst % 8) > (move.src % 8) else "O-O-O"

        piece = self.board[move.src]
        assert piece is not None
        ptype = piece.upper()
        dst_name = sq_to_name(move.dst)

        if ptype == 'P':
            if (move.dst % 8) != (move.src % 8):
                san = f"{sq_to_name(move.src)[0]}x{dst_name}"
            else:
                san = dst_name
            if move.promotion:
                san += f"={move.promotion.upper()}"
        else:
            san = ptype
            if candidates:
                others = [
                    m for m in candidates
                    if m.dst == move.dst and m.src != move.src and self.board[m.src] == piece
                ]
                if others:
                    src_file = sq_to_name(move.src)[0]
                    src_rank = sq_to_name(move.src)[1]
                    file_unique = all(sq_to_name(m.src)[0] != src_file for m in others)
                    rank_unique = all(sq_to_name(m.src)[1] != src_rank for m in others)
                    if file_unique:
                        san += src_file
                    elif rank_unique:
                        san += src_rank
                    else:
                        san += f"{src_file}{src_rank}"

            if self.board[move.dst] is not None:
                san += "x"
            san += dst_name

        return san

    def parse_move(self, move_str: str) -> Move:
        """Parses a move in UCI ('e2e4', 'e7e8q') or SAN format ('Nf3', 'exd5', 'O-O')."""
        clean_raw = move_str.strip().replace("0-0-0", "O-O-O").replace("0-0", "O-O").replace("o-o-o", "O-O-O").replace("o-o", "O-O")
        clean = clean_raw.replace("x", "").replace("+", "").replace("#", "").replace("!", "").replace("?", "")
        clean_full = clean_raw.replace("+", "").replace("#", "").replace("!", "").replace("?", "")
        legal = self.legal_moves()

        for m in legal:
            if m.uci.lower() == clean.lower() or m.uci.lower() == clean_full.lower():
                return m
        for m in legal:
            if m.san_neutral == clean_full or m.san_neutral.replace("x", "") == clean:
                return m
        for m in legal:
            if m.san_neutral.lower() == clean_full.lower():
                return m
        for m in legal:
            if m.uci.lower().startswith(clean.lower()) and len(clean) >= 4:
                return m

        raise ValueError(
            f"Illegal or unrecognized move '{move_str}'. "
            f"Legal moves: {[m.san_neutral for m in legal]}"
        )

    # -----------------------------------------------------------------------
    # Rich Spoiler-Free Position Telemetry for AI Models
    # -----------------------------------------------------------------------
    def get_ai_position_telemetry(self) -> Dict[str, Any]:
        """
        Builds the complete position data packet for an AI model:
        - Exact piece positions for White and Black
        - Square-by-square occupancy map
        - FEN and visual grid
        - Complete list of legal moves (strictly stripped of '+' and '#' check/mate spoilers)
        - Never hints that checkmate is coming!
        """
        white_pieces: List[Dict[str, str]] = []
        black_pieces: List[Dict[str, str]] = []
        square_map: Dict[str, str] = {}

        for sq in range(64):
            p = self.board[sq]
            sq_name = sq_to_name(sq)
            if p is not None:
                p_name = PIECE_NAMES[p]
                square_map[sq_name] = f"{p} ({p_name})"
                piece_pt_map = {'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0}
                entry = {
                    "square": sq_name,
                    "symbol": p,
                    "piece": PIECE_TYPE_NAMES[p.upper()],
                    "unicode": UNICODE_PIECES.get(p, p),
                    "points": piece_pt_map.get(p.upper(), 0),
                }
                if p.isupper():
                    white_pieces.append(entry)
                else:
                    black_pieces.append(entry)

        legal = self.legal_moves()
        legal_moves_detailed = []
        for m in legal:
            moving_piece = self.board[m.src] or ""
            legal_moves_detailed.append({
                "uci": m.uci,
                "san": m.san_neutral,  # Guaranteed no '+' or '#' spoiler
                "from": sq_to_name(m.src),
                "to": sq_to_name(m.dst),
                "piece": PIECE_TYPE_NAMES.get(moving_piece.upper(), "Unknown"),
                "is_capture": bool(m.captured is not None or m.is_en_passant),
                "is_castling": m.is_castling,
                "promotion": m.promotion,
            })

        move_history_list = [h[6].uci for h in self.history]

        # Material calculation
        starting_white = {'P': 8, 'N': 2, 'B': 2, 'R': 2, 'Q': 1}
        starting_black = {'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1}
        curr_white_counts = {}
        curr_black_counts = {}
        for wp in white_pieces:
            s = wp["symbol"]
            curr_white_counts[s] = curr_white_counts.get(s, 0) + 1
        for bp in black_pieces:
            s = bp["symbol"]
            curr_black_counts[s] = curr_black_counts.get(s, 0) + 1

        captured_by_white = []
        for piece_char, orig_count in starting_black.items():
            missing = orig_count - curr_black_counts.get(piece_char, 0)
            if missing > 0:
                captured_by_white.extend([piece_char] * missing)

        captured_by_black = []
        for piece_char, orig_count in starting_white.items():
            missing = orig_count - curr_white_counts.get(piece_char, 0)
            if missing > 0:
                captured_by_black.extend([piece_char] * missing)

        piece_pt_map = {'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0}
        white_points = sum(piece_pt_map.get(wp["symbol"].upper(), 0) for wp in white_pieces)
        black_points = sum(piece_pt_map.get(bp["symbol"].upper(), 0) for bp in black_pieces)

        material_info = {
            "captured_by_white": captured_by_white,
            "captured_by_black": captured_by_black,
            "white_points": white_points,
            "black_points": black_points,
            "net_white_advantage": white_points - black_points,
        }

        last_move_info = None
        if self.history:
            last_m = self.history[-1][6]
            last_move_info = {
                "uci": last_m.uci,
                "san": last_m.san_neutral,
                "from": sq_to_name(last_m.src),
                "to": sq_to_name(last_m.dst),
            }

        king_in_check = sq_to_name(self.find_king(self.turn)) if self.is_in_check() else None

        return {
            "active_turn": "White" if self.turn == 'w' else "Black",
            "turn_code": self.turn,
            "fullmove_number": self.fullmove_number,
            "fen": self.to_fen(),
            "castling_rights": "".join([c for c in "KQkq" if c in self.castling]) or "None",
            "en_passant_target": sq_to_name(self.ep_square) if self.ep_square is not None else "None",
            "white_pieces": white_pieces,
            "black_pieces": black_pieces,
            "occupied_squares": square_map,
            "material": material_info,
            "last_move": last_move_info,
            "legal_moves_count": len(legal),
            "legal_moves_uci": [m.uci for m in legal],
            "legal_moves_san": [m.san_neutral for m in legal],
            "legal_moves_detailed": legal_moves_detailed,
            "move_history_uci": move_history_list,
            "board_visual": self.render_ascii(use_unicode=False),
            "game_status": self.game_status(),
            "ui_king_in_check_square": king_in_check,
        }

    def game_status(self) -> Dict[str, Any]:
        legal = self.legal_moves()
        in_check = self.is_in_check()

        if not legal:
            if in_check:
                winner = "Black" if self.turn == 'w' else "White"
                return {"status": "checkmate", "is_game_over": True, "winner": winner, "message": f"Checkmate! {winner} wins."}
            else:
                return {"status": "stalemate", "is_game_over": True, "winner": None, "message": "Draw by stalemate."}

        if self.halfmove_clock >= 100:
            return {"status": "draw_50_moves", "is_game_over": True, "winner": None, "message": "Draw by 50-move rule."}

        return {
            "status": "active",
            "is_game_over": False,
            "turn": "White" if self.turn == 'w' else "Black",
            "fullmove": self.fullmove_number,
            "legal_move_count": len(legal)
        }

    def render_ascii(self, use_unicode: bool = True) -> str:
        pieces = UNICODE_PIECES if use_unicode else ASCII_PIECES
        lines = []
        lines.append("    +---+---+---+---+---+---+---+---+")
        for rank in range(7, -1, -1):
            row_items = []
            for file in range(8):
                sq = rank * 8 + file
                p = self.board[sq]
                char = pieces.get(p, '.') if p else pieces['.']
                row_items.append(f" {char} ")
            row_str = " | ".join(row_items)
            lines.append(f"  {rank + 1} |{row_str}|")
            lines.append("    +---+---+---+---+---+---+---+---+")
        lines.append("      a   b   c   d   e   f   g   h  ")
        lines.append(f"Turn: {'White (w)' if self.turn == 'w' else 'Black (b)'} | Castling: {''.join(self.castling) or '-'} | Move: {self.fullmove_number}")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Analytical Engine & Chess.com-Style Move Classifier
# ---------------------------------------------------------------------------

class ChessAnalyzer:
    """
    Internal evaluator used ONLY to grade moves AFTER they are played
    (Blunder, Mistake, Inaccuracy, Good, Excellent, Best, Great, Brilliant, Book, Miss).
    Never gives hints to the AI player before its move.
    """

    def __init__(self, depth: int = 3):
        self.depth = depth

    @staticmethod
    def evaluate_board(board: ChessBoard) -> int:
        """Returns static evaluation in centipawns from White's perspective (+White, -Black)."""
        score = 0
        for sq in range(64):
            piece = board.board[sq]
            if not piece:
                continue
            val = PIECE_VALUES[piece]
            score += val

            pst_idx = sq if piece.isupper() else (63 - sq)
            ptype = piece.upper()
            pst_bonus = 0
            if ptype == 'P': pst_bonus = PST_PAWN[pst_idx]
            elif ptype == 'N': pst_bonus = PST_KNIGHT[pst_idx]
            elif ptype == 'B': pst_bonus = PST_BISHOP[pst_idx]
            elif ptype == 'R': pst_bonus = PST_ROOK[pst_idx]
            elif ptype == 'Q': pst_bonus = PST_QUEEN[pst_idx]
            if ptype == 'K': pst_bonus = PST_KING_MIDGAME[pst_idx]

            score += pst_bonus if piece.isupper() else -pst_bonus

        return score

    @staticmethod
    def material_balance(board: ChessBoard, color: str) -> int:
        """Returns total non-king material in centipawns for the given color ('w' or 'b')."""
        total = 0
        for sq in range(64):
            p = board.board[sq]
            if p and p.upper() != 'K':
                if (color == 'w' and p.isupper()) or (color == 'b' and p.islower()):
                    total += ABS_PIECE_VALUES[p.upper()]
        return total

    @staticmethod
    def cp_to_win_prob(cp: int) -> float:
        """Converts centipawns into Chess.com / Lichess win probability [0.0 .. 1.0]."""
        clamped = max(-4000, min(4000, cp))
        return 1.0 / (1.0 + math.exp(-0.00368208 * clamped))

    def search_root_moves(self, board: ChessBoard, depth: int = 2) -> List[Tuple[Move, int]]:
        """Evaluates all legal root moves and returns them sorted best-first for the active player."""
        legal = board.legal_moves()
        if not legal:
            return []

        is_white = board.turn == 'w'
        scored_moves: List[Tuple[Move, int]] = []

        for move in legal:
            board.make_move(move)
            score, _ = self.alpha_beta(board, max(0, depth - 1), -999999, 999999, not is_white)
            board.undo_move()
            scored_moves.append((move, score))

        scored_moves.sort(key=lambda item: item[1], reverse=is_white)
        return scored_moves

    def alpha_beta(
        self,
        board: ChessBoard,
        depth: int,
        alpha: int,
        beta: int,
        is_maximizing: bool
    ) -> Tuple[int, Optional[Move]]:
        legal = board.legal_moves()
        if not legal:
            if board.is_in_check():
                return (-30000 + (self.depth - depth) if is_maximizing else 30000 - (self.depth - depth)), None
            return 0, None

        if depth == 0:
            return self.evaluate_board(board), None

        legal.sort(key=lambda m: (1 if m.captured else 0), reverse=True)
        best_move: Optional[Move] = None

        if is_maximizing:
            max_eval = -999999
            for move in legal:
                board.make_move(move)
                eval_score, _ = self.alpha_beta(board, depth - 1, alpha, beta, False)
                board.undo_move()
                if eval_score > max_eval:
                    max_eval = eval_score
                    best_move = move
                alpha = max(alpha, eval_score)
                if beta <= alpha:
                    break
            return max_eval, best_move
        else:
            min_eval = 999999
            for move in legal:
                board.make_move(move)
                eval_score, _ = self.alpha_beta(board, depth - 1, alpha, beta, True)
                board.undo_move()
                if eval_score < min_eval:
                    min_eval = eval_score
                    best_move = move
                beta = min(beta, eval_score)
                if beta <= alpha:
                    break
            return min_eval, best_move

    def classify_and_make_move(self, board: ChessBoard, move: Move, depth: int = 2) -> Dict[str, Any]:
        """
        Analyzes the board BEFORE `move` is played, executes `move`, and classifies it
        using Chess.com's 10 classification categories:
        - Brilliant (!!)
        - Great (!)
        - Best (★)
        - Book (📖)
        - Excellent (👍)
        - Good (✓)
        - Inaccuracy (?!)
        - Mistake (?)
        - Miss (❌)
        - Blunder (??)
        """
        player_color = board.turn
        is_white = player_color == 'w'
        sign = 1 if is_white else -1

        # 1. Check Opening Book first
        past_ucis = [h[6].uci for h in board.history] + [move.uci]
        line_key = " ".join(past_ucis)
        is_book = len(past_ucis) <= 8 and line_key in OPENING_BOOK_LINES

        # 2. Rank all candidate moves before playing
        ranked = self.search_root_moves(board, depth=depth)
        best_move, best_score_white = ranked[0] if ranked else (move, 0)
        second_best_score_white = ranked[1][1] if len(ranked) > 1 else best_score_white

        # Find score of the move actually played
        played_score_white = best_score_white
        for cand_m, cand_s in ranked:
            if cand_m == move:
                played_score_white = cand_s
                break

        # Perspective-adjusted scores (higher is better for the moving player)
        best_persp = best_score_white * sign
        second_persp = second_best_score_white * sign
        played_persp = played_score_white * sign

        cp_loss = max(0, best_persp - played_persp)
        best_win_prob = self.cp_to_win_prob(best_persp)
        played_win_prob = self.cp_to_win_prob(played_persp)
        win_prob_loss = max(0.0, best_win_prob - played_win_prob)

        # Check if the move sacrifices or exposes a valuable piece on an attacked square
        moving_piece = board.board[move.src] or 'P'
        moving_val = ABS_PIECE_VALUES.get(moving_piece.upper(), 100)
        captured_val = ABS_PIECE_VALUES.get(move.captured.upper(), 0) if move.captured else 0

        # Execute the move on the board
        board.make_move(move)

        enemy_color = board.turn
        landed_on_attacked = board.is_square_attacked(move.dst, enemy_color)
        is_sacrifice = landed_on_attacked and (moving_val > captured_val + 100) and moving_piece.upper() != 'P'

        # Determine Classification Tier (Chess.com logic)
        if is_book:
            label, symbol, badge_color = "Book", "📖", "#a88865"
            explanation = "Standard opening theory move."
        elif cp_loss <= 15 and is_sacrifice and played_persp >= -50:
            label, symbol, badge_color = "Brilliant", "!!", "#1baca6"
            explanation = f"Brilliant piece sacrifice on {sq_to_name(move.dst)} that maintains a strong tactical evaluation!"
        elif cp_loss == 0 and len(ranked) > 1 and (best_persp - second_persp) >= 150 and best_persp > -200:
            label, symbol, badge_color = "Great", "!", "#5c8bb0"
            explanation = f"Found the only strong move in a critical position (+{(best_persp - second_persp)/100:.1f} over next option)."
        elif move == best_move or cp_loss <= 5:
            label, symbol, badge_color = "Best", "★", "#96bc4b"
            explanation = "The engine's top choice in this position."
        elif cp_loss <= 25:
            label, symbol, badge_color = "Excellent", "👍", "#96bc4b"
            explanation = "Nearly indistinguishable from the top engine move."
        elif cp_loss <= 55:
            label, symbol, badge_color = "Good", "✓", "#97af8b"
            explanation = "A solid, playable move that keeps the position stable."
        elif best_persp >= 300 and played_persp < 100 and cp_loss > 180:
            label, symbol, badge_color = "Miss", "❌", "#ff7769"
            explanation = f"Missed a winning tactical opportunity ({best_move.san_neutral})."
        elif cp_loss <= 110:
            label, symbol, badge_color = "Inaccuracy", "?!", "#f7c045"
            explanation = f"Slight inaccuracy (-{cp_loss/100:.2f} pawns). {best_move.san_neutral} was stronger."
        elif cp_loss <= 250:
            label, symbol, badge_color = "Mistake", "?", "#e58f2a"
            explanation = f"Mistake losing {cp_loss/100:.2f} pawns of advantage. Best was {best_move.san_neutral}."
        else:
            label, symbol, badge_color = "Blunder", "??", "#ca3431"
            explanation = f"Severe blunder dropping {cp_loss/100:.2f} pawns! {best_move.san_neutral} was required."

        # Calculate move accuracy % (0 to 100) using Lichess/Chess.com exponential formula
        move_accuracy = max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * (win_prob_loss * 100.0)) - 3.1669))
        if cp_loss == 0 or is_book:
            move_accuracy = 100.0

        review_record = {
            "move_number": board.fullmove_number if player_color == 'w' else board.fullmove_number - 1,
            "player": "White" if is_white else "Black",
            "move_uci": move.uci,
            "move_san": move.san_neutral,
            "classification": label,
            "symbol": symbol,
            "color_hex": badge_color,
            "cp_loss": cp_loss,
            "eval_before_cp": best_score_white,
            "eval_after_cp": played_score_white,
            "eval_pawns": round(played_score_white / 100.0, 2),
            "move_accuracy_pct": round(move_accuracy, 1),
            "best_move_was": best_move.san_neutral,
            "explanation": explanation,
        }
        board.move_evaluations.append(review_record)
        return review_record

    @staticmethod
    def get_game_review_summary(board: ChessBoard) -> Dict[str, Any]:
        """Aggregates accuracy % and counts of Brilliant/Great/Best/Blunder moves for both sides."""
        summary: Dict[str, Any] = {
            "White": {"accuracy_pct": 100.0, "counts": {}, "avg_cp_loss": 0.0},
            "Black": {"accuracy_pct": 100.0, "counts": {}, "avg_cp_loss": 0.0},
            "total_moves_graded": len(board.move_evaluations),
            "recent_moves": board.move_evaluations[-10:],
        }
        for side in ("White", "Black"):
            side_evals = [e for e in board.move_evaluations if e["player"] == side]
            if not side_evals:
                continue
            avg_acc = sum(e["move_accuracy_pct"] for e in side_evals) / len(side_evals)
            avg_cpl = sum(e["cp_loss"] for e in side_evals) / len(side_evals)
            counts: Dict[str, int] = {}
            for e in side_evals:
                c = e["classification"]
                counts[c] = counts.get(c, 0) + 1
            summary[side] = {
                "accuracy_pct": round(avg_acc, 1),
                "avg_cp_loss": round(avg_cpl, 1),
                "counts": counts,
            }
        return summary


# ---------------------------------------------------------------------------
# Multi-API Store & AI Director (Engine Directs AI, Never Spoils)
# ---------------------------------------------------------------------------

class MultiAPIStore:
    """
    Manages multiple AI API endpoints and credentials in `.flame/chess_apis.json`.
    Supports:
    - 'gemini': Google Gemini API (`https://generativelanguage.googleapis.com/v1beta`)
    - 'openai': OpenAI / OpenRouter / Groq / DeepSeek (`https://api.openai.com/v1/chat/completions`)
    - 'anthropic': Anthropic Messages API (`https://api.anthropic.com/v1/messages`)
    - 'ollama': Local Ollama API (`http://127.0.0.1:11434/api/generate`)
    """

    def __init__(self, config_path: Optional[Path] = None):
        self.path = config_path or (Path.cwd() / ".flame" / "chess_apis.json")
        self.profiles: Dict[str, Dict[str, Any]] = {
            "local-qwen": {
                "name": "local-qwen",
                "provider": "ollama",
                "model": "qwen2.5-coder:1.5b",
                "endpoint": "http://127.0.0.1:11434/api/generate",
                "api_key": "",
            },
            "gemini-flash": {
                "name": "gemini-flash",
                "provider": "gemini",
                "model": "gemini-1.5-flash",
                "endpoint": "https://generativelanguage.googleapis.com/v1beta",
                "api_key": os.environ.get("GEMINI_API_KEY", ""),
            }
        }
        self.load()

    def load(self) -> None:
        if self.path.exists():
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(raw, dict) and "profiles" in raw:
                    self.profiles.update(raw["profiles"])
            except Exception:
                pass

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"profiles": self.profiles}, indent=2), encoding="utf-8")

    def add_or_update_profile(
        self,
        name: str,
        provider: str,
        model: str,
        endpoint: str = "",
        api_key: str = ""
    ) -> Dict[str, Any]:
        provider = provider.strip().lower()
        if not endpoint:
            if provider == "gemini":
                endpoint = "https://generativelanguage.googleapis.com/v1beta"
            elif provider == "ollama":
                endpoint = "http://127.0.0.1:11434/api/generate"
            elif provider == "anthropic":
                endpoint = "https://api.anthropic.com/v1/messages"
            else:
                endpoint = "https://api.openai.com/v1/chat/completions"

        profile = {
            "name": name.strip(),
            "provider": provider,
            "model": model.strip(),
            "endpoint": endpoint.strip(),
            "api_key": api_key.strip(),
        }
        self.profiles[name.strip()] = profile
        self.save()
        return self._redact_profile(profile)

    @staticmethod
    def _redact_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(profile)
        key = out.get("api_key", "")
        if key and len(key) > 8:
            out["api_key_masked"] = key[:4] + "..." + key[-4:]
        else:
            out["api_key_masked"] = "configured" if key else "none"
        out.pop("api_key", None)
        return out

    def list_profiles(self) -> List[Dict[str, Any]]:
        return [self._redact_profile(p) for p in self.profiles.values()]

    def get_profile(self, name: str) -> Dict[str, Any]:
        if name not in self.profiles:
            raise ValueError(f"AI profile '{name}' not found. Available profiles: {list(self.profiles.keys())}")
        return self.profiles[name]


class AIDirector:
    """
    Directs external or local AI models to play chess using the spoiler-free telemetry packet.
    Supports AI vs AI matches and single-turn AI direction.
    """

    def __init__(self, board: ChessBoard, analyzer: ChessAnalyzer, api_store: MultiAPIStore):
        self.board = board
        self.analyzer = analyzer
        self.api_store = api_store

    def build_ai_prompt(self, telemetry: Dict[str, Any], retry_error: Optional[str] = None) -> str:
        """
        Constructs the exact, spoiler-free prompt containing full piece positions and legal moves.
        Notice: Zero mention of check, checkmate, or evaluation scores!
        """
        prompt_lines = [
            f"You are playing Chess as {telemetry['active_turn']} (Move #{telemetry['fullmove_number']}).",
            "Analyze the board coordinates and choose ONE legal move from the provided legal_moves_uci list.",
            "",
            "=== CURRENT BOARD POSITION ===",
            f"FEN: {telemetry['fen']}",
            f"Castling Rights: {telemetry['castling_rights']} | En Passant Square: {telemetry['en_passant_target']}",
            f"White Pieces: {json.dumps(telemetry['white_pieces'])}",
            f"Black Pieces: {json.dumps(telemetry['black_pieces'])}",
            f"Move History (UCI): {' '.join(telemetry['move_history_uci'][-16:]) or 'Game Start'}",
            "",
            "=== LEGAL MOVES YOU CAN MAKE ===",
            f"UCI Legal Moves: {json.dumps(telemetry['legal_moves_uci'])}",
            f"SAN Legal Moves: {json.dumps(telemetry['legal_moves_san'])}",
        ]
        if retry_error:
            prompt_lines += [
                "",
                f"WARNING: Your previous response was invalid ({retry_error}).",
                "You MUST pick an exact move string from the UCI Legal Moves list above!"
            ]
        prompt_lines += [
            "",
            'Respond ONLY with a valid JSON object in this exact format: {"move": "<uci_or_san_move>", "reasoning": "<brief 1-sentence thought>"}'
        ]
        return "\n".join(prompt_lines)

    def call_ai_endpoint(self, profile: Dict[str, Any], prompt: str) -> str:
        provider = profile["provider"]
        model = profile["model"]
        endpoint = profile["endpoint"]
        api_key = profile.get("api_key", "")

        if provider == "gemini":
            if not api_key:
                api_key = os.environ.get("GEMINI_API_KEY", "")
            if not api_key:
                raise ValueError(f"Profile '{profile['name']}' has no Gemini API key configured.")
            m_clean = model[len("models/"):] if model.startswith("models/") else model
            url = f"{endpoint.rstrip('/')}/models/{ urllib.parse.quote(m_clean, safe='.-_') }:generateContent"
            body = json.dumps({
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 256, "responseMimeType": "application/json"}
            }).encode("utf-8")
            req = urllib.request.Request(url, data=body, method="POST", headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["candidates"][0]["content"]["parts"][0]["text"]

        elif provider == "ollama":
            url = endpoint
            body = json.dumps({
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2, "num_predict": 200}
            }).encode("utf-8")
            req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("response", "")

        elif provider == "anthropic":
            if not api_key:
                raise ValueError(f"Profile '{profile['name']}' requires an Anthropic API key.")
            body = json.dumps({
                "model": model,
                "max_tokens": 256,
                "messages": [{"role": "user", "content": prompt}]
            }).encode("utf-8")
            req = urllib.request.Request(endpoint, data=body, method="POST", headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01"
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["content"][0]["text"]

        else:  # OpenAI / OpenRouter / Groq / DeepSeek / Custom OpenAI-compatible
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            body = json.dumps({
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": 256,
            }).encode("utf-8")
            req = urllib.request.Request(endpoint, data=body, method="POST", headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]

    @staticmethod
    def extract_move_from_response(raw_text: str, legal_moves: List[Move]) -> Tuple[Move, str]:
        """Extracts the chosen move and reasoning from an AI response (JSON or free text)."""
        text = raw_text.strip()
        reasoning = ""

        # 1. Try JSON parsing
        try:
            start, end = text.find("{"), text.rfind("}")
            if start != -1 and end > start:
                obj = json.loads(text[start:end + 1])
                cand = str(obj.get("move", "")).strip()
                reasoning = str(obj.get("reasoning", "")).strip()
                if cand:
                    clean = cand.replace("+", "").replace("#", "").replace("!", "").replace("?", "")
                    for m in legal_moves:
                        if m.uci.lower() == clean.lower() or m.san_neutral.lower() == clean.lower():
                            return m, reasoning
        except Exception:
            pass

        # 2. Scan tokens for exact UCI or SAN match
        tokens = re.findall(r"[A-Za-z0-9\-=]+", text)
        for tok in tokens:
            for m in legal_moves:
                if tok == m.uci or tok == m.san_neutral:
                    return m, text[:200]

        raise ValueError(f"Could not extract a legal move from AI output: {text[:160]}")

    def direct_ai_turn(self, profile_name: str, max_retries: int = 2) -> Dict[str, Any]:
        """
        Sends the spoiler-free board telemetry to `profile_name`, validates the AI's
        returned move, executes it on the board, and runs the Chess.com Move Classifier!
        """
        status = self.board.game_status()
        if status.get("is_game_over"):
            return {"error": "Game is already over.", "status": status}

        profile = self.api_store.get_profile(profile_name)
        telemetry = self.board.get_ai_position_telemetry()
        legal = self.board.legal_moves()

        last_err: Optional[str] = None
        chosen_move: Optional[Move] = None
        reasoning = ""

        for attempt in range(max_retries + 1):
            prompt = self.build_ai_prompt(telemetry, retry_error=last_err)
            try:
                raw_reply = self.call_ai_endpoint(profile, prompt)
                chosen_move, reasoning = self.extract_move_from_response(raw_reply, legal)
                break
            except Exception as exc:
                last_err = str(exc)

        if chosen_move is None:
            # Built-in tactical search fallback ensures games never crash or stall
            root_scored = self.analyzer.search_root_moves(self.board, depth=2)
            if root_scored:
                chosen_move = root_scored[0][0]
                reasoning = f"(Calculated by tactical evaluation engine. AI endpoint status: {last_err or 'offline'})"
            elif legal:
                chosen_move = legal[0]
                reasoning = "(Fallback legal move)"
            else:
                raise RuntimeError("No legal moves available.")

        # Execute and classify the move using the Chess.com-style Move Classifier
        move_review = self.analyzer.classify_and_make_move(self.board, chosen_move)

        return {
            "ai_profile": profile_name,
            "model": profile["model"],
            "move_played_uci": chosen_move.uci,
            "move_played_san": chosen_move.san_neutral,
            "ai_reasoning": reasoning,
            "move_classification": move_review,
            "fen_after": self.board.to_fen(),
            "game_status": self.board.game_status(),
            "board_ascii": self.board.render_ascii(use_unicode=True),
        }

    def run_ai_vs_ai_match(
        self,
        white_profile: str,
        black_profile: str,
        max_ply: int = 10,
        reset_first: bool = False
    ) -> Dict[str, Any]:
        """
        Runs an AI-vs-AI match for up to `max_ply` half-moves (turns) between
        `white_profile` and `black_profile`.
        """
        if reset_first:
            self.board.load_fen(START_FEN)

        turns_played: List[Dict[str, Any]] = []
        for _ in range(max_ply):
            st = self.board.game_status()
            if st.get("is_game_over"):
                break
            active_profile = white_profile if self.board.turn == 'w' else black_profile
            turn_result = self.direct_ai_turn(active_profile)
            turns_played.append({
                "ply": len(self.board.history),
                "player": turn_result["move_classification"]["player"],
                "profile": active_profile,
                "move": turn_result["move_played_san"],
                "classification": f"{turn_result['move_classification']['classification']} ({turn_result['move_classification']['symbol']})",
                "eval_pawns": turn_result["move_classification"]["eval_pawns"],
                "reasoning": turn_result["ai_reasoning"],
            })

        return {
            "match_Active": f"{white_profile} (White) vs {black_profile} (Black)",
            "ply_executed": len(turns_played),
            "turns": turns_played,
            "game_review": self.analyzer.get_game_review_summary(self.board),
            "final_fen": self.board.to_fen(),
            "game_status": self.board.game_status(),
            "board_ascii": self.board.render_ascii(use_unicode=True),
        }


# ---------------------------------------------------------------------------
# MCP Protocol Server (Stdio JSON-RPC 2.0)
# ---------------------------------------------------------------------------

class ChessMCPServer:
    def __init__(self, board: ChessBoard, analyzer: ChessAnalyzer, api_store: MultiAPIStore, director: AIDirector):
        self.board = board
        self.analyzer = analyzer
        self.api_store = api_store
        self.director = director

    def handle_request(self, req: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        method = req.get("method")
        msg_id = req.get("id")
        params = req.get("params", {})

        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
                    "serverInfo": {"name": "flame-chess-director-mcp", "version": ENGINE_VERSION}
                }
            }
        elif method == "notifications/initialized":
            return None
        elif method == "ping":
            return {"jsonrpc": "2.0", "id": msg_id, "result": {}}
        elif method == "tools/list":
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "tools": [
                        {
                            "name": "chess_get_ai_position",
                            "description": (
                                "Returns full spoiler-free board data for an AI player: exact piece coordinates "
                                "for White and Black, occupied square map, FEN, and every legal move (strictly "
                                "without check/checkmate '+' or '#' spoilers)."
                            ),
                            "inputSchema": {"type": "object", "properties": {}}
                        },
                        {
                            "name": "chess_make_move",
                            "description": (
                                "Executes a legal move in UCI ('e2e4') or SAN ('Nf3') format, and returns the "
                                "Chess.com-style Move Classification (Brilliant !!, Great !, Best ★, Book 📖, "
                                "Excellent 👍, Good ✓, Inaccuracy ?!, Mistake ?, Miss ❌, Blunder ??)."
                            ),
                            "inputSchema": {
                                "type": "object",
                                "properties": {"move": {"type": "string", "description": "Move in UCI or SAN format."}},
                                "required": ["move"]
                            }
                        },
                        {
                            "name": "chess_save_api",
                            "description": "Saves an AI API endpoint profile (Gemini, OpenAI/OpenRouter/Groq, Anthropic, or Ollama) for AI chess play.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string", "description": "Profile identifier (e.g. 'gemini-pro', 'local-qwen', 'claude-sonnet')"},
                                    "provider": {"type": "string", "description": "Provider type: 'gemini', 'openai', 'anthropic', or 'ollama'"},
                                    "model": {"type": "string", "description": "Model name (e.g. 'gemini-3.8-flash', 'qwen2.5-coder:1.5b')"},
                                    "endpoint": {"type": "string", "description": "Optional custom API base URL"},
                                    "api_key": {"type": "string", "description": "Optional API key"}
                                },
                                "required": ["name", "provider", "model"]
                            }
                        },
                        {
                            "name": "chess_list_apis",
                            "description": "Lists all configured AI API profiles available for AI-vs-AI or AI turn direction.",
                            "inputSchema": {"type": "object", "properties": {}}
                        },
                        {
                            "name": "chess_direct_ai_turn",
                            "description": "Directs a saved AI profile to analyze the spoiler-free position and play one move on the board.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "profile_name": {"type": "string", "description": "Saved AI profile name (e.g. 'local-qwen' or 'gemini-flash')"}
                                },
                                "required": ["profile_name"]
                            }
                        },
                        {
                            "name": "chess_ai_vs_ai_match",
                            "description": "Orchestrates an AI-vs-AI match between two saved AI profiles for N half-moves (ply).",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "white_profile": {"type": "string", "description": "AI profile playing White"},
                                    "black_profile": {"type": "string", "description": "AI profile playing Black"},
                                    "max_ply": {"type": "integer", "description": "Number of half-moves to run (default: 6)", "default": 6},
                                    "reset_first": {"type": "boolean", "description": "Whether to reset the board before starting", "default": False}
                                },
                                "required": ["white_profile", "black_profile"]
                            }
                        },
                        {
                            "name": "chess_game_review",
                            "description": "Returns the full Chess.com-style Game Review: White & Black accuracy %, average centipawn loss, and move tier counts.",
                            "inputSchema": {"type": "object", "properties": {}}
                        },
                        {
                            "name": "chess_new_game",
                            "description": "Resets the chessboard to the starting position or loads a custom FEN.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {"fen": {"type": "string", "description": "Optional custom FEN string."}}
                            }
                        },
                        {
                            "name": "chess_undo",
                            "description": "Takes back the last move played.",
                            "inputSchema": {"type": "object", "properties": {}}
                        }
                    ]
                }
            }
        elif method == "tools/call":
            tool_name = params.get("name")
            args = params.get("arguments", {})
            try:
                res_content = self.execute_tool(tool_name, args)
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(res_content, indent=2)}]}
                }
            except Exception as e:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32603, "message": str(e)}
                }
        else:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"}
            }

    def execute_tool(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name in ("chess_get_ai_position", "chess_get_board"):
            return self.board.get_ai_position_telemetry()

        elif name == "chess_make_move":
            move_str = args.get("move", "")
            move = self.board.parse_move(move_str)
            review = self.analyzer.classify_and_make_move(self.board, move)
            return {
                "move_played": move.san_neutral,
                "uci": move.uci,
                "move_classification": review,
                "fen": self.board.to_fen(),
                "game_status": self.board.game_status(),
                "next_player_telemetry": self.board.get_ai_position_telemetry(),
            }

        elif name == "chess_save_api":
            prof = self.api_store.add_or_update_profile(
                name=args["name"],
                provider=args["provider"],
                model=args["model"],
                endpoint=args.get("endpoint", ""),
                api_key=args.get("api_key", ""),
            )
            return {"status": "saved", "profile": prof}

        elif name == "chess_list_apis":
            return {"profiles": self.api_store.list_profiles()}

        elif name == "chess_direct_ai_turn":
            return self.director.direct_ai_turn(args["profile_name"])

        elif name == "chess_ai_vs_ai_match":
            return self.director.run_ai_vs_ai_match(
                white_profile=args["white_profile"],
                black_profile=args["black_profile"],
                max_ply=int(args.get("max_ply", 6)),
                reset_first=bool(args.get("reset_first", False)),
            )

        elif name == "chess_game_review":
            return self.analyzer.get_game_review_summary(self.board)

        elif name == "chess_new_game":
            fen = args.get("fen", START_FEN)
            self.board.load_fen(fen)
            return {
                "message": "New game initialized.",
                "telemetry": self.board.get_ai_position_telemetry(),
            }

        elif name == "chess_undo":
            undone = self.board.undo_move()
            if not undone:
                return {"error": "No moves to undo."}
            if self.board.move_evaluations:
                self.board.move_evaluations.pop()
            return {
                "undone_move": undone.san_neutral or undone.uci,
                "telemetry": self.board.get_ai_position_telemetry(),
            }
        else:
            raise ValueError(f"Unknown tool: {name}")

    def run_stdio(self) -> None:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
                resp = self.handle_request(payload)
                if resp is not None:
                    sys.stdout.write(json.dumps(resp) + "\n")
                    sys.stdout.flush()
            except Exception as e:
                err_resp = {"jsonrpc": "2.0", "error": {"code": -32700, "message": str(e)}}
                sys.stdout.write(json.dumps(err_resp) + "\n")
                sys.stdout.flush()


# ---------------------------------------------------------------------------
# HTTP REST API Server
# ---------------------------------------------------------------------------

class ChessHTTPHandler(BaseHTTPRequestHandler):
    board: ChessBoard = ChessBoard()
    analyzer: ChessAnalyzer = ChessAnalyzer(depth=3)
    api_store: MultiAPIStore = MultiAPIStore()
    director: AIDirector = AIDirector(board, analyzer, api_store)

    def _send_json(self, status: int, data: Dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split('?')[0]
        if path in ("/", "/api/board", "/api/position"):
            # Spoiler-free full position telemetry for AI
            self._send_json(200, self.board.get_ai_position_telemetry())
        elif path == "/api/review":
            self._send_json(200, self.analyzer.get_game_review_summary(self.board))
        elif path == "/api/settings/apis":
            self._send_json(200, {"profiles": self.api_store.list_profiles()})
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self) -> None:
        path = self.path.split('?')[0]
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            params = json.loads(body)
        except Exception:
            params = {}

        try:
            if path == "/api/move":
                move_str = params.get("move", "")
                move = self.board.parse_move(move_str)
                review = self.analyzer.classify_and_make_move(self.board, move)
                self._send_json(200, {
                    "move_played": move.san_neutral,
                    "uci": move.uci,
                    "move_classification": review,
                    "game_status": self.board.game_status(),
                    "next_player_telemetry": self.board.get_ai_position_telemetry(),
                })

            elif path == "/api/settings/save-api":
                prof = self.api_store.add_or_update_profile(
                    name=params["name"],
                    provider=params["provider"],
                    model=params["model"],
                    endpoint=params.get("endpoint", ""),
                    api_key=params.get("api_key", ""),
                )
                self._send_json(200, {"status": "saved", "profile": prof})

            elif path == "/api/ai/turn":
                profile_name = params.get("profile_name", "local-qwen")
                res = self.director.direct_ai_turn(profile_name)
                self._send_json(200, res)

            elif path == "/api/ai-vs-ai/match":
                res = self.director.run_ai_vs_ai_match(
                    white_profile=params["white_profile"],
                    black_profile=params["black_profile"],
                    max_ply=int(params.get("max_ply", 6)),
                    reset_first=bool(params.get("reset_first", False)),
                )
                self._send_json(200, res)

            elif path == "/api/new-game":
                fen = params.get("fen", START_FEN)
                self.board.load_fen(fen)
                self._send_json(200, {
                    "message": "New game initialized.",
                    "telemetry": self.board.get_ai_position_telemetry(),
                })

            elif path == "/api/undo":
                count = int(params.get("count", 1))
                undone_list = []
                for _ in range(count):
                    undone = self.board.undo_move()
                    if undone:
                        if self.board.move_evaluations:
                            self.board.move_evaluations.pop()
                        undone_list.append(undone.san_neutral or undone.uci)
                    else:
                        break
                if not undone_list:
                    self._send_json(400, {"error": "No move to undo."})
                else:
                    self._send_json(200, {
                        "undone_move": undone_list[-1],
                        "undone_moves": undone_list,
                        "telemetry": self.board.get_ai_position_telemetry(),
                    })
            else:
                self._send_json(404, {"error": "Not Found"})
        except Exception as e:
            self._send_json(400, {"error": str(e)})


# ---------------------------------------------------------------------------
# Interactive Terminal REPL (CLI)
# ---------------------------------------------------------------------------

def run_cli() -> None:
    board = ChessBoard()
    analyzer = ChessAnalyzer(depth=3)
    api_store = MultiAPIStore()
    director = AIDirector(board, analyzer, api_store)

    print("\n" + "=" * 68)
    print(f"♞ FLAME AGI CHESS DIRECTOR & MULTI-API ARENA (v{ENGINE_VERSION})")
    print("=" * 68)
    print("Commands:")
    print("  • <move>                         : Play move (e.g. e4, Nf3, O-O, e2e4) & see Chess.com grade")
    print("  • telemetry                      : Inspect the exact spoiler-free JSON sent to AI")
    print("  • apis                           : List saved AI API profiles")
    print("  • save-api <name> <prov> <model> [key] [url] : Save an AI endpoint profile")
    print("  • direct <profile>               : Direct an AI profile to play the current turn")
    print("  • match <white_ai> <black_ai> [ply] : Run an AI-vs-AI match")
    print("  • review                         : Show full Chess.com-style Game Review & Accuracy %")
    print("  • undo | reset | quit\n")

    while True:
        print("\n" + board.render_ascii(use_unicode=True))
        status = board.game_status()
        if status.get("is_game_over"):
            print(f"\n🏆 Game Over: {status['message']}")
            rev = analyzer.get_game_review_summary(board)
            print(f"📊 Accuracy — White: {rev['White']['accuracy_pct']}% | Black: {rev['Black']['accuracy_pct']}%")

        prompt = f"FlameDirector [{board.turn.upper()}]> "
        try:
            cmd = input(prompt).strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if not cmd:
            continue
        parts = cmd.split()
        c_low = parts[0].lower()

        if c_low in ("quit", "exit", "q"):
            break
        elif c_low == "reset":
            board.load_fen(START_FEN)
            print("Game reset to starting position.")
        elif c_low == "undo":
            m = board.undo_move()
            if board.move_evaluations:
                board.move_evaluations.pop()
            print(f"Undid move: {m.san_neutral if m else 'None'}")
        elif c_low == "telemetry":
            print(json.dumps(board.get_ai_position_telemetry(), indent=2))
        elif c_low == "apis":
            print(json.dumps(api_store.list_profiles(), indent=2))
        elif c_low == "save-api" and len(parts) >= 4:
            name, prov, model = parts[1], parts[2], parts[3]
            key = parts[4] if len(parts) >= 5 else ""
            url = parts[5] if len(parts) >= 6 else ""
            prof = api_store.add_or_update_profile(name, prov, model, url, key)
            print(f"Saved AI profile: {json.dumps(prof)}")
        elif c_low == "direct" and len(parts) >= 2:
            try:
                res = director.direct_ai_turn(parts[1])
                mc = res["move_classification"]
                print(
                    f"🤖 [{res['ai_profile']}] played {res['move_played_san']} — "
                    f"{mc['classification']} {mc['symbol']} (Accuracy: {mc['move_accuracy_pct']}%)"
                )
                print(f"   Reason: {res['ai_reasoning']}")
                print(f"   Coach : {mc['explanation']}")
            except Exception as e:
                print(f"AI Turn Error: {e}")
        elif c_low == "match" and len(parts) >= 3:
            w_prof, b_prof = parts[1], parts[2]
            ply = int(parts[3]) if len(parts) >= 4 else 6
            try:
                res = director.run_ai_vs_ai_match(w_prof, b_prof, max_ply=ply)
                for t in res["turns"]:
                    print(f"  #{t['ply']} {t['player']} ({t['profile']}): {t['move']} -> {t['classification']} [Eval: {t['eval_pawns']:+.2f}]")
            except Exception as e:
                print(f"Match Error: {e}")
        elif c_low == "review":
            print(json.dumps(analyzer.get_game_review_summary(board), indent=2))
        else:
            try:
                move = board.parse_move(cmd)
                rev = analyzer.classify_and_make_move(board, move)
                print(
                    f"Played: {rev['move_san']}  |  {rev['classification']} {rev['symbol']}  "
                    f"|  Eval: {rev['eval_pawns']:+.2f}  |  Accuracy: {rev['move_accuracy_pct']}%"
                )
                print(f"Coach : {rev['explanation']}")
            except Exception as e:
                print(f"Error: {e}")


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Flame AGI Chess Director, Multi-API Arena & MCP Server")
    parser.add_argument("--mcp", action="store_true", help="Run as MCP Server via stdio JSON-RPC")
    parser.add_argument("--serve", action="store_true", help="Run as REST API HTTP Server")
    parser.add_argument("--port", type=int, default=8765, help="Port for REST API (default: 8765)")
    parser.add_argument("--cli", action="store_true", help="Run interactive terminal CLI")
    parser.add_argument("--move", type=str, help="Play a move and return evaluation JSON")
    parser.add_argument("--position", action="store_true", help="Return AI position telemetry JSON")
    parser.add_argument("--review", action="store_true", help="Return game review summary JSON")
    parser.add_argument("--direct", type=str, help="Direct an AI profile to play one move")
    parser.add_argument("--match", nargs=2, metavar=("WHITE", "BLACK"), help="Run AI vs AI match")
    parser.add_argument("--ply", type=int, default=6, help="Max ply for match")
    parser.add_argument("--fen", type=str, default=START_FEN, help="Starting FEN for move or position")
    args = parser.parse_args()

    board = ChessBoard()
    analyzer = ChessAnalyzer(depth=3)
    api_store = MultiAPIStore()
    director = AIDirector(board, analyzer, api_store)

    if args.move:
        board = ChessBoard(args.fen)
        analyzer = ChessAnalyzer(depth=3)
        move = board.parse_move(args.move)
        res = analyzer.classify_and_make_move(board, move)
        out = {
            "move_played": move.san_neutral,
            "uci": move.uci,
            "move_classification": res,
            "game_status": board.game_status(),
            "next_player_telemetry": board.get_ai_position_telemetry(),
        }
        print(json.dumps(out, indent=2))
        return
    elif args.position:
        board = ChessBoard(args.fen)
        print(json.dumps(board.get_ai_position_telemetry(), indent=2))
        return
    elif args.review:
        board = ChessBoard(args.fen)
        analyzer = ChessAnalyzer(depth=3)
        print(json.dumps(analyzer.get_game_review_summary(board), indent=2))
        return
    elif args.direct:
        board = ChessBoard(args.fen)
        analyzer = ChessAnalyzer(depth=3)
        api_store = MultiAPIStore()
        director = AIDirector(board, analyzer, api_store)
        res = director.direct_ai_turn(args.direct)
        print(json.dumps(res, indent=2))
        return
    elif args.match:
        board = ChessBoard(args.fen)
        analyzer = ChessAnalyzer(depth=3)
        api_store = MultiAPIStore()
        director = AIDirector(board, analyzer, api_store)
        res = director.run_ai_vs_ai_match(args.match[0], args.match[1], max_ply=args.ply)
        print(json.dumps(res, indent=2))
        return
    if args.mcp:
        server = ChessMCPServer(board, analyzer, api_store, director)
        server.run_stdio()
    elif args.serve:
        ChessHTTPHandler.board = board
        ChessHTTPHandler.analyzer = analyzer
        ChessHTTPHandler.api_store = api_store
        ChessHTTPHandler.director = director
        server_address = ("127.0.0.1", args.port)
        httpd = HTTPServer(server_address, ChessHTTPHandler)
        print(f"🔥 Flame Chess Director & AI Arena active at http://127.0.0.1:{args.port}")
        print("Endpoints:")
        print(f"  • GET  http://127.0.0.1:{args.port}/api/position          (Spoiler-free AI telemetry)")
        print(f"  • GET  http://127.0.0.1:{args.port}/api/review            (Chess.com Game Review)")
        print(f"  • GET  http://127.0.0.1:{args.port}/api/settings/apis     (List saved AI endpoints)")
        print(f"  • POST http://127.0.0.1:{args.port}/api/settings/save-api (Save AI endpoint profile)")
        print(f"  • POST http://127.0.0.1:{args.port}/api/move              (Play move & classify)")
        print(f"  • POST http://127.0.0.1:{args.port}/api/ai/turn           (Direct AI profile to move)")
        print(f"  • POST http://127.0.0.1:{args.port}/api/ai-vs-ai/match    (Run AI vs AI match)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            httpd.server_close()
    else:
        run_cli()


if __name__ == "__main__":
    main()