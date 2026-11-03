import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  PlatformInfo,
  UserProfile,
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
  AiNetworkConfig,
  AiNetworkSnapshot,
  ChatMode,
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
  SkillUnlockedEvent,
  AgentStatusEvent,
  FlameDifficulty,
  OrbAccent,
  OrbWindowState,
  ChessPositionTelemetry,
  ChessMoveResult,
  ChessGameReview,
  ChessMatchResult,
  ChessApiProfile,
  ChessArenaState,
  ChessGameMode,
  ChessPlayerProfile,
  ChessPlayersState,
  Combo,
  ComboRunResult,
  ComboProgressEvent,
  DueMessage,
  DueMessageStatus,
  CreateDueMessageInput,
  FlamePluginMeta,
  ImageGenerationOptions,
  GeneratedImageResult,
  McpServerStatus,
  ErrorGuardianIncident,
  HealProposalPayload
} from '@shared/types'

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IpcChannels.app.getVersion),
    getPlatformInfo: (): Promise<PlatformInfo> =>
      ipcRenderer.invoke(IpcChannels.app.getPlatformInfo),
    copyText: (text: string): Promise<void> => ipcRenderer.invoke(IpcChannels.app.copyText, text),
    pickImage: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.app.pickImage),
    pickAnyFile: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.app.pickAnyFile),
    pickAnyFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.app.pickAnyFolder),
    openPath: (targetPath: string): Promise<string> => ipcRenderer.invoke(IpcChannels.app.openPath, targetPath),
    showItemInFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke(IpcChannels.app.showItemInFolder, targetPath)
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
    getIcon: (packageId: string, packageName?: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IpcChannels.winget.getIcon, packageId, packageName),
    getMetadata: (
      packageId: string
    ): Promise<{ icon?: string; description?: string; publisher?: string; homepage?: string }> =>
      ipcRenderer.invoke(IpcChannels.winget.getMetadata, packageId),
    onProgress: (callback: (event: WingetProgressEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: WingetProgressEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.winget.onProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.winget.onProgress, listener)
    }
  },

  system: {
    getSnapshot: (): Promise<SystemSnapshot> => ipcRenderer.invoke(IpcChannels.system.getSnapshot)
  },

  combos: {
    list: (): Promise<Combo[]> => ipcRenderer.invoke(IpcChannels.combos.list),
    save: (payload: {
      id?: string
      name: string
      description?: string
      toDo?: string
      steps?: Combo['steps']
    }): Promise<Combo> => ipcRenderer.invoke(IpcChannels.combos.save, payload),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.combos.delete, id),
    execute: (idOrName: string): Promise<ComboRunResult> =>
      ipcRenderer.invoke(IpcChannels.combos.execute, idOrName),
    onProgress: (callback: (event: ComboProgressEvent) => void): (() => void) => {
      const listener = (_: unknown, payload: ComboProgressEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.combos.onProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.combos.onProgress, listener)
    }
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
    sendPrompt: (prompt: string, model?: ChatModelId, requestId?: string, effort?: 'low' | 'medium' | 'high' | 'auto', mode?: ChatMode): Promise<AiResponse> =>
      ipcRenderer.invoke(IpcChannels.ai.sendPrompt, prompt, model, requestId, effort, mode),
    stopDebate: (): Promise<void> => ipcRenderer.invoke(IpcChannels.ai.stopDebate),
    interrupt: (): Promise<void> => ipcRenderer.invoke(IpcChannels.ai.interrupt),
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
    listZapierTools: (): Promise<ZapierToolInfo[]> => ipcRenderer.invoke(IpcChannels.ai.listZapierTools),
    getOllamaModels: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.ai.getOllamaModels),
    saveModelConfig: (
      config:
        | {
            localModel?: string
            local_model?: string
            cloudModel?: string
            cloud_model?: string
            localKeepAlive?: string
            local_keep_alive?: string
          }
        | string,
      cloudModel?: string
    ): Promise<{ success: boolean; config?: unknown }> =>
      ipcRenderer.invoke(IpcChannels.ai.saveModelConfig, config, cloudModel),
    getModelConfig: (): Promise<{
      localModel: string
      cloudModel: string
      localKeepAlive: string
      raw: Record<string, unknown>
    }> => ipcRenderer.invoke(IpcChannels.ai.getModelConfig)
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
    },
    onSkillUnlocked: (callback: (event: SkillUnlockedEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: SkillUnlockedEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.agent.skillUnlocked, listener)
      return () => ipcRenderer.removeListener(IpcChannels.agent.skillUnlocked, listener)
    },
    onStatusChange: (callback: (event: AgentStatusEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: AgentStatusEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.agent.statusChange, listener)
      return () => ipcRenderer.removeListener(IpcChannels.agent.statusChange, listener)
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
      ipcRenderer.invoke(IpcChannels.aiNetwork.setDifficulty, difficulty),
    getConfig: (): Promise<AiNetworkConfig> => ipcRenderer.invoke(IpcChannels.aiNetwork.getConfig),
    updateConfig: (update: Partial<AiNetworkConfig>): Promise<AiNetworkConfig> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.updateConfig, update),
    getSnapshot: (): Promise<AiNetworkSnapshot> => ipcRenderer.invoke(IpcChannels.aiNetwork.getSnapshot),
    testEndpoint: (endpointId: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.aiNetwork.testEndpoint, endpointId)
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
    getBotState: (): Promise<any> => ipcRenderer.invoke(IpcChannels.minecraft.getBotState),
    onLog: (cb: (line: MinecraftLogLine) => void): (() => void) => {
      const l = (_: unknown, p: MinecraftLogLine): void => cb(p)
      ipcRenderer.on(IpcChannels.minecraft.onLog, l)
      return () => ipcRenderer.removeListener(IpcChannels.minecraft.onLog, l)
    },
    onStatus: (cb: (status: MinecraftStatus) => void): (() => void) => {
      const l = (_: unknown, p: MinecraftStatus): void => cb(p)
      ipcRenderer.on(IpcChannels.minecraft.onStatus, l)
      return () => ipcRenderer.removeListener(IpcChannels.minecraft.onStatus, l)
    },
    onToggleAgentMode: (cb: () => void): (() => void) => {
      const l = (): void => cb()
      ipcRenderer.on('toggle-agent-mode', l)
      return () => ipcRenderer.removeListener('toggle-agent-mode', l)
    }
  },

  chess: {
    // 2-Player Arena & Director (v2.1)
    getState: (): Promise<ChessArenaState> => ipcRenderer.invoke(IpcChannels.chess.getState),
    newGame: (fen?: string): Promise<ChessArenaState> => ipcRenderer.invoke(IpcChannels.chess.newGame, fen),
    undo: (count?: number): Promise<ChessArenaState> => ipcRenderer.invoke(IpcChannels.chess.undo, count),
    playHumanVsAiMove: (move: string, aiProfile?: string): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IpcChannels.chess.playHumanVsAiMove, move, aiProfile),
    directAiTurn: (profileName?: string): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IpcChannels.chess.directAiTurn, profileName),
    runAiVsAiMatch: (
      whiteProfile?: string,
      blackProfile?: string,
      maxPly?: number,
      resetFirst?: boolean
    ): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IpcChannels.chess.runAiVsAiMatch, whiteProfile, blackProfile, maxPly, resetFirst),
    getPlayers: (): Promise<ChessPlayersState> => ipcRenderer.invoke(IpcChannels.chess.getPlayers),
    setPlayers: (payload: {
      game_mode?: ChessGameMode
      player_1?: Partial<ChessPlayerProfile>
      player_2?: Partial<ChessPlayerProfile>
    }): Promise<ChessPlayersState> => ipcRenderer.invoke(IpcChannels.chess.setPlayers, payload),
    saveApiProfile: (profile: {
      name: string
      provider: string
      model: string
      endpoint?: string
      api_key?: string
    }): Promise<ChessPlayersState> => ipcRenderer.invoke(IpcChannels.chess.saveApiProfile, profile),
    listApiProfiles: (): Promise<ChessApiProfile[]> => ipcRenderer.invoke(IpcChannels.chess.listApiProfiles),

    // Low-level & compatibility
    startServer: (port?: number): Promise<{ success: boolean; message: string; port: number }> =>
      ipcRenderer.invoke(IpcChannels.chess.startServer, port),
    stopServer: (): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.chess.stopServer),
    getStatus: (): Promise<{ running: boolean; port: number }> =>
      ipcRenderer.invoke(IpcChannels.chess.getStatus),
    getPosition: (): Promise<ChessPositionTelemetry> =>
      ipcRenderer.invoke(IpcChannels.chess.getPosition),
    makeMove: (move: string): Promise<ChessMoveResult> =>
      ipcRenderer.invoke(IpcChannels.chess.makeMove, move),
    getReview: (): Promise<ChessGameReview> =>
      ipcRenderer.invoke(IpcChannels.chess.getReview),
    runMatch: (
      whiteProfile: string,
      blackProfile: string,
      maxPly?: number,
      resetFirst?: boolean
    ): Promise<ChessMatchResult> =>
      ipcRenderer.invoke(IpcChannels.chess.runMatch, whiteProfile, blackProfile, maxPly, resetFirst),
    listApis: (): Promise<{ profiles: ChessApiProfile[] }> =>
      ipcRenderer.invoke(IpcChannels.chess.listApis),
    saveApi: (profile: {
      name: string
      provider: string
      model: string
      endpoint?: string
      api_key?: string
    }): Promise<{ status: string; profile: ChessApiProfile }> =>
      ipcRenderer.invoke(IpcChannels.chess.saveApi, profile)
  },

  rea: {
    inspectFile: (filePath: string, requestId?: string) =>
      ipcRenderer.invoke(IpcChannels.rea.inspectFile, filePath, requestId),
    inspectAsar: (asarPath: string, requestId?: string) =>
      ipcRenderer.invoke(IpcChannels.rea.inspectAsar, asarPath, requestId),
    auditWorkspace: (workspaceDir?: string, requestId?: string) =>
      ipcRenderer.invoke(IpcChannels.rea.auditWorkspace, workspaceDir, requestId),
    generateFolder: (
      args: {
        folderName: string
        baseDir?: string
        files?: Record<string, string>
        subFolders?: string[]
      },
      requestId?: string
    ) => ipcRenderer.invoke(IpcChannels.rea.generateFolder, args, requestId),
    exportZip: (
      args: {
        sourcePath: string
        outputZipPath?: string
      },
      requestId?: string
    ) => ipcRenderer.invoke(IpcChannels.rea.exportZip, args, requestId),
    codeOnEvidence: (
      args: {
        task: string
        targetPath?: string
        workspaceDir?: string
      },
      requestId?: string
    ) => ipcRenderer.invoke(IpcChannels.rea.codeOnEvidence, args, requestId)
  },

  dueMessages: {
    list: (filter?: { status?: DueMessageStatus; workspaceContext?: string }): Promise<DueMessage[]> =>
      ipcRenderer.invoke(IpcChannels.dueMessages.list, filter),
    add: (input: CreateDueMessageInput): Promise<DueMessage> =>
      ipcRenderer.invoke(IpcChannels.dueMessages.add, input),
    complete: (idOrTitle: string): Promise<DueMessage | null> =>
      ipcRenderer.invoke(IpcChannels.dueMessages.complete, idOrTitle),
    dismiss: (idOrTitle: string): Promise<DueMessage | null> =>
      ipcRenderer.invoke(IpcChannels.dueMessages.dismiss, idOrTitle),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.dueMessages.delete, id),
    onUpdate: (callback: (messages: DueMessage[]) => void): (() => void) => {
      const listener = (_: unknown, payload: DueMessage[]): void => callback(payload)
      ipcRenderer.on(IpcChannels.dueMessages.onUpdate, listener)
      return () => ipcRenderer.removeListener(IpcChannels.dueMessages.onUpdate, listener)
    }
  },

  plugins: {
    list: (): Promise<FlamePluginMeta[]> =>
      ipcRenderer.invoke(IpcChannels.plugins.list),
    toggle: (pluginId: string, targetState?: boolean): Promise<{ success: boolean; plugin: FlamePluginMeta }> =>
      ipcRenderer.invoke(IpcChannels.plugins.toggle, pluginId, targetState),
    getState: (pluginId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannels.plugins.getState, pluginId),
    onStateChange: (callback: (plugins: FlamePluginMeta[]) => void): (() => void) => {
      const listener = (_: unknown, payload: FlamePluginMeta[]): void => callback(payload)
      ipcRenderer.on(IpcChannels.plugins.onStateChange, listener)
      return () => ipcRenderer.removeListener(IpcChannels.plugins.onStateChange, listener)
    }
  },

  image: {
    generate: (input: ImageGenerationOptions | string): Promise<GeneratedImageResult> =>
      ipcRenderer.invoke(IpcChannels.image.generate, input)
  },

  mcp: {
    listServers: (): Promise<McpServerStatus[]> =>
      ipcRenderer.invoke(IpcChannels.mcp.listServers),
    getStatus: (): Promise<McpServerStatus[]> =>
      ipcRenderer.invoke(IpcChannels.mcp.getStatus),
    reloadServer: (id: string): Promise<McpServerStatus[]> =>
      ipcRenderer.invoke(IpcChannels.mcp.reloadServer, id),
    toggleServer: (id: string, enabled: boolean): Promise<McpServerStatus[]> =>
      ipcRenderer.invoke(IpcChannels.mcp.toggleServer, id, enabled)
  },

  guardian: {
    reportError: (errorMessage: string, stack?: string, source?: string): Promise<unknown> =>
      ipcRenderer.invoke(IpcChannels.guardian.reportError, errorMessage, stack, source),
    applyHeal: (runId?: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IpcChannels.guardian.applyHeal, runId),
    getIncidents: (): Promise<ErrorGuardianIncident[]> =>
      ipcRenderer.invoke(IpcChannels.guardian.criticalError),
    onCriticalError: (callback: (incident: ErrorGuardianIncident) => void): (() => void) => {
      const listener = (_: unknown, payload: ErrorGuardianIncident): void => callback(payload)
      ipcRenderer.on(IpcChannels.guardian.criticalError, listener)
      return () => ipcRenderer.removeListener(IpcChannels.guardian.criticalError, listener)
    },
    onHealProposal: (callback: (payload: HealProposalPayload) => void): (() => void) => {
      const listener = (_: unknown, payload: HealProposalPayload): void => callback(payload)
      ipcRenderer.on(IpcChannels.guardian.healProposal, listener)
      return () => ipcRenderer.removeListener(IpcChannels.guardian.healProposal, listener)
    }
  },

  whatsapp: {
    getStatus: (): Promise<{ connected: boolean; status: 'disconnected' | 'qr_ready' | 'connected'; qrDataUrl: string | null }> =>
      ipcRenderer.invoke('whatsapp:get-status'),
    connect: (): Promise<{ connected: boolean; status: 'disconnected' | 'qr_ready' | 'connected'; qrDataUrl: string | null }> =>
      ipcRenderer.invoke('whatsapp:connect'),
    disconnect: (): Promise<{ connected: boolean; status: 'disconnected' | 'qr_ready' | 'connected'; qrDataUrl: string | null }> =>
      ipcRenderer.invoke('whatsapp:disconnect'),
    onQrUpdated: (
      callback: (data: { connected: boolean; status: 'disconnected' | 'qr_ready' | 'connected'; qrDataUrl: string | null }) => void
    ): (() => void) => {
      const listener = (_: unknown, data: any): void => callback(data)
      ipcRenderer.on('whatsapp:qr-updated', listener)
      return () => ipcRenderer.removeListener('whatsapp:qr-updated', listener)
    }
  },

  profile: {
    get: (): Promise<UserProfile> => ipcRenderer.invoke(IpcChannels.profile.get),
    set: (patch: Partial<UserProfile>): Promise<UserProfile> => ipcRenderer.invoke(IpcChannels.profile.set, patch),
    onUpdated: (callback: (profile: UserProfile) => void): (() => void) => {
      const listener = (_: unknown, data: UserProfile): void => callback(data)
      ipcRenderer.on(IpcChannels.profile.onUpdated, listener)
      return () => ipcRenderer.removeListener(IpcChannels.profile.onUpdated, listener)
    }
  }
}

export type WinPilotApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('winpilot', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // `Window.api` is declared globally in ./index.d.ts, so this assignment is
  // type-checked like any other — no suppression needed.
  window.api = api
  ;(window as unknown as { winpilot: typeof api }).winpilot = api
}