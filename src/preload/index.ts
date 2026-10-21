import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  PlatformInfo,
  SystemSnapshot,
  WingetPackage,
  WingetProgressEvent,
  AiResponse,
  AiStatus,
  GoogleSpeakResult,
  GoogleTranscribeResult,
  ZapierToolInfo,
  MemoryEntry,
  AiNetworkStatus,
  ChatModelId,
  GeminiModelInfo,
  ImportedProject,
  ProjectPermissions,
  MinecraftConfig,
  MinecraftStatus,
  MinecraftLogLine,
  AgentActivityEvent,
  DebateTurnEvent,
  DebateEndedEvent,
  FlameDifficulty,
  OrbAccent,
  OrbWindowState
} from '@shared/types'

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IpcChannels.app.getVersion),
    getPlatformInfo: (): Promise<PlatformInfo> =>
      ipcRenderer.invoke(IpcChannels.app.getPlatformInfo),
    copyText: (text: string): Promise<void> => ipcRenderer.invoke(IpcChannels.app.copyText, text),
    pickImage: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.app.pickImage),
    pickAnyFile: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.app.pickAnyFile),
    pickAnyFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.app.pickAnyFolder)
  },

  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IpcChannels.window.minimize),
    maximizeToggle: (): Promise<void> => ipcRenderer.invoke(IpcChannels.window.maximizeToggle),
    close: (): Promise<void> => ipcRenderer.invoke(IpcChannels.window.close),
    onMaximizedChange: (callback: (isMaximized: boolean) => void): (() => void) => {
      const listener = (_: unknown, isMaximized: boolean): void => callback(isMaximized)
      ipcRenderer.on(IpcChannels.window.onMaximizedChange, listener)
      return () => ipcRenderer.removeListener(IpcChannels.window.onMaximizedChange, listener)
    }
  },

  winget: {
    listInstalled: (): Promise<WingetPackage[]> =>
      ipcRenderer.invoke(IpcChannels.winget.listInstalled),
    listUpgradable: (): Promise<WingetPackage[]> =>
      ipcRenderer.invoke(IpcChannels.winget.listUpgradable),
    search: (query: string): Promise<WingetPackage[]> =>
      ipcRenderer.invoke(IpcChannels.winget.search, query),
    install: (packageId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.winget.install, packageId),
    update: (packageId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.winget.update, packageId),
    uninstall: (packageId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.winget.uninstall, packageId),
    onProgress: (callback: (event: WingetProgressEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: WingetProgressEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.winget.onProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.winget.onProgress, listener)
    }
  },

  system: {
    getSnapshot: (): Promise<SystemSnapshot> => ipcRenderer.invoke(IpcChannels.system.getSnapshot)
  },

  /**
   * Floating orb companion. Narrow on purpose: window lifecycle plus the
   * shared preferences both surfaces agree on. The orb runs the same
   * `ai:*` calls as the main window — no relay through the main renderer,
   * no filesystem/shell/process surface here.
   */
  orb: {
    getState: (): Promise<OrbWindowState> => ipcRenderer.invoke(IpcChannels.orb.getState),
    enable: (): Promise<OrbWindowState> => ipcRenderer.invoke(IpcChannels.orb.enable),
    disable: (): Promise<OrbWindowState> => ipcRenderer.invoke(IpcChannels.orb.disable),
    toggle: (): Promise<OrbWindowState> => ipcRenderer.invoke(IpcChannels.orb.toggle),
    setAlwaysOnTop: (alwaysOnTop: boolean): Promise<OrbWindowState> =>
      ipcRenderer.invoke(IpcChannels.orb.setAlwaysOnTop, alwaysOnTop),
    setAccent: (accent: OrbAccent): Promise<OrbWindowState> =>
      ipcRenderer.invoke(IpcChannels.orb.setAccent, accent),
    setAlwaysListening: (enabled: boolean): Promise<OrbWindowState> =>
      ipcRenderer.invoke(IpcChannels.orb.setAlwaysListening, enabled),
    openMain: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.orb.openMain),
    setPanelOpen: (open: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.orb.setPanelSize, open),
    moveBy: (dx: number, dy: number): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.orb.moveBy, dx, dy),
    dragEnd: (): Promise<void> => ipcRenderer.invoke(IpcChannels.orb.dragEnd),
    onVisibilityChange: (callback: (visible: boolean) => void): (() => void) => {
      const listener = (_: unknown, visible: boolean): void => callback(visible)
      ipcRenderer.on(IpcChannels.orb.onVisibility, listener)
      return () => ipcRenderer.removeListener(IpcChannels.orb.onVisibility, listener)
    },
    onPrefsChange: (callback: (prefs: { accent: OrbAccent; alwaysListening: boolean }) => void): (() => void) => {
      const listener = (_: unknown, prefs: { accent: OrbAccent; alwaysListening: boolean }): void =>
        callback(prefs)
      ipcRenderer.on(IpcChannels.orb.onPrefs, listener)
      return () => ipcRenderer.removeListener(IpcChannels.orb.onPrefs, listener)
    },
    /** Fires when the user has been idle long enough for the pet to speak up. */
    onProactive: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IpcChannels.orb.onProactive, listener)
      return () => ipcRenderer.removeListener(IpcChannels.orb.onProactive, listener)
    },
    /** Fire-and-forget "the user did something" ping. */
    noteActivity: (): void => {
      ipcRenderer.send(IpcChannels.orb.activity)
    }
  },

  memory: {
    list: (): Promise<MemoryEntry[]> => ipcRenderer.invoke(IpcChannels.memory.list),
    add: (text: string): Promise<MemoryEntry[]> => ipcRenderer.invoke(IpcChannels.memory.add, text),
    remove: (id: string): Promise<MemoryEntry[]> => ipcRenderer.invoke(IpcChannels.memory.remove, id)
  },

  project: {
    get: (): Promise<{ path: string | null; name: string | null }> => ipcRenderer.invoke(IpcChannels.project.get),
    pickFolder: (): Promise<{ path: string; name: string } | null> =>
      ipcRenderer.invoke(IpcChannels.project.pickFolder),
    openInVsCode: (): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.project.openInVsCode)
  },

  ai: {
    sendPrompt: (prompt: string, model?: ChatModelId, requestId?: string, effort?: 'low' | 'medium' | 'high' | 'auto'): Promise<AiResponse> =>
      ipcRenderer.invoke(IpcChannels.ai.sendPrompt, prompt, model, requestId, effort),
    stopDebate: (): Promise<void> => ipcRenderer.invoke(IpcChannels.ai.stopDebate),
    checkStatus: (): Promise<AiStatus> => ipcRenderer.invoke(IpcChannels.ai.checkStatus),
    setGoogleApiKey: (key: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ai.setGoogleApiKey, key),
    hasGoogleApiKey: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.ai.hasGoogleApiKey),
    googleKeyCount: (): Promise<number> => ipcRenderer.invoke(IpcChannels.ai.googleKeyCount),
    googleSpeak: (text: string, voiceName: string): Promise<GoogleSpeakResult> =>
      ipcRenderer.invoke(IpcChannels.ai.googleSpeak, text, voiceName),
    googleTranscribe: (audioBase64: string, languageCode: string): Promise<GoogleTranscribeResult> =>
      ipcRenderer.invoke(IpcChannels.ai.googleTranscribe, audioBase64, languageCode),
    inspectImage: (imagePath: string, question: string, requestId?: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.ai.inspectImage, imagePath, question, requestId),
    inspectFolderImages: (dirPath: string, question: string, requestId?: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.ai.inspectFolderImages, dirPath, question, requestId),
    inspectZipImages: (zipPath: string, question: string, requestId?: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.ai.inspectZipImages, zipPath, question, requestId),
    setZapierMcpUrl: (url: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.ai.setZapierMcpUrl, url),
    hasZapierMcpUrl: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.ai.hasZapierMcpUrl),
    listZapierTools: (): Promise<ZapierToolInfo[]> => ipcRenderer.invoke(IpcChannels.ai.listZapierTools)
  },

  agent: {
    onActivity: (callback: (event: AgentActivityEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: AgentActivityEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.agent.activity, listener)
      return () => ipcRenderer.removeListener(IpcChannels.agent.activity, listener)
    },
    onDebateTurn: (callback: (event: DebateTurnEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: DebateTurnEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.agent.debateTurn, listener)
      return () => ipcRenderer.removeListener(IpcChannels.agent.debateTurn, listener)
    },
    onDebateEnded: (callback: (event: DebateEndedEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: DebateEndedEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.agent.debateEnded, listener)
      return () => ipcRenderer.removeListener(IpcChannels.agent.debateEnded, listener)
    }
  },

  aiNetwork: {
    status: (): Promise<AiNetworkStatus> => ipcRenderer.invoke(IpcChannels.aiNetwork.status),
    testGemini: (): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.testGemini),
    listConfiguredGeminiModels: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.listConfiguredGeminiModels),
    addGeminiModel: (modelId: string): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.addGeminiModel, modelId),
    removeGeminiModel: (modelId: string): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.removeGeminiModel, modelId),
    getActiveGeminiModel: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.getActiveGeminiModel),
    setActiveGeminiModel: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.setActiveGeminiModel, modelId),
    listGeminiModels: (): Promise<GeminiModelInfo[]> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.listGeminiModels),
    getVisionModel: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.aiNetwork.getVisionModel),
    setVisionModel: (modelId: string): Promise<void> => ipcRenderer.invoke(IpcChannels.aiNetwork.setVisionModel, modelId),
    isVisionEnabled: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.aiNetwork.isVisionEnabled),
    setVisionEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.setVisionEnabled, enabled),
    getOpenCodeCommand: (): Promise<string> => ipcRenderer.invoke(IpcChannels.aiNetwork.getOpenCodeCommand),
    setOpenCodeCommand: (command: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.setOpenCodeCommand, command),
    isOpenCodeEnabled: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.aiNetwork.isOpenCodeEnabled),
    setOpenCodeEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.setOpenCodeEnabled, enabled),
    getDebateRounds: (): Promise<number> => ipcRenderer.invoke(IpcChannels.aiNetwork.getDebateRounds),
    setDebateRounds: (rounds: number): Promise<void> => ipcRenderer.invoke(IpcChannels.aiNetwork.setDebateRounds, rounds),
    getDifficulty: (): Promise<FlameDifficulty> => ipcRenderer.invoke(IpcChannels.aiNetwork.getDifficulty),
    setDifficulty: (difficulty: FlameDifficulty): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.setDifficulty, difficulty)
  },

  projects: {
    list: (): Promise<ImportedProject[]> => ipcRenderer.invoke(IpcChannels.projects.list),
    import: (): Promise<ImportedProject[]> => ipcRenderer.invoke(IpcChannels.projects.import),
    remove: (id: string): Promise<ImportedProject[]> => ipcRenderer.invoke(IpcChannels.projects.remove, id),
    setPermissions: (id: string, permissions: ProjectPermissions): Promise<ImportedProject[]> =>
      ipcRenderer.invoke(IpcChannels.projects.setPermissions, id, permissions),
    setActive: (projectPath: string): Promise<void> => ipcRenderer.invoke(IpcChannels.projects.setActive, projectPath)
  },

  files: {
    confirmOperation: (operationId: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.files.confirmOperation, operationId),
    readText: (path: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.files.readText, path),
    listDirectory: (path: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.files.listDirectory, path),
    readPdfText: (path: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.files.readPdfText, path)
  },

  minecraft: {
    getConfig: (): Promise<MinecraftConfig> => ipcRenderer.invoke(IpcChannels.minecraft.getConfig),
    saveConfig: (config: MinecraftConfig): Promise<void> => ipcRenderer.invoke(IpcChannels.minecraft.saveConfig, config),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.minecraft.pickFolder),
    listModelPresets: (): Promise<Record<string, string[]>> =>
      ipcRenderer.invoke(IpcChannels.minecraft.listModelPresets),
    start: (): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke(IpcChannels.minecraft.start),
    stop: (): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke(IpcChannels.minecraft.stop),
    getStatus: (): Promise<MinecraftStatus> => ipcRenderer.invoke(IpcChannels.minecraft.getStatus),
    onLog: (cb: (line: MinecraftLogLine) => void): (() => void) => {
      const l = (_: unknown, p: MinecraftLogLine): void => cb(p)
      ipcRenderer.on(IpcChannels.minecraft.onLog, l)
      return () => ipcRenderer.removeListener(IpcChannels.minecraft.onLog, l)
    },
    onStatus: (cb: (status: MinecraftStatus) => void): (() => void) => {
      const l = (_: unknown, p: MinecraftStatus): void => cb(p)
      ipcRenderer.on(IpcChannels.minecraft.onStatus, l)
      return () => ipcRenderer.removeListener(IpcChannels.minecraft.onStatus, l)
    }
  }
}

export type WinPilotApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // `Window.api` is declared globally in ./index.d.ts, so this assignment is
  // type-checked like any other — no suppression needed.
  window.api = api
}