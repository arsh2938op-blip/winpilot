# FlameAGI

A persistent AI assistant for Windows. Flame runs as a desktop app (Electron)
with a floating companion orb, and can read and change things on your machine
— install apps, run commands, work through your files, and edit your code.

The app is named **FlameAGI**; the codebase still uses `WinPilot` in some
internal identifiers and paths.

## Stack

- Electron 31 + `electron-vite` (three build targets: main / preload / renderer)
- React 18 + TypeScript (strict)
- Tailwind CSS + shadcn/ui-style components (Radix-based)
- React Router (`HashRouter`, required for Electron's `file://` loading)
- Zustand for local UI state
- `coder_engine.py` — the guarded code-editing engine that wraps the OpenCode CLI

## Getting started

```bash
npm install
npm run dev          # launches the app with hot reload
```

Other scripts:

```bash
npm run build        # production build (renderer + main + preload)
npm run build:win    # build + package a Windows installer (electron-builder)
npm run typecheck    # TypeScript project-wide check
npm run lint         # ESLint
```

## Architecture

Electron runs two processes with very different powers. The **main** process
can touch the filesystem, run shell commands, and call Windows. The
**renderer** (the React UI) cannot, by design. They talk only through
**IPC**, wired up via the **preload** script.

This isn't just an Electron requirement — it directly enforces the project's
safety philosophy. Because the renderer physically cannot run system
commands, "always confirm before doing anything destructive" is something
the architecture guarantees, not a UI convention someone could accidentally
skip.

```
Renderer (React)  →  preload (window.api.*)  →  IPC  →  main/ipc/*.ts  →  main/services/*
     UI only              the "locked door"                              real system logic
```

### Layout

```
winpilot/
├── shared/                # Types + IPC channel names used by BOTH processes
├── resources/              # icon.ico / icon.png used by electron-builder + dev window
├── mobile/                 # Companion PWA shell (static HTML/CSS/JS)
├── src/
│   ├── main/               # Node process — the only code allowed to touch Windows
│   │   ├── index.ts         # App entry: window, tray, orb, lifecycle
│   │   ├── ipc/              # Receives IPC calls, delegates to services/
│   │   ├── services/         # Real system logic (winget, system stats, AI, orb, ...)
│   │   ├── plugins/          # Plugin capabilities (see below)
│   │   ├── flameCore/        # Capability registry + prompt/effort/personality
│   │   └── utils/            # broadcast.ts (agent activity), runCommand.ts
│   ├── preload/             # The bridge — exposes a small, explicit API to the renderer
│   │   ├── index.ts          # the window.api surface
│   │   └── global.d.ts       # `Window.api` type declaration
│   └── renderer/            # The React UI — no direct system access
│       └── src/
│           ├── components/
│           │   ├── ui/        # shadcn/ui-style primitives (Button, Card, Input, ...)
│           │   ├── layout/     # TitleBar, Sidebar, CommandPalette, AppShell
│           │   ├── orb/        # Floating companion window UI
│           │   └── shared/     # PageHeader, PlaceholderCard, StatCard, CodeBlock
│           ├── pages/         # One folder per feature
│           ├── routes/        # Single source of truth for navigation
│           ├── store/         # Zustand stores (theme, nav, orb)
│           ├── hooks/         # useTheme, useVoice
│           └── lib/           # chat history, message rendering, voice providers
```

## The capability registry

Flame Core knows exactly one thing about plugins: *look up an id, call
`run()`*. Everything else — Windows, winget, Zapier, memory, files, search,
RSI, coding — registers into one flat registry in
`src/main/flameCore/capabilities.ts`.

```
flameCore/capabilities.ts   # registerCapability() / getCapability()
flameCore/registerPlugins.ts # the one place every plugin registers
plugins/<name>/capabilities.ts
```

Adding a plugin means adding one line to `registerPlugins.ts`. The registry
currently holds 24 capabilities:

| Plugin | Capabilities |
|---|---|
| `windows` | `windows.launchApp`, `winget.install`, `winget.update` |
| `files` | `files.listDirectory`, `files.readText`, `files.inspectZip`, `files.extractZip`, `files.searchInFiles`, `files.readPdfText`, `vision.inspectImage`, `vision.inspectFolder`, `vision.inspectZip` |
| `coder` | `coder.edit`, `coder.approve`, `coder.reject`, `coder.rollback`, `coder.diff`, `coder.status`, `coder.doctor` |
| `aiNetwork` | `ai_network.gemini`, `ai_network.opencode` |
| `memory` | `memory.remember`, `memory.rememberPlan` |
| `rsi` | `rsi.improve` |
| `search` | `search.currentInfo` |
| `devTools` | `devtools.runCommand` |
| `zapier` | `zapier.run` |

### Intent routing

`src/main/services/ai/index.ts` is the single entry point for a chat turn.
It classifies the prompt (locally via Ollama/Gemma, or Gemini when the user
picks the Gemini model), then dispatches to a capability through
`runCapability()`. Destructive actions are never executed straight from the
model — they return a `pendingAction` that the renderer renders as a
Confirm/Cancel prompt, so the approval gate is structural rather than a UI
convention.

Chat also accepts literal Coder Engine commands that bypass classification
entirely (they are commands, not something a 2B model should route):
`Edit: <task>`, `approve`, `reject`, `rollback`, `diff`, `doctor`, `status`,
`modified`, `list`.

## The Coder Engine

`coder_engine.py` (in the workspace root, one level above this folder) is a
single-file, standard-library-only Python program that wraps the OpenCode CLI.
Every code change made through chat goes through it, so it inherits:

- `.bak` snapshots in `.flame/runs/<run_id>/` for one-command rollback
- a syntax guard before any change is kept — Python files must pass
  `ast.parse` **and** `py_compile`, JSON must parse
- staged review mode (`--review`) that never touches the workspace
- VS Code visual diffs via `code --diff`
- all-or-nothing application: one bad file rolls the whole run back

The bridge lives in `src/main/services/ai/coderEngine.ts`. Tasks are piped to
the engine's stdin rather than its argv, so no shell quoting is ever
involved.

## Safety model

- The renderer cannot reach Windows except through explicit preload APIs.
- Destructive capabilities (`uninstall`, file extraction, RSI) return a
  pending action; the user must confirm in the UI first.
- Imported projects carry explicit `read` / `write` / `execute` permissions,
  and RSI refuses to run without all three.
- RSI creates a Git checkpoint before each attempt and rolls back to it if
  the tests fail.

## What still needs work

- **Git history.** The RSI feature requires the target project to be a Git
  repository, and creates a checkpoint before every attempt.
- `Combos` and `Gaming Mode` are UI shells — no execution layer yet.
- The `Plugins` page lists capabilities but has no enable/disable toggle.
- `mobile/` is a static companion PWA shell; it does not talk to the desktop
  app yet. It needs a pairing flow and a local API in the main process.
- PDF support extracts text only. Page-image rendering is not implemented,
  and image-only (scanned) PDFs yield no text.

## Design notes

The visual language pulls from Windows 11 / Fluent Design: Segoe UI Variable
as the system font, a Windows accent-blue primary color, soft low-elevation
shadows, and a frameless custom title bar so the window itself is part of
the design rather than generic OS chrome. Cascadia Code is used for
numeric/stat/command-palette text as a nod to the VS Code/PowerToys lineage
this app draws from. All of this lives in `tailwind.config.ts` and
`src/renderer/src/styles/globals.css` as CSS variables, so retheming later is
a matter of changing values in one place.
