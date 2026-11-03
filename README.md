# 🔥 FlameAGI — Autonomous Windows AI Assistant & MCP Agent Operating System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-31.x-47848F.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB.svg)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-38B2AC.svg)](https://tailwindcss.com/)
[![MCP](https://img.shields.io/badge/MCP-Standard-orange.svg)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**FlameAGI** is an autonomous desktop AI assistant and agentic operating system designed natively for Windows 11. Powered by Google Gemini and local Ollama models, FlameAGI bridges conversational intelligence directly to Windows native APIs, the **Model Context Protocol (MCP)**, desktop computer use, autonomous coding pipelines, and cross-platform companion networks like WhatsApp and Minecraft.

---

## ✨ Core Features & Architecture

### 1. 🔌 Native Model Context Protocol (MCP) Host
FlameAGI implements a built-in stdio-based MCP Client and Host (`src/main/mcp/`) that automatically boots and orchestrates specialized servers on app launch:
- **`computerUseServer`**: Direct Windows C# P/Invoke interop via PowerShell (`user32.dll`, `gdi32.dll`). Provides screen capture, cursor positioning, mouse click/drag, keyboard text input/keystrokes, and active window focusing. Includes an instant corner killswitch ($(X \le 4, Y \le 4)$).
- **`browserServer`**: Playwright-powered headless/headed browser for web navigation, dynamic DOM search, and HTML extraction.
- **`fileSystemServer`**: Deep filesystem inspection, recursive directory tree mapping, and automated `%TEMP%` cleanup.
- **`osControlServer`**: Sandboxed Windows PowerShell execution, hardware telemetry (CPU, RAM, Disk, GPU), and running process monitoring.
- **`whatsappServer`**: Real-time WhatsApp companion integration via Baileys socket connection, archiving inbound photos/videos/audio, and generating pairing QR codes.

### 2. 👁️ Autonomous Computer Use Protocol
When performing GUI actions, Flame adheres to an explicit 4-step execution loop:
1. **Observation**: Capture current screen state via `computer.capture_screen`.
2. **Coordinate Planning**: Locate target UI elements in pixel space $(X, Y)$.
3. **Action Execution**: Dispatch atomic native inputs (`pointer_action`, `keyboard_input`, `window_control`).
4. **Verification**: Recapture screen to confirm the operation succeeded before taking the next step.

### 3. 🎙️ Zero-Cost Local Voice Pipeline & BlackFlamePet
FlameAGI features a responsive cyber-amber flame companion pet (`BlackFlamePet`) synced with local browser audio APIs:
- **Speech-to-Text (STT)**: Browser-native Web Speech API with live interim streaming into the input bar and automatic submission on speech end.
- **Text-to-Speech (TTS)**: Cleaned markdown vocalization via `window.speechSynthesis` with speech rate and pitch control.
- **Audio-Visual Sync**: The pet seamlessly animates between `idle` (`· ◡ ·`), `listening` (`◉ ◡ ◉` with audio-reactive pulses), and `speaking` (`● ◡ ●` with orbital planetary rings).

### 4. 🎮 Isolated Minecraft Agent Mode
- **Dual Mode Separation**: Normal desktop operations strictly follow standard `Chat | Task` modes.
- **Game Agent Activation**: Agent Mode is completely isolated and only activates when the user explicitly asks (*"come to minecraft"*, *"launch game agent"*) or triggers the `Alt` global hotkey.
- **Voice-to-Voice HUD**: Displays a minimal, cybernetic HUD overlaying the game with full duplex voice control.
- **Dynamic Leader Recognition**: Authorizes the configured user profile nickname alongside `Emperorop7528` as Minecraft team leaders.

### 5. 💬 Dual-Memory & WhatsApp Shared Brain
- **Live GUI QR Pairing**: Connect your WhatsApp in seconds with dynamic QR code generation rendered in the Plugins tab or requested directly in chat.
- **Cross-Platform Knowledge**: Shared facts and conversation history synchronize between Windows desktop and mobile WhatsApp chats.
- **Media Archival**: Inbound media messages (photos, voice notes, documents) are indexed locally with one-click desktop preview and opening.

### 6. 🖼️ Inline Chat Stream Image Gallery & Lightbox
- Messages containing screenshots (`computer.capture_screen`), WhatsApp media items, or generated images (`/image`) render inside amber-accented inline preview cards.
- Clicking any image opens a full-featured Lightbox modal with zoom controls, download, and native Windows Explorer file revealing (`app.openPath`).

### 7. 🛡️ Guarded Coder Engine & Self-Healing
- **Syntax Check**: All code modifications are validated against AST parsing and compilation before staging.
- **One-Command Rollback**: Automatic `.bak` run snapshots allow reverting any code edit instantly.
- **Auto-Healing**: Detected runtime or chat errors prompt Flame's Guardian Engine to diagnose the stack trace, generate verified patches, and offer a one-click **Self-Heal** button.

---

## 🛠️ Project Structure

```
winpilot/
├── shared/                         # Universal TypeScript types & IPC channel definitions
│   ├── types.ts                    # UserProfile, ChatMessage, LightboxImage, MCP types
│   └── ipc-channels.ts             # IPC channel contracts
├── resources/                      # Native assets (icon.ico, icon.png, icon.svg)
├── src/
│   ├── main/                       # Node.js Electron Main Process
│   │   ├── index.ts                # Application lifecycle, MCP initialization, window setup
│   │   ├── flameCore/              # Capabilities registry, prompt builder, computer use protocol
│   │   ├── mcp/                    # Model Context Protocol Host & Server implementations
│   │   │   ├── mcpHost.ts          # Central stdio MCP server manager
│   │   │   └── servers/            # computerUse, browser, fileSystem, osControl, whatsapp
│   │   ├── services/               # System services (AI, WhatsApp, Minecraft, Profile, Audio)
│   │   └── ipc/                    # Type-safe IPC handlers (app, profile, whatsapp, ai)
│   ├── preload/                    # Secure Preload Bridge (`window.api.*`)
│   └── renderer/                   # React 18 UI (Vite + Tailwind + Radix UI)
│       └── src/
│           ├── components/
│           │   ├── pet/            # BlackFlamePet animated vector companion
│           │   ├── chat/           # ChatMessage component with inline image cards
│           │   ├── shared/         # ModeSwitcher (Chat | Task), ImageLightbox, FlameIcon
│           │   ├── mcp/            # MCP server status pills & tool execution cards
│           │   └── minecraft/      # AgentModeHud voice overlay
│           ├── pages/              # AIAssistant, Plugins, Settings, ChessArena, REA
│           ├── hooks/              # useSpeechRecognition, useTextToSpeech, useTheme
│           └── lib/                # Chat history, formatters, utilities
├── .env.example                    # Environment variable template
├── keys.example.json               # API key template
└── electron-builder.yml            # Windows installer packaging configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or later recommended
- **Windows 10 / 11** (for native Windows P/Invoke and PowerShell tools)
- **Ollama** (optional, for offline local models like `qwen2.5-coder:1.5b` or `gemma:2b`)

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/flameagi.git
cd flameagi/winpilot
npm install
```

### 2. Configure Environment
Copy the example environment configuration:
```bash
cp .env.example .env
```
Open `.env` and add your Google Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
FLAME_GEMINI_MODEL=gemini-2.5-flash
OLLAMA_URL=http://127.0.0.1:11434
```

### 3. Start Development Server
Run FlameAGI in development mode with hot-reloading:
```bash
npm run dev
```

### 4. Build Production Application
```bash
# Typecheck TypeScript for both web renderer and Node main process
npm run typecheck

# Build bundle
npm run build

# Package standalone Windows installer (.exe)
npm run build:win
```

---

## 🔒 Security & Safety Model

- **Process Isolation**: The React renderer operates without direct Node.js or OS access. All system interactions must cross the audited `preload` boundary.
- **Destructive Action Confirmation**: High-impact operations (file deletion, app uninstallation, self-healing code writes) emit a `pendingAction` requiring explicit human user approval before execution.
- **Fail-Safe Killswitch**: Computer use mouse interop monitors cursor coordinates on every step; moving the mouse to the top-left corner ($(X \le 4, Y \le 4)$) immediately aborts pointer operations.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
