#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
coder_engine.py - FlameAGI Coder Engine (v1.2.1 - Leader Hardened + OpenCode Fix)
=================================================================================

One file, Python standard library only (no pip installs, no vector DBs).
Optimized for 8GB RAM DDR4 + Intel i5 12th Gen U-series + VS Code workflows.

What it does
------------
- Routes a coding task to one of two backends:
    - "gemini"   : Gemini API, returns COMPLETE new file contents (best for
                   generating files and refactors).
    - "opencode" : your local OpenCode CLI edits files in place (best for small
                   local patches). The engine snapshots first, so every change
                   can be undone, and prunes untouched backups immediately to
                   save SSD space.
- Safety guard on every change, before it is kept:
    - Python files must pass ast.parse AND py_compile (JSON files must parse).
    - A unified diff is generated for every file.
    - A .bak snapshot of every touched file is stored in
      .flame/runs/<run_id>/files/ for one-command rollback.
    - Everything is all-or-nothing: one bad file rolls the whole run back.
- Works directly in your VS Code workspace and can open VS Code's visual diff.
- Auto-loads .env / .flame/.env files and includes an `init` command so you
  never have to wrestle with Windows PowerShell vs CMD environment variables.
- Auto-detects file names mentioned in your prompt even if you omit --files,
  and dynamically loads missing context files during Gemini repair turns.
- Runs background RSI / Pet Mode tasks at below-normal CPU priority so your
  i5 U-series laptop never stutters.
- Every action is written as JSON lines to .flame/logs/coder_engine.jsonl.

Quick start (from the workspace folder, e.g. VS Code's terminal)
----------------------------------------------------------------
    python coder_engine.py init --key YOUR_GEMINI_API_KEY
    python coder_engine.py doctor                        # plain-English setup check
    python coder_engine.py run "add input validation to login() in app.py"
    python coder_engine.py run "fix the typo in the header" --review
    python coder_engine.py diff <run_id>                 # opens VS Code diff
    python coder_engine.py approve <run_id>              # keep a staged change
    python coder_engine.py rollback                      # undo the last applied run
"""
from __future__ import annotations

import argparse
import ast
import contextlib
import difflib
import gc
import hashlib
import json
import os
import py_compile
import re
import shlex
import shutil
import stat as stat_mod
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

ENGINE_VERSION = "1.2.1"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
STATE_DIR = ".flame"
PROTECTED_TOP_DIRS = {".git", STATE_DIR}
IGNORED_DIRS = {
    ".git", STATE_DIR, "node_modules", "__pycache__", ".venv", "venv", "env",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".idea", "dist", "build",
    ".next", ".tox", "target", ".gradle", "site-packages",
}
# Source/config text only. ".env" has no extension, so secrets files are never scanned into prompts.
TEXT_EXTENSIONS = {
    ".py", ".pyi", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".json", ".md", ".txt",
    ".html", ".css", ".scss", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".sh",
    ".bat", ".ps1", ".java", ".c", ".h", ".cpp", ".cs", ".go", ".rs", ".sql",
}
CMD_UNSAFE_CHARS = set('&|<>^%!"\r\n')
EVENTS = (
    "run_started", "backend_selected", "backend_failed", "guard_rejected",
    "run_staged", "run_applied", "run_rolled_back", "run_failed", "run_finished",
    "error_report_received", "pet_request_received",
)


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------
class EngineError(Exception):
    """An expected, explainable failure (shown to the user as plain text)."""


class PathError(EngineError):
    """A path was unsafe (outside the workspace, protected, malformed)."""


class BackendError(EngineError):
    """A backend was unavailable or failed. Eligible for backend fallback."""


class GuardRejected(EngineError):
    """The safety guard refused a change. NOT eligible for fallback."""


# --------------------------------------------------------------------------
# Small utilities
# --------------------------------------------------------------------------
def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_with_hash(src: Path, dst: Path) -> str:
    """Streaming copy (64KB chunks, constant memory) that returns the sha256."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with open(src, "rb") as reader, open(dst, "wb") as writer:
        for chunk in iter(lambda: reader.read(65536), b""):
            digest.update(chunk)
            writer.write(chunk)
    with contextlib.suppress(OSError):
        shutil.copystat(str(src), str(dst))
    return digest.hexdigest()


def atomic_write_bytes(path: Path, data: bytes) -> None:
    """Write to a temp file in the same folder, then swap it in (never half-written)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".flame-tmp-", suffix=".part")
    tmp_name: Optional[str] = tmp
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        if path.exists():
            with contextlib.suppress(OSError):
                shutil.copymode(str(path), tmp)
        last_error: Optional[Exception] = None
        for _ in range(5):
            try:
                os.replace(tmp, str(path))
                tmp_name = None
                return
            except PermissionError as exc:  # Windows: file held open by another program
                last_error = exc
                time.sleep(0.2)
        raise EngineError(f"Cannot write '{path.name}': another program is holding it open ({last_error}).")
    finally:
        if tmp_name and os.path.exists(tmp_name):
            with contextlib.suppress(OSError):
                os.unlink(tmp_name)


def read_text_strict(path: Path) -> str:
    try:
        return path.read_bytes().decode("utf-8")
    except UnicodeDecodeError as exc:
        raise EngineError(f"'{path.name}' is not UTF-8 text ({exc.reason}); refusing to edit it.")


_KEY_RE = re.compile(r"AIza[0-9A-Za-z_\-]{20,}|Bearer\s+[A-Za-z0-9._\-]{12,}")


def redact(value: Any, secrets: List[str]) -> Any:
    if isinstance(value, str):
        for secret in secrets:
            if secret and len(secret) >= 8:
                value = value.replace(secret, "[REDACTED]")
        return _KEY_RE.sub("[REDACTED]", value)
    if isinstance(value, dict):
        return {k: redact(v, secrets) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v, secrets) for v in value]
    return value


def resolve_in_workspace(root: Path, rel: str) -> Path:
    """Resolve a user/model supplied path and make sure it stays inside the workspace."""
    if not isinstance(rel, str) or not rel.strip() or "\x00" in rel:
        raise PathError("empty or malformed path")
    candidate = Path(rel.strip())
    full = candidate if candidate.is_absolute() else root / candidate
    resolved = full.resolve()
    try:
        parts = resolved.relative_to(root).parts
    except ValueError:
        raise PathError(f"'{rel}' is outside the workspace")
    if not parts:
        raise PathError("path points at the workspace root")
    if parts[0] in PROTECTED_TOP_DIRS:
        raise PathError(f"'{rel}' is in a protected folder")
    return resolved


def strip_fences(rel: str, text: str) -> str:
    """Safely strip outer Markdown code fences without catastrophic regex backtracking."""
    if rel.lower().endswith(".md"):
        return text
    stripped = text.strip()
    if not stripped.startswith("```"):
        return text
    lines = stripped.splitlines()
    if len(lines) >= 2 and lines[0].startswith("```") and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1])
    return text


def match_text_style(new: str, old: Optional[str]) -> str:
    """Make generated text follow the original file's BOM, line endings and final newline."""
    new = new.replace("\r\n", "\n").replace("\r", "\n")
    if old is None:
        return new if (not new or new.endswith("\n")) else new + "\n"
    bom = old.startswith("\ufeff")
    if bom and not new.startswith("\ufeff"):
        new = "\ufeff" + new
    elif not bom and new.startswith("\ufeff"):
        new = new[1:]
    old_norm = old.replace("\r\n", "\n").replace("\r", "\n")
    if old_norm.endswith("\n") and not new.endswith("\n"):
        new += "\n"
    elif not old_norm.endswith("\n") and new.endswith("\n"):
        new = new.rstrip("\n")
    crlf = old.count("\r\n")
    lf = old.count("\n") - crlf
    if crlf > lf:
        new = new.replace("\n", "\r\n")
    return new


def make_diff(rel: str, old: Optional[str], new: Optional[str]) -> str:
    old_lines = [] if old is None else old.splitlines()
    new_lines = [] if new is None else new.splitlines()
    diff = "\n".join(difflib.unified_diff(
        old_lines, new_lines,
        fromfile="/dev/null" if old is None else f"a/{rel}",
        tofile="/dev/null" if new is None else f"b/{rel}",
        lineterm="", n=3))
    return diff + "\n" if diff else ""


def count_diff(diff: str) -> Tuple[int, int]:
    added = sum(1 for ln in diff.splitlines() if ln.startswith("+") and not ln.startswith("+++"))
    removed = sum(1 for ln in diff.splitlines() if ln.startswith("-") and not ln.startswith("---"))
    return added, removed


_ELISION_RE = re.compile(
    r"(?im)^\s*(#|//|/\*)\s*\.{3}\s*(rest|existing|remaining|unchanged|same|other)\b")


def check_syntax(rel: str, text: str) -> Tuple[bool, str]:
    """Syntax guard. Python: ast.parse + py_compile. JSON: json.loads. Others: unchecked."""
    _stream_output("verifying syntax", rel)
    suffix = Path(rel).suffix.lower()
    if suffix in (".py", ".pyi"):
        # Guard against non-breaking spaces (U+00A0) pasted from web browsers
        if "\u00a0" in text:
            return False, "SyntaxError: contains non-breaking space (U+00A0); replace with standard spaces"
        try:
            ast.parse(text, filename=rel)
        except SyntaxError as exc:
            return False, f"SyntaxError line {exc.lineno}, col {exc.offset}: {exc.msg}"
        except (ValueError, RecursionError, MemoryError) as exc:
            return False, f"cannot parse: {exc}"
        with tempfile.TemporaryDirectory(prefix="flame-compile-") as tmp:
            src = Path(tmp) / "check.py"
            with open(src, "w", encoding="utf-8", newline="") as handle:
                handle.write(text)
            try:
                py_compile.compile(str(src), cfile=str(Path(tmp) / "check.pyc"), doraise=True)
            except py_compile.PyCompileError as exc:
                return False, f"py_compile failed: {str(exc).strip().splitlines()[-1]}"
        _stream_output("verified AST", rel)
        return True, "python ok"
    if suffix == ".json":
        try:
            json.loads(text)
        except ValueError as exc:
            return False, f"invalid JSON: {exc}"
        _stream_output("verified AST", rel)
        return True, "json ok"
    return True, "unchecked"


def scan_workspace(root: Path, cfg: "EngineConfig") -> Tuple[Dict[str, Tuple[int, int]], bool]:
    """Cheap stat-only scan: {relpath: (size, mtime_ns)}. Bounded by file count and size."""
    found: Dict[str, Tuple[int, int]] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in TEXT_EXTENSIONS:
                continue
            full = os.path.join(dirpath, name)
            try:
                if os.path.islink(full):
                    continue
                info = os.stat(full)
            except OSError:
                continue
            if not stat_mod.S_ISREG(info.st_mode) or info.st_size > cfg.max_file_kb * 1024:
                continue
            if len(found) >= cfg.snapshot_max_files:
                return found, True
            found[os.path.relpath(full, root).replace(os.sep, "/")] = (info.st_size, info.st_mtime_ns)
    return found, False


def detect_workspace(explicit: Optional[str] = None) -> Path:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not path.is_dir():
            raise EngineError(f"Workspace folder not found: {explicit}")
        return path
    env = os.environ.get("FLAME_WORKSPACE")
    if env and Path(env).is_dir():
        return Path(env).resolve()
    current = Path.cwd().resolve()
    home = Path.home().resolve()
    chain = [current] + list(current.parents)
    for marker in (STATE_DIR, ".git"):
        for cand in chain:
            if cand != home and (cand / marker).exists():
                return cand
    for cand in chain:  # ~/.vscode exists on most PCs, so the home folder is never auto-picked
        if cand != home and (cand / ".vscode").is_dir():
            return cand
    return current


def extract_mentioned_files(text: str, known_files: List[str], limit: int = 5) -> List[str]:
    """Auto-detect workspace files mentioned by path or basename in user/task text."""
    if not text or not known_files:
        return []
    lowered = text.lower()
    exact_matches: List[str] = []
    basename_matches: List[str] = []
    for rel in known_files:
        rel_low = rel.lower()
        name_low = Path(rel).name.lower()
        if rel_low in lowered:
            exact_matches.append(rel)
        elif re.search(r"(?<![A-Za-z0-9_.\-/])" + re.escape(name_low) + r"(?![A-Za-z0-9_.\-])", lowered):
            basename_matches.append(rel)
    combined: List[str] = []
    for item in exact_matches + basename_matches:
        if item not in combined:
            combined.append(item)
        if len(combined) >= limit:
            break
    return combined


def _low_priority_kwargs(low_priority: bool) -> Dict[str, Any]:
    """Return subprocess.run kwargs to lower CPU priority on i5 U-series during background runs."""
    if not low_priority:
        return {}
    if os.name == "nt":
        below_normal = getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0x00004000)
        return {"creationflags": below_normal}
    if hasattr(os, "nice"):
        def _preexec() -> None:
            with contextlib.suppress(OSError):
                os.nice(10)
        return {"preexec_fn": _preexec}
    return {}


def _stream_output(label: str, text: str) -> None:
    """Print a live progress marker to stderr for real-time status surfacing."""
    print(f"::: {label}: {text}", file=sys.stderr, flush=True)


# --------------------------------------------------------------------------
# Configuration & .env loader
# --------------------------------------------------------------------------
@dataclass
class EngineConfig:
    gemini_model: str = DEFAULT_GEMINI_MODEL
    cloud_model: str = DEFAULT_GEMINI_MODEL
    local_model: str = "qwen2.5-coder:1.5b"
    gemini_api_keys: List[str] = field(default_factory=list)
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout_s: int = 120
    gemini_max_output_tokens: int = 8192
    gemini_temperature: float = 0.2
    gemini_key_cooldown_s: int = 300
    opencode_command: List[str] = field(default_factory=lambda: ["opencode", "run", "{prompt}"])
    opencode_timeout_s: int = 600
    gemma_model: str = ""
    ollama_url: str = "http://127.0.0.1:11434"
    local_keep_alive: str = "30s"
    gemma_keep_alive: str = "30s"  # lets Ollama unload the model quickly (8GB RAM friendly)
    vscode_command: str = "code"
    vscode_reuse_window: bool = True
    max_file_kb: int = 512
    snapshot_max_files: int = 3000
    snapshot_max_total_mb: int = 25
    context_max_chars: int = 60000
    max_repair_attempts: int = 2
    atomic_runs: bool = True
    fallback_backend: bool = True
    low_priority_background: bool = True
    test_command: List[str] = field(default_factory=list)  # e.g. ["python", "-m", "compileall", "-q", "."]
    test_timeout_s: int = 300
    rsi_auto_apply: bool = False
    rsi_max_per_hour: int = 3
    rsi_signature_cooldown_s: int = 3600
    lock_stale_s: int = 1800
    log_max_kb: int = 2048
    keep_runs: int = 30

    def normalize(self) -> None:
        if isinstance(self.opencode_command, str):
            self.opencode_command = shlex.split(self.opencode_command, posix=(os.name != "nt"))
        if isinstance(self.test_command, str):
            self.test_command = shlex.split(self.test_command, posix=(os.name != "nt"))
        if isinstance(self.gemini_api_keys, str):
            self.gemini_api_keys = [k.strip() for k in self.gemini_api_keys.split(",") if k.strip()]
        self.gemini_api_keys = [str(k).strip() for k in self.gemini_api_keys if str(k).strip()]
        self.opencode_command = [str(p) for p in self.opencode_command]
        self.test_command = [str(p) for p in self.test_command]
        if isinstance(self.gemini_model, str):
            self.gemini_model = self.gemini_model.strip() or DEFAULT_GEMINI_MODEL


def _parse_dotenv(root: Path) -> Dict[str, str]:
    """Read key=value pairs from .env and .flame/.env without external packages."""
    found: Dict[str, str] = {}
    for candidate in (root / ".env", root / STATE_DIR / ".env"):
        if not candidate.is_file():
            continue
        try:
            lines = candidate.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export "):].strip()
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if len(val) >= 2 and ((val[0] == val[-1] == '"') or (val[0] == val[-1] == "'")):
                val = val[1:-1]
            if key:
                found[key] = val
    return found


def load_config(root: Path) -> Tuple[EngineConfig, List[str]]:
    cfg = EngineConfig()
    notes: List[str] = []
    path = root / STATE_DIR / "coder_config.json"
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise EngineError(f"{path} is not valid JSON: {exc}")
        known = {f.name for f in fields(EngineConfig)}
        for key, value in raw.items():
            if key in known:
                setattr(cfg, key, value)
            else:
                notes.append(f"unknown config key ignored: {key}")
        # Backwards compatibility: map gemma_model to local_model if local_model not set
        if "gemma_model" in raw and "local_model" not in raw:
            cfg.local_model = str(raw["gemma_model"]).strip()
        if "gemma_keep_alive" in raw and "local_keep_alive" not in raw:
            cfg.local_keep_alive = str(raw["gemma_keep_alive"]).strip()
    dotenv = _parse_dotenv(root)
    merged_env = {**dotenv, **os.environ}
    keys = merged_env.get("GEMINI_API_KEYS") or merged_env.get("GEMINI_API_KEY")
    if keys:
        cfg.gemini_api_keys = [k.strip() for k in keys.split(",") if k.strip()]
    if merged_env.get("FLAME_GEMINI_MODEL"):
        cfg.gemini_model = merged_env["FLAME_GEMINI_MODEL"].strip()
    if merged_env.get("FLAME_CLOUD_MODEL"):
        cfg.cloud_model = merged_env["FLAME_CLOUD_MODEL"].strip()
        cfg.gemini_model = cfg.cloud_model
    if merged_env.get("FLAME_LOCAL_MODEL"):
        cfg.local_model = merged_env["FLAME_LOCAL_MODEL"].strip()
        cfg.gemma_model = cfg.local_model
    elif merged_env.get("FLAME_GEMMA_MODEL"):
        cfg.local_model = merged_env["FLAME_GEMMA_MODEL"].strip()
        cfg.gemma_model = cfg.local_model
    if cfg.cloud_model and not cfg.gemini_model:
        cfg.gemini_model = cfg.cloud_model
    elif cfg.gemini_model and not cfg.cloud_model:
        cfg.cloud_model = cfg.gemini_model
    if cfg.local_model and not cfg.gemma_model:
        cfg.gemma_model = cfg.local_model
    elif cfg.gemma_model and not cfg.local_model:
        cfg.local_model = cfg.gemma_model
    if merged_env.get("FLAME_GEMINI_BASE_URL"):
        cfg.gemini_base_url = merged_env["FLAME_GEMINI_BASE_URL"].strip()
    if merged_env.get("FLAME_GEMMA_MODEL"):
        cfg.gemma_model = merged_env["FLAME_GEMMA_MODEL"].strip()
    if merged_env.get("FLAME_OLLAMA_URL"):
        cfg.ollama_url = merged_env["FLAME_OLLAMA_URL"].strip()
    if merged_env.get("FLAME_OPENCODE_COMMAND"):
        text = merged_env["FLAME_OPENCODE_COMMAND"].strip()
        cfg.opencode_command = (
            json.loads(text) if text.startswith("[") else shlex.split(text, posix=(os.name != "nt"))
        )
    cfg.normalize()
    return cfg, notes


# --------------------------------------------------------------------------
# JSON logging
# --------------------------------------------------------------------------
class JsonLogger:
    """JSON-lines log with secret redaction, long-string clipping and size rotation."""

    def __init__(self, path: Path, max_kb: int, secrets_fn: Callable[[], List[str]]):
        self.path = path
        self.max_bytes = max_kb * 1024
        self._secrets_fn = secrets_fn

    @staticmethod
    def _clip(value: Any, limit: int = 20000) -> Any:
        if isinstance(value, str):
            return value if len(value) <= limit else value[:limit] + f"...[clipped {len(value) - limit} chars]"
        if isinstance(value, dict):
            return {k: JsonLogger._clip(v, limit) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [JsonLogger._clip(v, limit) for v in value]
        return value

    def log(self, event: str, level: str = "info", run_id: Optional[str] = None, **data: Any) -> None:
        record = {
            "ts": utc_now(), "level": level, "event": event, "run_id": run_id,
            "data": self._clip(redact(data, self._secrets_fn())),
        }
        try:
            line = json.dumps(record, ensure_ascii=False, default=str)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            if self.path.exists() and self.path.stat().st_size > self.max_bytes:
                os.replace(str(self.path), str(self.path) + ".1")
            with open(self.path, "a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        except OSError as exc:
            print(f"[coder_engine] could not write log: {exc}", file=sys.stderr)


# --------------------------------------------------------------------------
# Backends
# --------------------------------------------------------------------------
GEMINI_SYSTEM_PROMPT = (
    "You are the Coder Engine inside FlameAGI. Respond with ONE JSON object and nothing else:\n"
    '{"summary": "<one or two sentences>", "files": [{"path": "<relative/path.ext>", "content": "<COMPLETE new file content>"}]}\n'
    "Rules:\n"
    "- Return the COMPLETE content of every file you change or create. Never return diffs, snippets, "
    "ellipses, or placeholders such as '# ... rest of file'.\n"
    "- You may modify only files provided in <file> blocks. You may also create new files. "
    "Never touch .git/ or .flame/.\n"
    "- Use workspace-relative paths with forward slashes.\n"
    "- Python files must be syntactically valid. Keep existing behaviour and style unless the task says otherwise.\n"
    "- Never put secrets or API keys in files.\n"
    '- If nothing needs to change, return {"summary": "<why>", "files": []}.'
)


def parse_model_json(raw: str) -> Dict[str, Any]:
    text = raw.strip()
    text = re.sub(r"(?s)<think>.*?</think>", "", text).strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if m:
            text = m.group(1).strip()
        else:
            text = re.sub(r"^```[A-Za-z0-9]*\s*", "", text)
            text = re.sub(r"\s*```$", "", text).strip()
    try:
        obj = json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("the response was not valid JSON")
        try:
            obj = json.loads(text[start:end + 1])
        except ValueError as exc:
            raise ValueError(f"the response was not valid JSON ({exc})")
    if not isinstance(obj, dict):
        raise ValueError("the response JSON must be an object")
    return obj


class GeminiClient:
    def __init__(self, cfg: EngineConfig, logger: JsonLogger):
        self.cfg = cfg
        self.logger = logger
        self._cooldowns: Dict[str, float] = {}

    def why_unavailable(self) -> Optional[str]:
        if not self.cfg.gemini_model.strip():
            return "no Gemini model configured (run `python coder_engine.py init --model <model-name>` or set FLAME_GEMINI_MODEL)"
        if not self.cfg.gemini_api_keys:
            return "no Gemini API key configured (run `python coder_engine.py init --key YOUR_KEY` or set GEMINI_API_KEY)"
        return None

    def available(self) -> bool:
        return self.why_unavailable() is None

    def generate(self, system: str, messages: List[Dict[str, Any]], run_id: Optional[str] = None) -> str:
        problem = self.why_unavailable()
        if problem:
            raise BackendError(f"Gemini unavailable: {problem}")
        model = self.cfg.gemini_model.strip()
        if model.startswith("models/"):
            model = model[len("models/"):]
        url = f"{self.cfg.gemini_base_url.rstrip('/')}/models/{urllib.parse.quote(model, safe='.-_')}:generateContent"
        body = json.dumps({
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": messages,
            "generationConfig": {
                "temperature": self.cfg.gemini_temperature,
                "maxOutputTokens": self.cfg.gemini_max_output_tokens,
                "responseMimeType": "application/json",
            },
        }).encode("utf-8")
        now = time.time()
        usable = [k for k in self.cfg.gemini_api_keys if self._cooldowns.get(k, 0) <= now]
        if not usable:
            raise BackendError(
                "All Gemini API keys are cooling down after quota/auth errors. Wait a few minutes or add another key."
            )
        last_error = "unknown error"
        for index, key in enumerate(usable, start=1):
            for attempt in range(2):
                request = urllib.request.Request(
                    url, data=body, method="POST",
                    headers={"Content-Type": "application/json", "x-goog-api-key": key})
                try:
                    with urllib.request.urlopen(request, timeout=self.cfg.gemini_timeout_s) as response:
                        payload = json.loads(response.read().decode("utf-8"))
                    return self._extract_text(payload)
                except urllib.error.HTTPError as exc:
                    detail = ""
                    with contextlib.suppress(Exception):
                        detail = exc.read().decode("utf-8", "replace")[:400]
                    if exc.code in (401, 403, 429):
                        self._cooldowns[key] = time.time() + self.cfg.gemini_key_cooldown_s
                        last_error = f"HTTP {exc.code} on key #{index}"
                        self.logger.log("gemini_key_cooldown", "warning", run_id, key_index=index, http=exc.code)
                        break
                    if exc.code >= 500:
                        last_error = f"HTTP {exc.code}"
                        if attempt == 0:
                            time.sleep(1.5)
                            continue
                        break
                    raise BackendError(f"Gemini rejected the request (HTTP {exc.code}) for model '{model}': {detail}")
                except (OSError, ValueError) as exc:
                    last_error = f"network/response error: {exc}"
                    if attempt == 0:
                        time.sleep(1.5)
                        continue
                    break
        raise BackendError(f"Gemini unavailable: {last_error}")

    @staticmethod
    def _extract_text(payload: Dict[str, Any]) -> str:
        candidates = payload.get("candidates") or []
        if not candidates:
            reason = (payload.get("promptFeedback") or {}).get("blockReason", "no candidates returned")
            raise BackendError(f"Gemini returned no answer ({reason}).")
        candidate = candidates[0]
        if candidate.get("finishReason") == "MAX_TOKENS":
            raise BackendError(
                "Gemini's answer was cut off (MAX_TOKENS). Raise gemini_max_output_tokens or pass fewer/smaller files."
            )
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
        if not text.strip():
            raise BackendError("Gemini returned an empty answer.")
        return text


class OpenCodeRunner:
    def __init__(self, cfg: EngineConfig, logger: JsonLogger):
        self.cfg = cfg
        self.logger = logger

    def resolve(self) -> Optional[str]:
        if not self.cfg.opencode_command:
            return None
        exe = self.cfg.opencode_command[0]
        if os.path.isabs(exe) and os.path.exists(exe):
            return exe
        return shutil.which(exe)

    def why_unavailable(self) -> Optional[str]:
        template = " ".join(self.cfg.opencode_command)
        if not any(p in template for p in ("{prompt}", "{task}", "{task_file}")):
            return "opencode_command has no {prompt}/{task}/{task_file} placeholder, so the task could not reach OpenCode"
        if self.resolve() is None:
            return f"'{self.cfg.opencode_command[0] if self.cfg.opencode_command else 'opencode'}' was not found on PATH"
        return None

    def available(self) -> bool:
        return self.why_unavailable() is None

    def build_argv(self, task: str, prompt: str, task_file_rel: str, root: Path) -> List[str]:
        exe = self.resolve()
        if exe is None:
            raise BackendError("OpenCode is not installed or not on PATH.")
        # Flatten newlines so single-argument CLI calls on Windows never break
        safe_prompt = prompt.replace("\r\n", " ").replace("\n", " ").strip()
        safe_task = task.replace("\r\n", " ").replace("\n", " ").strip()
        mapping = {
            "{prompt}": safe_prompt,
            "{task}": safe_task,
            "{task_file}": task_file_rel,
            "{workspace}": str(root),
        }
        argv = [exe]
        for part in self.cfg.opencode_command[1:]:
            for key, value in mapping.items():
                part = part.replace(key, value)
            argv.append(part)
        return argv

    def run(self, argv: List[str], cwd: Path, run_id: str, low_priority: bool = False) -> Tuple[int, str]:
        extra_kwargs = _low_priority_kwargs(low_priority)
        _stream_output("running command", " ".join(argv[:2]) + " ...")
        env = os.environ.copy()
        env["CI"] = "true"  # Prevents interactive TUI permission hangs in OpenCode CLI
        try:
            proc = subprocess.Popen(
                argv,
                cwd=str(cwd),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                **extra_kwargs,
            )
            lines: List[str] = []
            assert proc.stdout is not None
            for line in proc.stdout:
                lines.append(line)
                stripped = line.rstrip()
                if stripped:
                    _stream_output("opencode", stripped)
            proc.wait(timeout=self.cfg.opencode_timeout_s)
            return proc.returncode, "".join(lines)
        except FileNotFoundError:
            raise BackendError("OpenCode could not be started (file not found).")
        except subprocess.TimeoutExpired:
            proc.kill()
            raise BackendError(f"OpenCode timed out after {self.cfg.opencode_timeout_s}s.")


class VSCodeBridge:
    def __init__(self, cfg: EngineConfig, logger: JsonLogger):
        self.cfg = cfg
        self.logger = logger

    def resolve(self) -> Optional[str]:
        return shutil.which(self.cfg.vscode_command)

    def _spawn(self, args: List[str]) -> Dict[str, Any]:
        exe = self.resolve()
        if exe is None:
            return {"ok": False, "message": "VS Code's 'code' command was not found on PATH "
                    "(VS Code > Command Palette > 'Shell Command: Install code command in PATH')."}
        if os.name == "nt" and exe.lower().endswith((".cmd", ".bat")):
            if any(c in CMD_UNSAFE_CHARS for a in args for c in a):
                return {"ok": False, "message": "A path contains characters that are unsafe to pass to code.cmd."}
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        try:
            subprocess.Popen([exe] + args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, creationflags=flags)
        except OSError as exc:
            return {"ok": False, "message": f"Could not start VS Code: {exc}"}
        return {"ok": True, "message": "opened in VS Code"}

    def open_diff(self, left: Path, right: Path) -> Dict[str, Any]:
        # `code --diff A B` compares two FILES: A (original) vs B (changed version).
        args = (["--reuse-window"] if self.cfg.vscode_reuse_window else []) + ["--diff", str(left), str(right)]
        return self._spawn(args)

    def open_folder(self, root: Path) -> Dict[str, Any]:
        return self._spawn(["--reuse-window", str(root)] if self.cfg.vscode_reuse_window else [str(root)])


# --------------------------------------------------------------------------
# Locking
# --------------------------------------------------------------------------
class _EngineLock:
    """Cross-process lock file (O_EXCL). Age-based stale detection, safe on Windows."""

    def __init__(self, path: Path, stale_s: int):
        self.path = path
        self.stale_s = stale_s
        self.held = False

    def __enter__(self) -> "_EngineLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(2):
            try:
                fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, json.dumps({"pid": os.getpid(), "ts": time.time()}).encode("utf-8"))
                os.close(fd)
                self.held = True
                return self
            except FileExistsError:
                try:
                    age = time.time() - self.path.stat().st_mtime
                except OSError:
                    continue
                if age > self.stale_s:
                    with contextlib.suppress(OSError):
                        self.path.unlink()
                    continue
                raise EngineError("Another Coder Engine run is already in progress in this workspace.")
        raise EngineError("Could not acquire the Coder Engine lock.")

    def __exit__(self, *exc: Any) -> None:
        if self.held:
            with contextlib.suppress(OSError):
                self.path.unlink()
            self.held = False


# --------------------------------------------------------------------------
# The engine
# --------------------------------------------------------------------------

def parse_chat_command(raw_input: str, default_backend: str = "auto", default_model: str = "") -> Dict[str, Any]:
    """Parse chat commands like `Edit: <text> Use: <model>` or natural language."""
    text = raw_input.strip()
    if not text:
        return {"action": "empty"}
    lower = text.lower()
    if lower in ("exit", "quit", "q", ":q"):
        return {"action": "exit"}
    if lower in ("help", "?", "commands"):
        return {"action": "help"}
    if lower in ("doctor", "status", "health"):
        return {"action": "doctor"}
    if lower in ("modified", "git"):
        return {"action": "modified"}
    if lower in ("list", "runs", "history"):
        return {"action": "list"}
    if lower in ("clean", "mark-clean"):
        return {"action": "clean"}
    if lower.startswith("pack"):
        parts = text.split(maxsplit=1)
        name = parts[1] if len(parts) > 1 else "flame_project_code.txt"
        return {"action": "pack", "filename": name}
    if lower.startswith("diff"):
        parts = text.split()
        return {"action": "diff", "run_id": parts[1] if len(parts) > 1 else None}
    if lower.startswith("approve"):
        parts = text.split()
        return {"action": "approve", "run_id": parts[1] if len(parts) > 1 else None}
    if lower.startswith("reject"):
        parts = text.split()
        return {"action": "reject", "run_id": parts[1] if len(parts) > 1 else None}
    if lower.startswith("rollback") or lower in ("undo", "revert"):
        parts = text.split()
        return {"action": "rollback", "run_id": parts[1] if len(parts) > 1 else None}

    # Use: <model> alone (switches default model/backend)
    m_use_only = re.match(r"^use:\s*([^\s]+)$", text, re.I)
    if m_use_only:
        return {"action": "switch_model", "target": m_use_only.group(1).strip()}

    backend = default_backend
    model = default_model
    task_text = text

    # Extract Use: <model> from anywhere in the prompt
    m_use = re.search(r"\buse:\s*([a-zA-Z0-9_\-.:]+)\b", task_text, re.I)
    if m_use:
        target_model = m_use.group(1).strip()
        t_low = target_model.lower()
        if t_low in ("gemini", "opencode"):
            backend = t_low
        elif "gemma" in t_low:
            backend = "gemma"
        else:
            backend = "gemini"
            model = target_model
        task_text = (task_text[:m_use.start()] + task_text[m_use.end():]).strip()

    # Strip Edit: prefix if present
    if re.match(r"^edit:\s*", task_text, re.I):
        task_text = re.sub(r"^edit:\s*", "", task_text, flags=re.I).strip()

    # Detect if user asks to review / stage
    review_mode = False
    if re.search(r"\b(review|stage|preview|draft)\b", task_text, re.I):
        review_mode = True

    return {
        "action": "run",
        "task": task_text,
        "backend": backend,
        "model": model,
        "review": review_mode,
    }


class CoderEngine:
    def __init__(self, workspace: Optional[str] = None, config: Optional[EngineConfig] = None):
        self.root = detect_workspace(workspace)
        home = Path.home().resolve()
        if self.root == home or self.root.parent == self.root:
            raise EngineError("Refusing to use your home folder or a drive root as the workspace. "
                              "Open a project folder in VS Code (or pass --workspace).")
        self.state = self.root / STATE_DIR
        for sub in ("runs", "logs", "state", "tasks"):
            (self.state / sub).mkdir(parents=True, exist_ok=True)
        gitignore = self.state / ".gitignore"
        # Allow tasks/ to be read by external CLI agents like OpenCode whose file tools respect .gitignore
        gitignore_content = "*\n!tasks/\n!tasks/**\n"
        if not gitignore.exists() or gitignore.read_text(encoding="utf-8", errors="replace") != gitignore_content:
            gitignore.write_text(gitignore_content, encoding="utf-8")
        loaded, notes = load_config(self.root)
        self.cfg = config or loaded
        self.cfg.normalize()
        self.logger = JsonLogger(self.state / "logs" / "coder_engine.jsonl", self.cfg.log_max_kb,
                                 lambda: list(self.cfg.gemini_api_keys))
        for note in notes:
            self.logger.log("config_note", "warning", None, note=note)
        self.gemini = GeminiClient(self.cfg, self.logger)
        self.opencode = OpenCodeRunner(self.cfg, self.logger)
        self.vscode = VSCodeBridge(self.cfg, self.logger)
        self._hooks: Dict[str, List[Callable[[Dict[str, Any]], None]]] = {}
        self.logger.log("engine_ready", workspace=str(self.root), version=ENGINE_VERSION)

    # ---- setup / init helper for non-coders ------------------------------
    def init_config(self, api_key: Optional[str] = None, model: Optional[str] = None,
                    opencode_cmd: Optional[str] = None) -> Dict[str, Any]:
        """Save configuration and optional API key into .flame/ so the user never fights env vars."""
        cfg_path = self.state / "coder_config.json"
        existing: Dict[str, Any] = {}
        if cfg_path.exists():
            with contextlib.suppress(OSError, ValueError):
                existing = json.loads(cfg_path.read_text(encoding="utf-8"))
        if model:
            clean_m = model.strip()
            existing["gemini_model"] = clean_m
            self.cfg.gemini_model = clean_m
            if any(k in clean_m.lower() for k in (":", "qwen", "gemma", "llama", "deepseek")):
                existing["local_model"] = clean_m
                self.cfg.local_model = clean_m
                self.cfg.gemma_model = clean_m
            else:
                existing["cloud_model"] = clean_m
                self.cfg.cloud_model = clean_m
        elif "gemini_model" not in existing:
            existing["gemini_model"] = self.cfg.gemini_model
        if opencode_cmd:
            existing["opencode_command"] = shlex.split(opencode_cmd, posix=(os.name != "nt"))
            self.cfg.opencode_command = existing["opencode_command"]
        elif "opencode_command" not in existing:
            existing["opencode_command"] = self.cfg.opencode_command
        atomic_write_bytes(cfg_path, json.dumps(existing, indent=2, ensure_ascii=False).encode("utf-8"))

        env_path = self.state / ".env"
        if api_key:
            keys = [k.strip() for k in api_key.split(",") if k.strip()]
            self.cfg.gemini_api_keys = keys
            atomic_write_bytes(env_path, f"GEMINI_API_KEY={','.join(keys)}\n".encode("utf-8"))
        self.logger.log("config_initialized", model=self.cfg.gemini_model, has_key=bool(self.cfg.gemini_api_keys))
        return {
            "config_file": str(cfg_path),
            "env_file": str(env_path) if env_path.exists() else None,
            "gemini_model": self.cfg.gemini_model,
            "keys_configured": len(self.cfg.gemini_api_keys),
            "opencode_command": self.cfg.opencode_command,
        }

    # ---- hooks -----------------------------------------------------------
    def on(self, event: str, fn: Callable[[Dict[str, Any]], None]) -> None:
        if event not in EVENTS:
            raise ValueError(f"Unknown event '{event}'. Valid events: {', '.join(EVENTS)}")
        self._hooks.setdefault(event, []).append(fn)

    def off(self, event: str, fn: Callable[[Dict[str, Any]], None]) -> None:
        if fn in self._hooks.get(event, []):
            self._hooks[event].remove(fn)

    def _emit(self, event: str, **payload: Any) -> None:
        for fn in list(self._hooks.get(event, [])):
            try:
                fn(dict(payload, event=event))
            except Exception as exc:  # a broken hook must never break the engine
                self.logger.log("hook_error", "warning", payload.get("run_id"), hook_event=event, error=repr(exc))

    # ---- path helpers ----------------------------------------------------
    def _abs(self, rel: str) -> Path:
        return self.root / rel

    def _run_dir(self, run_id: str) -> Path:
        return self.state / "runs" / run_id

    def _clean(self, text: Any) -> str:
        return redact(str(text), list(self.cfg.gemini_api_keys))

    def _lock(self) -> _EngineLock:
        return _EngineLock(self.state / "engine.lock", self.cfg.lock_stale_s)

    # ---- run manifests ---------------------------------------------------
    def _new_run(self, task: str, backend: str, apply: bool, source: str, files: List[str]) -> Dict[str, Any]:
        run_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
        (self._run_dir(run_id) / "files").mkdir(parents=True, exist_ok=True)
        return {
            "id": run_id, "version": ENGINE_VERSION, "task": task[:2000], "source": source,
            "requested_backend": backend, "backend": None, "apply_requested": apply,
            "status": "running", "started": utc_now(), "finished": None, "summary": "",
            "files_requested": files, "changes": [], "warnings": [], "unprotected": [],
            "error": None, "test": None,
        }

    def _save_manifest(self, run: Dict[str, Any]) -> None:
        atomic_write_bytes(self._run_dir(run["id"]) / "manifest.json",
                           json.dumps(run, indent=2, ensure_ascii=False).encode("utf-8"))

    def _load_manifest(self, run_id: str) -> Dict[str, Any]:
        path = self._run_dir(run_id) / "manifest.json"
        if not path.exists():
            raise EngineError(f"Run '{run_id}' was not found.")
        return json.loads(path.read_text(encoding="utf-8"))

    def list_runs(self, limit: int = 20) -> List[Dict[str, Any]]:
        out = []
        for entry in sorted((self.state / "runs").iterdir(), reverse=True):
            manifest = entry / "manifest.json"
            if not manifest.exists():
                continue
            try:
                data = json.loads(manifest.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            out.append({"run_id": data["id"], "status": data["status"], "backend": data.get("backend"),
                        "task": data["task"][:80], "files": [c["path"] for c in data.get("changes", [])],
                        "started": data["started"]})
            if len(out) >= limit:
                break
        return out

    def _prune_runs(self) -> None:
        runs = sorted(p for p in (self.state / "runs").iterdir() if p.is_dir())
        removable = []
        for entry in runs:
            try:
                status = json.loads((entry / "manifest.json").read_text(encoding="utf-8")).get("status")
            except (OSError, ValueError):
                status = "unknown"
            if status != "staged":  # staged proposals wait for a decision; never auto-delete them
                removable.append(entry)
        for entry in removable[:max(0, len(removable) - self.cfg.keep_runs)]:
            shutil.rmtree(entry, ignore_errors=True)

    def _finish(self, run: Dict[str, Any]) -> None:
        run["finished"] = utc_now()
        diffs = []
        for change in run["changes"]:
            diffs.append(change.pop("_diff", ""))
        (self._run_dir(run["id"]) / "changes.diff").write_text("".join(diffs), encoding="utf-8")
        self._save_manifest(run)
        if run["status"] == "applied":
            self._update_baseline(run)
        self._prune_runs()
        gc.collect()

    # ---- backend routing -------------------------------------------------
    def _backend_available(self, name: str) -> bool:
        return self.gemini.available() if name == "gemini" else self.opencode.available()

    def choose_backend(self, task: str, files: List[str], requested: str) -> str:
        if requested == "gemini":
            problem = self.gemini.why_unavailable()
            if problem:
                raise BackendError(f"Gemini unavailable: {problem}")
            return "gemini"
        if requested == "opencode":
            problem = self.opencode.why_unavailable()
            if problem:
                raise BackendError(f"OpenCode unavailable: {problem}")
            return "opencode"
        gem_ok, oc_ok = self.gemini.available(), self.opencode.available()
        if not gem_ok and not oc_ok:
            raise BackendError(f"No backend available. Gemini: {self.gemini.why_unavailable()}. "
                               f"OpenCode: {self.opencode.why_unavailable()}.")
        generative = re.search(
            r"\b(create|generate|scaffold|write a new|new file|refactor|rewrite|implement|build)\b",
            task, re.I
        ) is not None
        if gem_ok and (generative or len(files) > 3 or not oc_ok):
            return "gemini"
        return "opencode" if oc_ok else "gemini"

    # ---- public: run a task ----------------------------------------------
    def run_task(self, task: str, files: Optional[List[str]] = None, backend: str = "auto",
                 apply: bool = True, open_diff: bool = False, source: str = "user",
                 context: str = "") -> Dict[str, Any]:
        task = (task or "").strip()
        backend = (backend or "auto").lower()
        files = list(files or [])
        if not task:
            return {"status": "failed", "error": "The task is empty."}
        if backend not in ("auto", "gemini", "opencode"):
            return {"status": "failed", "error": "backend must be auto, gemini or opencode."}
        run: Optional[Dict[str, Any]] = None
        try:
            with self._lock():
                # Auto-detect file names mentioned in task if not explicitly passed in --files
                known_tree = self._tree_listing(limit=250)
                for inferred in extract_mentioned_files(task, known_tree):
                    if inferred not in files:
                        files.append(inferred)
                run = self._new_run(task, backend, apply, source, files)
                self.logger.log("run_started", run_id=run["id"], task=task, backend=backend,
                                apply=apply, source=source, files=files)
                self._emit("run_started", run_id=run["id"], task=task, source=source)
                self._execute(run, task, files, backend, apply, context)
        except GuardRejected as exc:
            self._mark_failed(run, exc, "guard_rejected")
        except EngineError as exc:
            if run is None:
                return {"status": "failed", "error": self._clean(exc)}
            self._mark_failed(run, exc, "run_failed")
        except Exception as exc:  # unexpected: keep the traceback in the log, plain text for the user
            if run is None:
                return {"status": "failed", "error": self._clean(exc)}
            self.logger.log("unexpected_error", "error", run["id"], traceback=traceback.format_exc())
            self._mark_failed(run, exc, "run_failed")
        finally:
            if run is not None:
                self._finish(run)
        result = self._summarize(run) if run else {"status": "failed", "error": "no run"}
        self._emit("run_finished", run_id=result.get("run_id"), result=result)
        if open_diff and result.get("status") in ("applied", "staged"):
            self.open_diff(result["run_id"])
        gc.collect()
        return result

    def _mark_failed(self, run: Optional[Dict[str, Any]], exc: Exception, event: str) -> None:
        if run is None:
            return
        run["status"] = "failed"
        run["error"] = self._clean(exc)
        self.logger.log(event, "error", run["id"], error=run["error"])
        self._emit("guard_rejected" if event == "guard_rejected" else "run_failed",
                   run_id=run["id"], error=run["error"])

    def _execute(self, run: Dict[str, Any], task: str, files: List[str], requested: str,
                 apply: bool, context: str) -> None:
        chosen = self.choose_backend(task, files, requested)
        order = [chosen]
        if requested == "auto" and self.cfg.fallback_backend:
            other = "opencode" if chosen == "gemini" else "gemini"
            if self._backend_available(other):
                order.append(other)
        last_error: Optional[EngineError] = None
        for name in order:
            run["backend"] = name
            self.logger.log("backend_selected", run_id=run["id"], backend=name)
            self._emit("backend_selected", run_id=run["id"], backend=name)
            try:
                if name == "gemini":
                    self._run_gemini(run, task, files, apply, context)
                else:
                    self._run_opencode(run, task, files, apply, context)
                last_error = None
                break
            except BackendError as exc:
                last_error = exc
                run["warnings"].append(f"{name} failed: {self._clean(exc)}")
                self.logger.log("backend_failed", "warning", run["id"], backend=name, error=self._clean(exc))
                self._emit("backend_failed", run_id=run["id"], backend=name, error=self._clean(exc))
        if last_error is not None:
            raise last_error
        if run["status"] == "applied" and self.cfg.test_command:
            self._post_apply_tests(run)

    # ---- Gemini backend ----------------------------------------------------
    def _tree_listing(self, limit: int = 150) -> List[str]:
        stats, _ = scan_workspace(self.root, self.cfg)
        return sorted(stats)[:limit]

    def _run_gemini(self, run: Dict[str, Any], task: str, files: List[str], apply: bool, extra: str) -> None:
        context_files: Dict[str, str] = {}
        total = 0
        for name in files:
            target = resolve_in_workspace(self.root, name)
            if not target.exists():
                continue  # a path that does not exist yet is simply a file to create
            if target.stat().st_size > self.cfg.max_file_kb * 1024:
                raise EngineError(f"'{name}' is larger than {self.cfg.max_file_kb}KB. Gemini must rewrite whole files, "
                                  "so use the OpenCode backend for this one.")
            text = read_text_strict(target)
            total += len(text)
            if total > self.cfg.context_max_chars:
                raise EngineError(
                    f"The selected files exceed {self.cfg.context_max_chars} characters of context. Pass fewer files."
                )
            context_files[target.relative_to(self.root).as_posix()] = text
        parts = [f"<task>\n{task}\n</task>"]
        if extra:
            parts.append(f"<context>\n{extra}\n</context>")
        tree = self._tree_listing()
        if tree:
            parts.append("<workspace_files>\n" + "\n".join(tree) + "\n</workspace_files>")
        for rel, text in context_files.items():
            parts.append(f'<file path="{rel}">\n{text}\n</file>')
        messages: List[Dict[str, Any]] = [{"role": "user", "parts": [{"text": "\n\n".join(parts)}]}]

        planned: List[Dict[str, Any]] = []
        for attempt in range(self.cfg.max_repair_attempts + 1):
            _stream_output("running command", f"gemini generate (attempt {attempt + 1})")
            raw = self.gemini.generate(GEMINI_SYSTEM_PROMPT, messages, run["id"])
            self.logger.log("gemini_response", run_id=run["id"], attempt=attempt, chars=len(raw))
            errors: List[str] = []
            missing_context_rels: List[str] = []
            try:
                payload = parse_model_json(raw)
                run["summary"] = str(payload.get("summary", ""))[:500]
                planned, errors, missing_context_rels = self._validate_payload(run, payload, context_files)
            except ValueError as exc:
                errors = [str(exc)]
            if not errors:
                break
            self.logger.log("gemini_output_rejected", "warning", run["id"], attempt=attempt, errors=errors)
            if attempt >= self.cfg.max_repair_attempts:
                raise GuardRejected("Gemini's output failed the safety checks after "
                                    f"{attempt + 1} attempt(s): " + "; ".join(errors))
            # Dynamically load any existing files Gemini tried to touch without having seen first
            injected_blocks: List[str] = []
            for rel in missing_context_rels:
                target = self._abs(rel)
                if target.is_file() and target.stat().st_size <= self.cfg.max_file_kb * 1024:
                    with contextlib.suppress(EngineError, OSError):
                        file_text = read_text_strict(target)
                        if total + len(file_text) <= self.cfg.context_max_chars:
                            context_files[rel] = file_text
                            total += len(file_text)
                            injected_blocks.append(f'<file path="{rel}">\n{file_text}\n</file>')
            repair_prompt = (
                "Your previous answer was rejected by the safety checks:\n- " + "\n- ".join(errors)
            )
            if injected_blocks:
                repair_prompt += (
                    "\n\nHere are the current contents of the existing file(s) you referenced:\n"
                    + "\n\n".join(injected_blocks)
                )
            repair_prompt += "\n\nReturn the complete corrected JSON object again."
            messages.append({"role": "model", "parts": [{"text": raw}]})
            messages.append({"role": "user", "parts": [{"text": repair_prompt}]})
        if not planned:
            run["status"] = "noop"
            return
        items = []
        for plan in planned:
            diff = make_diff(plan["path"], plan["old_text"], plan["new_text"])
            added, removed = count_diff(diff)
            target = self._abs(plan["path"])
            change = {"path": plan["path"], "action": plan["action"],
                      "sha_before": sha256_file(target) if target.exists() else None, "sha_after": None,
                      "backup": None, "proposal": None, "added": added, "removed": removed,
                      "check": plan["check"], "_diff": diff}
            run["changes"].append(change)
            items.append((change, plan["new_text"].encode("utf-8")))
        _stream_output("verified AST", f"{len(items)} file(s) passed all guards")
        if apply:
            self._commit(run, items)
            run["status"] = "applied"
            self.logger.log("run_applied", run_id=run["id"], files=[c["path"] for c in run["changes"]])
            self._emit("run_applied", run_id=run["id"], files=[c["path"] for c in run["changes"]])
        else:
            self._stage_items(run, items)

    def _validate_payload(
        self, run: Dict[str, Any], payload: Dict[str, Any], context_files: Dict[str, str]
    ) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
        errors: List[str] = []
        missing_context: List[str] = []
        planned: List[Dict[str, Any]] = []
        items = payload.get("files")
        if not isinstance(items, list):
            return [], ['"files" must be a list of {"path","content"} objects'], []
        seen: Set[str] = set()
        for index, item in enumerate(items):
            if (not isinstance(item, dict)
                    or not isinstance(item.get("path"), str)
                    or not isinstance(item.get("content"), str)):
                errors.append(f"files[{index}] needs string 'path' and 'content'")
                continue
            try:
                target = resolve_in_workspace(self.root, item["path"])
            except PathError as exc:
                errors.append(str(exc))
                continue
            rel = target.relative_to(self.root).as_posix()
            if rel in seen:
                errors.append(f"{rel} appears more than once")
                continue
            seen.add(rel)
            if target.exists() and target.is_dir():
                errors.append(f"{rel} is a folder")
                continue
            if target.exists() and rel not in context_files:
                missing_context.append(rel)
                errors.append(f"{rel} exists in the workspace; inspect its current <file> content before modifying it")
                continue
            old_text = context_files.get(rel) if target.exists() else None
            new_text = match_text_style(strip_fences(rel, item["content"]), old_text)
            if len(new_text.encode("utf-8")) > self.cfg.max_file_kb * 1024 * 2:
                errors.append(f"{rel} is too large")
                continue
            if old_text is not None:
                if not new_text.strip() and old_text.strip():
                    errors.append(f"{rel}: refusing to blank out an existing file")
                    continue
                if len(old_text) > 500 and len(new_text) < len(old_text) * 0.2:
                    errors.append(f"{rel}: output is under 20% of the original size and looks truncated")
                    continue
                if new_text == old_text:
                    run["warnings"].append(f"{rel}: no change needed")
                    continue
            if _ELISION_RE.search(new_text) and not (old_text and _ELISION_RE.search(old_text)):
                errors.append(f"{rel}: contains an elision placeholder such as '# ... rest of file'")
                continue
            ok, message = check_syntax(rel, new_text)
            if not ok:
                errors.append(f"{rel}: {message}")
                continue
            planned.append({"path": rel, "action": "create" if old_text is None else "modify",
                            "old_text": old_text, "new_text": new_text, "check": message})
        return planned, errors, missing_context

    # ---- OpenCode backend -------------------------------------------------
    def _snapshot(self, run: Dict[str, Any], stats: Dict[str, Tuple[int, int]],
                  priority: Set[str]) -> Tuple[Dict[str, str], List[str]]:
        files_dir = self._run_dir(run["id"]) / "files"
        order = sorted(stats, key=lambda r: (0 if r in priority else 1, -stats[r][1]))
        budget = self.cfg.snapshot_max_total_mb * 1024 * 1024
        hashes: Dict[str, str] = {}
        unprotected: List[str] = []
        used = 0
        for rel in order:
            size = stats[rel][0]
            if used + size > budget:
                unprotected.append(rel)
                continue
            try:
                hashes[rel] = copy_with_hash(self._abs(rel), files_dir / (rel + ".bak"))
            except OSError:
                unprotected.append(rel)
                continue
            used += size
        return hashes, unprotected

    def _prune_unused_backups(self, run: Dict[str, Any], kept_rels: Set[str]) -> None:
        """Delete .bak copies of files that OpenCode did NOT touch to save SSD space."""
        files_dir = self._run_dir(run["id"]) / "files"
        if not files_dir.exists():
            return
        for bak in list(files_dir.rglob("*.bak")):
            try:
                rel_bak = bak.relative_to(files_dir).as_posix()
            except ValueError:
                continue
            orig_rel = rel_bak[:-4] if rel_bak.endswith(".bak") else rel_bak
            if orig_rel not in kept_rels:
                with contextlib.suppress(OSError):
                    bak.unlink()
                self._prune_empty_parents_in(bak, files_dir)

    @staticmethod
    def _prune_empty_parents_in(target: Path, stop_dir: Path) -> None:
        parent = target.parent
        while parent != stop_dir and parent.is_dir() and not any(parent.iterdir()):
            with contextlib.suppress(OSError):
                parent.rmdir()
            parent = parent.parent

    def _run_opencode(self, run: Dict[str, Any], task: str, files: List[str], apply: bool, extra: str) -> None:
        priority: Set[str] = set()
        for name in files:
            with contextlib.suppress(PathError):
                priority.add(resolve_in_workspace(self.root, name).relative_to(self.root).as_posix())
        before, truncated = scan_workspace(self.root, self.cfg)
        if truncated:
            run["warnings"].append(
                f"workspace has more than {self.cfg.snapshot_max_files} source files; extra files are not tracked"
            )
        hashes, unprotected = self._snapshot(run, before, priority)
        run["unprotected"] = unprotected
        if unprotected:
            run["warnings"].append(f"{len(unprotected)} file(s) exceeded the snapshot budget and cannot be rolled back")
        task_rel = f"{STATE_DIR}/tasks/{run['id']}.md"
        lines = ["# Task", task, ""]
        if files:
            lines += ["## Focus files", *[f"- {f}" for f in files], ""]
        if extra:
            lines += ["## Context", extra, ""]
        lines += ["## Rules", "- Only change files inside this project; never touch .git/ or .flame/.",
                  "- Keep every Python file syntactically valid.", "- Make the smallest change that completes the task."]
        (self.root / task_rel).write_text("\n".join(lines) + "\n", encoding="utf-8")

        # Pass the task and target files directly in {prompt} so OpenCode doesn't get blocked by .gitignore
        focus_str = f" Target files: {', '.join(files)}." if files else ""
        context_str = f" Context: {extra}" if extra else ""
        prompt = (
            f"Task: {task}.{focus_str}{context_str} "
            f"Edit the target files directly in this workspace to complete the task. "
            f"Do not modify .git/ or .flame/."
        )
        argv = self.opencode.build_argv(task, prompt, task_rel, self.root)
        self.logger.log("opencode_start", run_id=run["id"], argv=argv[:1] + ["..."])
        low_prio = self.cfg.low_priority_background and run.get("source") in ("rsi", "pet")
        try:
            code, output = self.opencode.run(argv, self.root, run["id"], low_priority=low_prio)
        except Exception:
            self._prune_unused_backups(run, set())
            raise
        self.logger.log("opencode_finished", run_id=run["id"], returncode=code, output_tail=output[-3000:])

        changes = self._detect_changes(before, hashes)
        changed_rels = {c["path"] for c in changes}
        self._prune_unused_backups(run, changed_rels)
        run["changes"] = changes
        if code != 0:
            self._restore_changes(run, [c for c in changes if c.get("backup") or c["action"] == "create"])
            self._prune_unused_backups(run, set())
            run["changes"] = []
            raise BackendError(
                f"OpenCode exited with code {code}; any partial edits were rolled back. Output: {output[-400:].strip()}"
            )
        for change in changes:
            target = self._abs(change["path"])
            if change["action"] == "delete":
                change["_diff"] = make_diff(change["path"], self._read_backup(run, change), None)
                change["check"] = "deleted"
                continue
            try:
                new_text = read_text_strict(target)
                ok, message = check_syntax(change["path"], new_text)
            except EngineError as exc:
                ok, message, new_text = False, str(exc), ""
            change["check"] = message
            old_text = self._read_backup(run, change) if change["action"] == "modify" else None
            change["_diff"] = make_diff(change["path"], old_text, new_text)
            change["added"], change["removed"] = count_diff(change["_diff"])
            if not ok and self.cfg.atomic_runs:
                self._restore_changes(run, changes)
                self._prune_unused_backups(run, set())
                bad = change["path"]
                run["changes"] = []
                raise GuardRejected(f"OpenCode left '{bad}' invalid ({message}). The whole run was rolled back.")
        if not changes:
            run["status"] = "noop"
            return
        if any(c["path"] in unprotected for c in changes):
            if not apply:
                self._restore_changes(run, [c for c in changes if c.get("backup") or c["action"] == "create"])
                raise GuardRejected(
                    "OpenCode modified a file that exceeded the snapshot budget during a staged (--review) run."
                )
            run["warnings"].append("some changed files had no snapshot and cannot be rolled back")
        if apply:
            run["status"] = "applied"
            self.logger.log("run_applied", run_id=run["id"], files=[c["path"] for c in changes])
            self._emit("run_applied", run_id=run["id"], files=[c["path"] for c in changes])
        else:
            for change in changes:  # keep a copy as a proposal, then put the workspace back
                if change["action"] in ("create", "modify"):
                    copy_with_hash(self._abs(change["path"]), self._run_dir(run["id"]) / "proposals" / change["path"])
                    change["proposal"] = f"proposals/{change['path']}"
                    change["sha_after"] = sha256_file(self._abs(change["path"]))
            self._restore_changes(run, changes)
            run["status"] = "staged"
            self.logger.log("run_staged", run_id=run["id"], files=[c["path"] for c in changes])
            self._emit("run_staged", run_id=run["id"], files=[c["path"] for c in changes])

    def _read_backup(self, run: Dict[str, Any], change: Dict[str, Any]) -> Optional[str]:
        if not change.get("backup"):
            return None
        path = self._run_dir(run["id"]) / change["backup"]
        try:
            return path.read_bytes().decode("utf-8")
        except (OSError, UnicodeDecodeError):
            return None

    def _detect_changes(self, before: Dict[str, Tuple[int, int]], hashes: Dict[str, str]) -> List[Dict[str, Any]]:
        after, _ = scan_workspace(self.root, self.cfg)
        out: List[Dict[str, Any]] = []
        for rel in sorted(set(before) | set(after)):
            backup = f"files/{rel}.bak" if rel in hashes else None
            if rel not in after:
                out.append({"path": rel, "action": "delete", "sha_before": hashes.get(rel), "sha_after": None,
                            "backup": backup, "proposal": None, "added": 0, "removed": 0, "check": ""})
            elif rel not in before:
                out.append({"path": rel, "action": "create", "sha_before": None, "sha_after": sha256_file(self._abs(rel)),
                            "backup": None, "proposal": None, "added": 0, "removed": 0, "check": ""})
            elif before[rel] != after[rel]:
                sha = sha256_file(self._abs(rel))
                if rel in hashes and sha == hashes[rel]:
                    continue  # touched but identical
                out.append({"path": rel, "action": "modify", "sha_before": hashes.get(rel), "sha_after": sha,
                            "backup": backup, "proposal": None, "added": 0, "removed": 0, "check": ""})
        return out

    # ---- committing / restoring -------------------------------------------
    def _backup_file(self, run: Dict[str, Any], rel: str) -> str:
        return copy_with_hash(self._abs(rel), self._run_dir(run["id"]) / "files" / (rel + ".bak"))

    def _commit(self, run: Dict[str, Any], items: List[Tuple[Dict[str, Any], Optional[bytes]]]) -> None:
        """All-or-nothing write. A failure at any point restores everything already written."""
        done: List[Dict[str, Any]] = []
        try:
            for change, data in items:
                target = self._abs(change["path"])
                if change["action"] in ("modify", "delete") and target.exists() and not change.get("backup"):
                    change["sha_before"] = self._backup_file(run, change["path"])
                    change["backup"] = f"files/{change['path']}.bak"
                if change["action"] == "delete":
                    if target.exists():
                        target.unlink()
                    done.append(change)
                    continue
                assert data is not None
                atomic_write_bytes(target, data)
                done.append(change)
                change["sha_after"] = sha256_file(target)
                if change["sha_after"] != sha256_bytes(data):
                    raise EngineError(f"Verification failed for '{change['path']}'.")
                ok, message = check_syntax(change["path"], data.decode("utf-8"))
                if not ok:
                    raise GuardRejected(f"Post-write check failed for '{change['path']}': {message}")
        except Exception:
            self._restore_changes(run, list(reversed(done)))
            raise

    def _restore_changes(self, run: Dict[str, Any], changes: List[Dict[str, Any]]) -> List[str]:
        failures: List[str] = []
        for change in changes:
            target = self._abs(change["path"])
            try:
                if change["action"] == "create":
                    if target.exists():
                        target.unlink()
                    self._prune_empty_parents(target)
                else:
                    if not change.get("backup"):
                        raise EngineError(f"no backup exists for '{change['path']}'")
                    data = (self._run_dir(run["id"]) / change["backup"]).read_bytes()
                    atomic_write_bytes(target, data)
                    if change.get("sha_before") and sha256_bytes(data) != change["sha_before"]:
                        raise EngineError(f"backup of '{change['path']}' does not match its recorded hash")
            except Exception as exc:
                failures.append(f"{change['path']}: {exc}")
                self.logger.log("restore_failed", "error", run["id"], path=change["path"], error=str(exc))
        if changes:
            self.logger.log("files_restored", run_id=run["id"], count=len(changes), failures=failures)
        return failures

    def _prune_empty_parents(self, target: Path) -> None:
        parent = target.parent
        while parent != self.root and parent.is_dir() and not any(parent.iterdir()):
            with contextlib.suppress(OSError):
                parent.rmdir()
            parent = parent.parent

    def _stage_items(self, run: Dict[str, Any], items: List[Tuple[Dict[str, Any], Optional[bytes]]]) -> None:
        for change, data in items:
            if data is not None:
                path = self._run_dir(run["id"]) / "proposals" / change["path"]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                change["proposal"] = f"proposals/{change['path']}"
                change["sha_after"] = sha256_bytes(data)
        run["status"] = "staged"
        self.logger.log("run_staged", run_id=run["id"], files=[c["path"] for c in run["changes"]])
        self._emit("run_staged", run_id=run["id"], files=[c["path"] for c in run["changes"]])

    # ---- tests after apply --------------------------------------------------
    def _post_apply_tests(self, run: Dict[str, Any]) -> None:
        low_prio = self.cfg.low_priority_background and run.get("source") in ("rsi", "pet")
        extra_kwargs = _low_priority_kwargs(low_prio)
        try:
            proc = subprocess.run(
                self.cfg.test_command, cwd=str(self.root), stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                errors="replace", timeout=self.cfg.test_timeout_s, **extra_kwargs
            )
            passed, tail = proc.returncode == 0, (proc.stdout or "")[-1500:]
        except (OSError, subprocess.TimeoutExpired) as exc:
            passed, tail = False, f"test command could not finish: {exc}"
        run["test"] = {"command": self.cfg.test_command, "passed": passed, "output_tail": tail}
        self.logger.log("tests_finished", run_id=run["id"], passed=passed, output_tail=tail)
        if not passed:
            self._restore_changes(run, run["changes"])
            run["status"] = "rolled_back"
            run["error"] = "Tests failed after applying the change, so it was rolled back automatically."
            self._emit("run_rolled_back", run_id=run["id"], reason="tests_failed")

    # ---- approve / reject / rollback ---------------------------------------
    def approve(self, run_id: str, force: bool = False, open_diff: bool = False) -> Dict[str, Any]:
        with self._lock():
            run = self._load_manifest(run_id)
            if run["status"] != "staged":
                raise EngineError(f"Run {run_id} is '{run['status']}', not 'staged'; nothing to approve.")
            items: List[Tuple[Dict[str, Any], Optional[bytes]]] = []
            for change in run["changes"]:
                target = self._abs(change["path"])
                current = sha256_file(target) if target.exists() else None
                if not force and current != change.get("sha_before"):
                    raise GuardRejected(f"'{change['path']}' changed since this proposal was made. "
                                        "Re-run the task, or approve with force to overwrite.")
                data = None
                if change["action"] != "delete":
                    data = (self._run_dir(run_id) / change["proposal"]).read_bytes()
                items.append((change, data))
            self._commit(run, items)
            run["status"] = "applied"
            if self.cfg.test_command:
                self._post_apply_tests(run)
            self._save_manifest(run)
            self._update_baseline(run)
            self.logger.log("run_approved", run_id=run_id, status=run["status"])
            self._emit("run_applied", run_id=run_id, files=[c["path"] for c in run["changes"]])
        if open_diff and run["status"] == "applied":
            self.open_diff(run_id)
        return self._summarize(run)

    def reject(self, run_id: str) -> Dict[str, Any]:
        with self._lock():
            run = self._load_manifest(run_id)
            if run["status"] != "staged":
                raise EngineError(f"Run {run_id} is '{run['status']}', not 'staged'.")
            run["status"] = "rejected"
            self._save_manifest(run)
            shutil.rmtree(self._run_dir(run_id) / "proposals", ignore_errors=True)
            self.logger.log("run_rejected", run_id=run_id)
        return self._summarize(run)

    def rollback(self, run_id: Optional[str] = None, force: bool = False) -> Dict[str, Any]:
        with self._lock():
            if run_id is None:
                applied = [r for r in self.list_runs(100) if r["status"] == "applied"]
                if not applied:
                    raise EngineError("There is no applied run to roll back.")
                run_id = applied[0]["run_id"]
            run = self._load_manifest(run_id)
            if run["status"] != "applied":
                raise EngineError(f"Run {run_id} is '{run['status']}'; only applied runs can be rolled back.")
            if not force:
                for change in run["changes"]:
                    target = self._abs(change["path"])
                    current = sha256_file(target) if target.exists() else None
                    if current != change.get("sha_after"):
                        raise GuardRejected(f"'{change['path']}' was edited after this run. Rolling back would lose "
                                            "those edits; use force to override.")
            failures = self._restore_changes(run, run["changes"])
            if failures:
                raise EngineError("Rollback was incomplete: " + "; ".join(failures))
            run["status"] = "rolled_back"
            self._save_manifest(run)
            self._update_baseline(run)
            self.logger.log("run_rolled_back", run_id=run_id)
            self._emit("run_rolled_back", run_id=run_id, reason="user")
        return self._summarize(run)

    # ---- VS Code diffs -------------------------------------------------------
    def open_diff(self, run_id: str, rel: Optional[str] = None, max_tabs: int = 5) -> Dict[str, Any]:
        run = self._load_manifest(run_id)
        run_dir = self._run_dir(run_id)
        empty = run_dir / "empty.txt"
        if not empty.exists():
            empty.write_text("", encoding="utf-8")
        results = []
        for change in [c for c in run["changes"] if rel in (None, c["path"])][:max_tabs]:
            current = self._abs(change["path"])
            if run["status"] == "staged":
                left = current if current.exists() else empty
                right = run_dir / change["proposal"] if change.get("proposal") else empty
            else:
                left = run_dir / change["backup"] if change.get("backup") else empty
                right = current if current.exists() else empty
            results.append(dict(self.vscode.open_diff(left, right), path=change["path"]))
        if not results or not all(r["ok"] for r in results):
            return {"ok": False, "results": results, "diff_file": str(run_dir / "changes.diff")}
        return {"ok": True, "results": results, "diff_file": str(run_dir / "changes.diff")}

    # ---- modified-file detection ---------------------------------------------
    def _baseline_path(self) -> Path:
        return self.state / "state" / "baseline.json"

    def _update_baseline(self, run: Dict[str, Any]) -> None:
        path = self._baseline_path()
        if not path.exists():
            return
        try:
            baseline = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        for change in run["changes"]:
            target = self._abs(change["path"])
            if target.exists():
                baseline[change["path"]] = sha256_file(target)
            else:
                baseline.pop(change["path"], None)
        atomic_write_bytes(path, json.dumps(baseline).encode("utf-8"))

    def mark_clean(self) -> int:
        """Record the current workspace as the baseline for detect_modified_files()."""
        stats, _ = scan_workspace(self.root, self.cfg)
        baseline = {rel: sha256_file(self._abs(rel)) for rel in stats}
        atomic_write_bytes(self._baseline_path(), json.dumps(baseline).encode("utf-8"))
        return len(baseline)

    def detect_modified_files(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {"since_baseline": [], "git": [], "note": ""}
        path = self._baseline_path()
        if not path.exists():
            out["note"] = f"baseline created now ({self.mark_clean()} files); later calls report changes"
        else:
            try:
                baseline = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                baseline = {}
            stats, _ = scan_workspace(self.root, self.cfg)
            for rel in sorted(set(stats) | set(baseline)):
                if rel not in stats:
                    out["since_baseline"].append({"path": rel, "state": "deleted"})
                elif rel not in baseline:
                    out["since_baseline"].append({"path": rel, "state": "new"})
                elif sha256_file(self._abs(rel)) != baseline[rel]:
                    out["since_baseline"].append({"path": rel, "state": "modified"})
        if shutil.which("git") and (self.root / ".git").exists():
            try:
                proc = subprocess.run(
                    ["git", "-c", "core.quotepath=off", "-C", str(self.root), "status", "--porcelain"],
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    text=True, encoding="utf-8", errors="replace", timeout=15
                )
                for line in proc.stdout.splitlines():
                    if len(line) > 3:
                        out["git"].append({"status": line[:2].strip(), "path": line[3:].split(" -> ")[-1].strip('"')})
            except (OSError, subprocess.TimeoutExpired):
                out["note"] = (out["note"] + " git status unavailable").strip()
        return out

    # ---- summaries -----------------------------------------------------------
    def _summarize(self, run: Dict[str, Any]) -> Dict[str, Any]:
        status = run["status"]
        hint = ""
        if status == "staged":
            hint = (
                f"Review: python coder_engine.py diff {run['id']}   "
                f"Keep: python coder_engine.py approve {run['id']}   "
                f"Drop: python coder_engine.py reject {run['id']}"
            )
        elif status == "applied":
            hint = "Undo anytime: python coder_engine.py rollback"
        return {
            "run_id": run["id"], "status": status, "backend": run.get("backend"), "summary": run.get("summary", ""),
            "files": [{"path": c["path"], "action": c["action"], "added": c.get("added", 0),
                       "removed": c.get("removed", 0), "check": c.get("check", "")} for c in run["changes"]],
            "warnings": run["warnings"], "error": run.get("error"), "test": run.get("test"), "next": hint,
        }

    # ---- hooks for Gemma Pet Mode and RSI -------------------------------------
    def quick_request(self, text: str, files: Optional[List[str]] = None, backend: str = "auto") -> Dict[str, Any]:
        """Pet Mode entry point. Always STAGED (never applied) so a reflex can't silently change code."""
        self._emit("pet_request_received", text=text, files=files or [])
        self.logger.log("pet_request", text=text, files=files or [])
        return self.run_task(text, files=files, backend=backend, apply=False, source="pet")

    def _rsi_state(self) -> Dict[str, Any]:
        path = self.state / "state" / "rsi_state.json"
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {"signatures": {}, "recent": []}

    def report_error(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """RSI hook. telemetry: {"error": str, "traceback": str?, "file": str?, "line": int?, "source": str?}.
        Rate-limited and de-duplicated so a failing patch can never loop forever. Staged unless rsi_auto_apply."""
        error = str(telemetry.get("error", "")).strip()
        trace = str(telemetry.get("traceback", ""))
        if not error and not trace:
            return {"status": "skipped", "reason": "telemetry has no error text"}
        self._emit("error_report_received", telemetry={k: str(v)[:300] for k, v in telemetry.items()})
        rel_file, line_no = self._locate_error_file(telemetry, trace)
        signature = hashlib.sha1(
            re.sub(r"\d+", "N", f"{error}|{rel_file}|{line_no}").encode("utf-8")
        ).hexdigest()[:16]
        state = self._rsi_state()
        now = time.time()
        recent = [t for t in state.get("recent", []) if now - t < 3600]
        last_seen = state.get("signatures", {}).get(signature, 0)
        if now - last_seen < self.cfg.rsi_signature_cooldown_s:
            self.logger.log("rsi_skipped", "warning", reason="duplicate", signature=signature)
            return {"status": "skipped", "reason": "this error was already handled recently", "signature": signature}
        if len(recent) >= self.cfg.rsi_max_per_hour:
            self.logger.log("rsi_skipped", "warning", reason="rate_limit", signature=signature)
            return {"status": "skipped", "reason": f"limit of {self.cfg.rsi_max_per_hour} self-patches per hour reached"}
        state["signatures"][signature] = now
        state["recent"] = recent + [now]
        atomic_write_bytes(self.state / "state" / "rsi_state.json", json.dumps(state).encode("utf-8"))
        excerpt = self._excerpt(rel_file, line_no) if rel_file else ""
        task = ("An automated error report from FlameAGI needs a minimal, safe fix.\n"
                f"Error: {error}\nTraceback (truncated):\n{trace[-3500:]}\n"
                + (f"Relevant code from {rel_file}:\n{excerpt}\n" if excerpt else "")
                + "Fix the root cause with the smallest possible change. Do not refactor unrelated code.")
        self.logger.log("rsi_task_created", signature=signature, file=rel_file)
        result = self.run_task(
            task, files=[rel_file] if rel_file else [], backend=telemetry.get("backend", "auto"),
            apply=bool(self.cfg.rsi_auto_apply), source="rsi"
        )
        result["signature"] = signature
        return result

    def _locate_error_file(self, telemetry: Dict[str, Any], trace: str) -> Tuple[Optional[str], Optional[int]]:
        candidates: List[Tuple[str, Optional[int]]] = []
        if telemetry.get("file"):
            candidates.append((str(telemetry["file"]), telemetry.get("line")))
        for match in re.finditer(r'File "([^"]+)", line (\d+)', trace):
            candidates.append((match.group(1), int(match.group(2))))
        for raw, line in reversed(candidates):  # innermost frame first
            try:
                target = resolve_in_workspace(self.root, raw)
            except PathError:
                continue
            if target.is_file() and not set(target.relative_to(self.root).parts) & IGNORED_DIRS:
                return target.relative_to(self.root).as_posix(), int(line) if line else None
        return None, None

    def _excerpt(self, rel: str, line_no: Optional[int], radius: int = 25) -> str:
        try:
            lines = read_text_strict(self._abs(rel)).splitlines()
        except (OSError, EngineError):
            return ""
        centre = line_no or 1
        start, end = max(1, centre - radius), min(len(lines), centre + radius)
        return "\n".join(f"{n:>5}: {lines[n - 1]}" for n in range(start, end + 1))

    # ---- diagnostics -----------------------------------------------------------
    def doctor(self) -> List[Tuple[str, bool, str]]:
        checks: List[Tuple[str, bool, str]] = [("Workspace", True, str(self.root))]
        problem = self.gemini.why_unavailable()
        checks.append(("Gemini backend", problem is None,
                       f"model '{self.cfg.gemini_model}', {len(self.cfg.gemini_api_keys)} key(s)"
                       if problem is None else problem))
        problem = self.opencode.why_unavailable()
        checks.append(("OpenCode backend", problem is None, self.opencode.resolve() or problem or ""))
        code = self.vscode.resolve()
        checks.append(("VS Code 'code' command", code is not None,
                       code or "not on PATH (visual diffs unavailable; text diffs still work)"))
        git = shutil.which("git")
        checks.append(("Git (optional)", git is not None,
                       git or "not found; modified-file detection uses the local baseline instead"))
        reachable = False
        try:
            with urllib.request.urlopen(self.cfg.ollama_url.rstrip("/") + "/api/tags", timeout=2):
                reachable = True
        except (OSError, ValueError):
            reachable = False
        local_name = self.cfg.local_model or self.cfg.gemma_model or "qwen2.5-coder:1.5b"
        detail = (
            f"{local_name} at {self.cfg.ollama_url}"
            if reachable
            else f"not reachable ({local_name} at {self.cfg.ollama_url}); Pet Mode triage falls back to simple rules"
        )
        checks.append(("Ollama / Local Model", reachable, detail))
        return checks

    def pack_workspace(self, output_file: str = "flame_project_code.txt") -> Dict[str, Any]:
        """Scan workspace, gather all source/config files (ignoring node_modules, .git, etc.),
        and export them to a single clean text file. Bypasses zip upload errors!"""
        stats, _ = scan_workspace(self.root, self.cfg)
        out_path = self.root / output_file
        buffer: List[str] = [
            f"# FLAME AGI PROJECT EXPORT - {utc_now()}",
            f"# Total Files: {len(stats)}",
            "# Format: Each file is delimited by <file path=\"...\">...</file>",
            "",
        ]
        for rel in sorted(stats):
            target = self._abs(rel)
            try:
                content = read_text_strict(target)
                buffer.append(f'<file path="{rel}">\n{content}\n</file>\n')
            except Exception:
                continue
        out_text = "\n".join(buffer)
        atomic_write_bytes(out_path, out_text.encode("utf-8"))
        self.logger.log("workspace_packed", file=output_file, files_count=len(stats), size_kb=len(out_text) // 1024)
        return {
            "output_file": str(out_path),
            "files_packed": len(stats),
            "size_kb": len(out_text) // 1024,
            "message": f"Successfully bundled {len(stats)} files into {out_path.name} ({len(out_text) // 1024} KB).",
        }

    def chat_session(self) -> None:
        """Interactive chat REPL supporting Edit: <text> Use: <model> and natural chat."""
        print(f"🔥 Flame AGI Coder Chat (v{ENGINE_VERSION})")
        print(f"Workspace : {self.root}")
        active_backend = "auto"
        active_model = self.cfg.gemini_model or DEFAULT_GEMINI_MODEL
        print(f"Active    : backend={active_backend} | model={active_model}")
        print("-" * 65)
        print("Quick Syntax:")
        print("  • Edit: <task> Use: <model>  (e.g., Edit: fix typo in app.py Use: opencode)")
        print("  • Use: <gemini|opencode|model_name> (switches default model)")
        print("  • diff | approve | rollback | doctor | modified | pack | exit")
        print("-" * 65 + "\n")

        while True:
            try:
                prompt_label = f"Flame [{active_backend}:{active_model}]> "
                line = input(prompt_label).strip()
            except (EOFError, KeyboardInterrupt):
                print("\nExiting chat session.")
                break

            cmd = parse_chat_command(line, default_backend=active_backend, default_model=active_model)
            act = cmd["action"]

            if act == "empty":
                continue
            elif act == "exit":
                print("Goodbye!")
                break
            elif act == "help":
                print("\nAvailable Commands:")
                print("  Edit: <task> [Use: <model>]  -> Run an edit task")
                print("  Use: <gemini|opencode|model> -> Switch active backend or model")
                print("  diff [run_id]                -> Open visual diff in VS Code")
                print("  approve [run_id]             -> Apply a staged review")
                print("  reject [run_id]              -> Discard a staged review")
                print("  rollback [run_id]            -> Undo the last applied change")
                print("  doctor                       -> Run system & API health checks")
                print("  modified                     -> Show workspace changes since baseline")
                print("  pack                         -> Export all code to flame_project_code.txt")
                print("  exit                         -> Quit chat session\n")
            elif act == "switch_model":
                target = cmd["target"]
                t_low = target.lower()
                if t_low in ("auto", "gemini", "opencode"):
                    active_backend = t_low
                    print(f"Switched default backend to: {active_backend}")
                else:
                    active_model = target
                    self.init_config(model=target)
                    print(f"Switched model to: {active_model} (saved to .flame/coder_config.json)")
            elif act == "doctor":
                for item in self.doctor():
                    print(f"[{'OK ' if item[1] else 'NO '}] {item[0]}: {item[2]}")
            elif act == "modified":
                res = self.detect_modified_files()
                for item in res["since_baseline"]:
                    print(f"{item['state']:<9} {item['path']}")
            elif act == "list":
                for item in self.list_runs():
                    print(f"{item['run_id']}  {item['status']:<11} {item['backend'] or '-':<8} {item['task']}")
            elif act == "pack":
                res = self.pack_workspace(cmd.get("filename") or "flame_project_code.txt")
                print(res["message"])
            elif act == "diff":
                res = self.open_diff(cmd["run_id"]) if cmd.get("run_id") else self.open_diff(self.list_runs(1)[0]["run_id"])
                print("Opened in VS Code." if res.get("ok") else "VS Code command not on PATH.")
            elif act == "approve":
                if not cmd.get("run_id"):
                    staged = [r for r in self.list_runs(10) if r["status"] == "staged"]
                    if not staged:
                        print("No staged run to approve.")
                        continue
                    run_id = staged[0]["run_id"]
                else:
                    run_id = cmd["run_id"]
                _print_result(self.approve(run_id))
            elif act == "reject":
                if not cmd.get("run_id"):
                    staged = [r for r in self.list_runs(10) if r["status"] == "staged"]
                    if not staged:
                        print("No staged run to reject.")
                        continue
                    run_id = staged[0]["run_id"]
                else:
                    run_id = cmd["run_id"]
                _print_result(self.reject(run_id))
            elif act == "rollback":
                try:
                    _print_result(self.rollback(cmd.get("run_id")))
                except EngineError as e:
                    print(f"Rollback error: {e}")
            elif act == "run":
                task = cmd["task"]
                backend = cmd["backend"]
                if cmd.get("model"):
                    self.cfg.gemini_model = cmd["model"]
                print(f"Executing: '{task}' via [{backend}]...")
                res = self.run_task(task, backend=backend, apply=not cmd["review"])
                _print_result(res)
                print()


# --------------------------------------------------------------------------
# Gemma / Qwen Pet Mode bridge
# --------------------------------------------------------------------------
class PetBridge:
    """Interface for Pet Mode. Local LLM (via Ollama) extracts target files from a spoken/typed request;
    if Ollama is down, simple rules take over. Requests are always staged for review."""

    def __init__(self, engine: CoderEngine):
        self.engine = engine

    def from_utterance(self, utterance: str) -> Dict[str, Any]:
        known = self.engine._tree_listing(limit=60)
        files = extract_mentioned_files(utterance, known, limit=5)
        is_code = re.search(
            r"\b(fix|bug|error|add|change|update|rename|refactor|write|create|implement|patch|typo)\b",
            utterance, re.I
        ) is not None
        local_model_name = self.engine.cfg.local_model or self.engine.cfg.gemma_model or "qwen2.5-coder:1.5b"
        keep_alive = self.engine.cfg.local_keep_alive or self.engine.cfg.gemma_keep_alive or "30s"
        try:
            body = json.dumps({
                "model": local_model_name, "stream": False, "format": "json",
                "keep_alive": keep_alive,
                "options": {"num_ctx": 2048, "num_predict": 160, "temperature": 0},
                "prompt": ("You are an AI code triage agent. Decide if the user wants a code change or edit.\n"
                           'Respond strictly with a JSON object: {"is_code_request": true, "files": ["<filename>"]}\n'
                           "Only list files from this available list:\n" + "\n".join(known) + f"\n\nUser request: {utterance}"),
            }).encode("utf-8")
            request = urllib.request.Request(
                self.engine.cfg.ollama_url.rstrip("/") + "/api/generate", data=body,
                headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                reply = parse_model_json(json.loads(response.read().decode("utf-8")).get("response", "{}"))
            is_code = bool(reply.get("is_code_request", is_code))
            listed = [f for f in reply.get("files", []) if isinstance(f, str) and f in known]
            files = listed or files
            source = local_model_name
        except (OSError, ValueError, KeyError):
            source = "rules"
        return {"is_code_request": is_code, "files": files, "text": utterance, "triage": source}

    def dispatch(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """request: {"text": str, "files": [..]?, "backend": "auto"|...?}. Returns a staged run result."""
        text = str(request.get("text", "")).strip()
        files = request.get("files")
        if files is None:
            triage = self.from_utterance(text)
            if not triage["is_code_request"]:
                return {"status": "skipped", "reason": "not a code request"}
            files = triage["files"]
        return self.engine.quick_request(text, files=files, backend=request.get("backend", "auto"))


# --------------------------------------------------------------------------
# Command line
# --------------------------------------------------------------------------
def _print_result(result: Dict[str, Any]) -> None:
    if result.get("run_id"):
        print(f"Run {result['run_id']}  [{result['status']}]  backend: {result.get('backend') or '-'}")
    else:
        print(f"[{result.get('status')}]")
    if result.get("summary"):
        print(f"Summary: {result['summary']}")
    marks = {"modify": "M", "create": "A", "delete": "D"}
    for item in result.get("files", []):
        print(f"  {marks.get(item['action'], '?')} {item['path']}  (+{item['added']} -{item['removed']})  [{item['check']}]")
    for warning in result.get("warnings", []):
        print(f"  ! {warning}")
    if result.get("error"):
        print(f"Problem: {result['error']}")
    if result.get("test"):
        print(f"Tests: {'passed' if result['test']['passed'] else 'FAILED'}")
    if result.get("next"):
        print(result["next"])


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="coder_engine.py", description="FlameAGI Coder Engine")
    parser.add_argument("--workspace", help="project folder (default: auto-detected from the current folder)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    sub = parser.add_subparsers(dest="cmd", required=False)

    sub.add_parser("chat", help="start interactive chat session (Edit: <text> Use: <model>)")
    p_pack = sub.add_parser("pack", help="bundle all workspace source files into a single text file")
    p_pack.add_argument("--output", default="flame_project_code.txt", help="output file name")

    p_init = sub.add_parser("init", help="save your API key and default model into .flame/ (no env vars needed)")
    p_init.add_argument("--key", help="Gemini API key (or comma-separated keys)")
    p_init.add_argument("--model", help="Gemini/LLM model name (e.g. gemini-2.5-flash, qwen2.5-coder:1.5b)")
    p_init.add_argument("--opencode-cmd", help="custom OpenCode command string")

    p_run = sub.add_parser("run", help="run a coding task")
    p_run.add_argument("task", help="what to do (use - to read from stdin)")
    p_run.add_argument("--files", nargs="*", default=[], help="files the task is about")
    p_run.add_argument("--backend", default="auto", choices=["auto", "gemini", "opencode"])
    p_run.add_argument("--review", action="store_true", help="stage the change instead of applying it")
    p_run.add_argument("--open-diff", action="store_true", help="open the result in VS Code's diff viewer")

    p_approve = sub.add_parser("approve", help="apply a staged run")
    p_approve.add_argument("run_id")
    p_approve.add_argument("--force", action="store_true")
    p_approve.add_argument("--open-diff", action="store_true")

    p_reject = sub.add_parser("reject", help="discard a staged run")
    p_reject.add_argument("run_id")

    p_rollback = sub.add_parser("rollback", help="undo an applied run (default: the latest)")
    p_rollback.add_argument("run_id", nargs="?")
    p_rollback.add_argument("--force", action="store_true")

    p_diff = sub.add_parser("diff", help="open a run's changes in VS Code (or print them)")
    p_diff.add_argument("run_id")
    p_diff.add_argument("--file")

    sub.add_parser("list", help="recent runs")
    sub.add_parser("modified", help="files changed in the workspace")
    sub.add_parser("doctor", help="check your setup")

    p_err = sub.add_parser("report-error", help="feed an RSI error report (JSON file, or - for stdin)")
    p_err.add_argument("path")

    p_pet = sub.add_parser("pet", help="send a Pet Mode request (always staged)")
    p_pet.add_argument("text")

    args = parser.parse_args(argv)

    try:
        engine = CoderEngine(args.workspace)
        if not args.cmd or args.cmd == "chat":
            engine.chat_session()
            return 0
        payload: Any
        if args.cmd == "pack":
            payload = engine.pack_workspace(args.output)
            print(payload["message"])
            return 0
        elif args.cmd == "init":
            payload = engine.init_config(api_key=args.key, model=args.model, opencode_cmd=args.opencode_cmd)
        elif args.cmd == "run":
            task = sys.stdin.read() if args.task == "-" else args.task
            payload = engine.run_task(task, files=args.files, backend=args.backend, apply=not args.review,
                                      open_diff=args.open_diff)
        elif args.cmd == "approve":
            payload = engine.approve(args.run_id, force=args.force, open_diff=args.open_diff)
        elif args.cmd == "reject":
            payload = engine.reject(args.run_id)
        elif args.cmd == "rollback":
            payload = engine.rollback(args.run_id, force=args.force)
        elif args.cmd == "diff":
            payload = engine.open_diff(args.run_id, rel=args.file)
            if not payload["ok"]:
                print(Path(payload["diff_file"]).read_text(encoding="utf-8") if not args.json else "", end="")
        elif args.cmd == "list":
            payload = engine.list_runs()
        elif args.cmd == "modified":
            payload = engine.detect_modified_files()
        elif args.cmd == "doctor":
            payload = [{"check": n, "ok": ok, "detail": d} for n, ok, d in engine.doctor()]
        elif args.cmd == "report-error":
            raw = sys.stdin.read() if args.path == "-" else Path(args.path).read_text(encoding="utf-8")
            payload = engine.report_error(json.loads(raw))
        else:
            payload = PetBridge(engine).dispatch({"text": args.text})
    except EngineError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Cancelled.", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    elif args.cmd == "init":
        print(f"Saved config to {payload['config_file']}")
        print(f"  Model : {payload['gemini_model']}")
        print(f"  Keys  : {payload['keys_configured']} configured")
    elif args.cmd == "doctor":
        for item in payload:
            print(f"[{'OK ' if item['ok'] else 'NO '}] {item['check']}: {item['detail']}")
    elif args.cmd == "list":
        for item in payload:
            print(f"{item['run_id']}  {item['status']:<11} {item['backend'] or '-':<8} {item['task']}")
    elif args.cmd == "modified":
        for item in payload["since_baseline"]:
            print(f"{item['state']:<9} {item['path']}")
        for item in payload["git"]:
            print(f"git {item['status']:<3} {item['path']}")
        if payload["note"]:
            print(payload["note"])
    elif args.cmd == "diff":
        print("Opened in VS Code." if payload["ok"] else "VS Code unavailable - diff printed above.")
    else:
        _print_result(payload)
    status = payload.get("status") if isinstance(payload, dict) else None
    return 1 if status in ("failed", "rolled_back") else 0


if __name__ == "__main__":
    sys.exit(main())
