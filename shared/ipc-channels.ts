/**
 * Central registry of IPC channel names.
 *
 * Why this file exists:
 * Main and renderer are separate processes that only talk through strings
 * (channel names). Keeping every channel name here means both sides always
 * agree on the contract, and a typo becomes a compile error instead of a
 * silent runtime bug.
 *
 * TODO: As each feature is implemented, add its channels here first,
 * then wire the handler in `src/main/ipc/` and the caller in preload.
 */
export const IpcChannels = {
  app: {
    getVersion: 'app:getVersion',
    getPlatformInfo: 'app:getPlatformInfo',
    copyText: 'app:copyText',
    pickImage: 'app:pickImage',
    pickAnyFile: 'app:pickAnyFile',
    pickAnyFolder: 'app:pickAnyFolder',
    openPath: 'app:openPath',
    showItemInFolder: 'app:showItemInFolder'
  },

  profile: {
    get: 'profile:get',
    set: 'profile:set',
    onUpdated: 'profile:updated'
  },

  contacts: {
    list: 'contacts:list',
    add: 'contacts:add',
    remove: 'contacts:remove'
  },

  // Window chrome controls for the custom frameless title bar.
  // This is app-shell plumbing (not a "feature"), so it's implemented for
  // real rather than left as a TODO — without it the title bar's own
  // buttons would do nothing.
  window: {
    minimize: 'window:minimize',
    maximizeToggle: 'window:maximizeToggle',
    close: 'window:close',
    onMaximizedChange: 'window:onMaximizedChange'
  },

  // Floating orb companion. Window creation, native flags and the shared
  // preferences stay in the main process (src/main/services/orb); these
  // channels are a narrow, validated bridge for the orb renderer and the
  // main window's Settings page.
  orb: {
    // Renderer -> main (commands)
    enable: 'orb:enable',
    disable: 'orb:disable',
    toggle: 'orb:toggle',
    getState: 'orb:getState',
    setAlwaysOnTop: 'orb:setAlwaysOnTop',
    setAccent: 'orb:setAccent',
    setAlwaysListening: 'orb:setAlwaysListening',
    openMain: 'orb:openMain',
    moveBy: 'orb:moveBy',
    setPanelSize: 'orb:setPanelSize',
    dragEnd: 'orb:dragEnd',
    // Main -> renderer (events)
    onVisibility: 'orb:onVisibility',
    onPrefs: 'orb:onPrefs',
    /** Fired to the PET window when the user has been idle long enough. */
    onProactive: 'orb:onProactive',
    /** Fire-and-forget "the user did something" ping from either renderer. */
    activity: 'orb:activity'
  },

  winget: {
    listInstalled: 'winget:listInstalled',
    listUpgradable: 'winget:listUpgradable',
    search: 'winget:search',
    install: 'winget:install',
    update: 'winget:update',
    uninstall: 'winget:uninstall',
    getIcon: 'winget:getIcon',
    getMetadata: 'winget:getMetadata',
    // Progress/log events are pushed from main -> renderer, not requested.
    onProgress: 'winget:onProgress'
  },

  // System metrics (CPU/GPU/RAM/disk/network/battery)
  system: {
    getSnapshot: 'system:getSnapshot'
  },

  combos: {
    list: 'combos:list',
    save: 'combos:save',
    delete: 'combos:delete',
    execute: 'combos:execute',
    onProgress: 'combos:onProgress'
  },

  memory: {
    list: 'memory:list',
    add: 'memory:add',
    remove: 'memory:remove'
  },

  agent: {
    activity: 'agent:activity',
    debateTurn: 'agent:debateTurn',
    debateEnded: 'agent:debateEnded',
    skillUnlocked: 'agent:skillUnlocked',
    statusChange: 'agent:statusChange'
  },

  // TODO: AI Assistant (local model via Ollama)
  ai: {
    sendPrompt: 'ai:sendPrompt',
    startDebate: 'ai:startDebate',
    stopDebate: 'ai:stopDebate',
    interrupt: 'ai:interrupt',
    checkStatus: 'ai:checkStatus',
    setGoogleApiKey: 'ai:setGoogleApiKey',
    hasGoogleApiKey: 'ai:hasGoogleApiKey',
    googleKeyCount: 'ai:googleKeyCount',
    googleSpeak: 'ai:googleSpeak',
    googleTranscribe: 'ai:googleTranscribe',
    inspectImage: 'ai:inspectImage',
    inspectFolderImages: 'ai:inspectFolderImages',
    inspectZipImages: 'ai:inspectZipImages',
    setZapierMcpUrl: 'ai:setZapierMcpUrl',
    hasZapierMcpUrl: 'ai:hasZapierMcpUrl',
    listZapierTools: 'ai:listZapierTools',
    getOllamaModels: 'get-ollama-models',
    saveModelConfig: 'save-model-config',
    getModelConfig: 'get-model-config'
  },

  aiNetwork: {
    status: 'aiNetwork:status',
    testGemini: 'aiNetwork:testGemini',
    listConfiguredGeminiModels: 'aiNetwork:listConfiguredGeminiModels',
    addGeminiModel: 'aiNetwork:addGeminiModel',
    removeGeminiModel: 'aiNetwork:removeGeminiModel',
    getActiveGeminiModel: 'aiNetwork:getActiveGeminiModel',
    setActiveGeminiModel: 'aiNetwork:setActiveGeminiModel',
    listGeminiModels: 'aiNetwork:listGeminiModels',
    getVisionModel: 'aiNetwork:getVisionModel',
    setVisionModel: 'aiNetwork:setVisionModel',
    isVisionEnabled: 'aiNetwork:isVisionEnabled',
    setVisionEnabled: 'aiNetwork:setVisionEnabled',
    getOpenCodeCommand: 'aiNetwork:getOpenCodeCommand',
    setOpenCodeCommand: 'aiNetwork:setOpenCodeCommand',
    isOpenCodeEnabled: 'aiNetwork:isOpenCodeEnabled',
    setOpenCodeEnabled: 'aiNetwork:setOpenCodeEnabled',
    getDebateRounds: 'aiNetwork:getDebateRounds',
    setDebateRounds: 'aiNetwork:setDebateRounds',
    getDifficulty: 'aiNetwork:getDifficulty',
    setDifficulty: 'aiNetwork:setDifficulty',
    getConfig: 'aiNetwork:getConfig',
    updateConfig: 'aiNetwork:updateConfig',
    getSnapshot: 'aiNetwork:getSnapshot',
    testEndpoint: 'aiNetwork:testEndpoint'
  },

  files: {
    confirmOperation: 'files:confirmOperation',
    readText: 'files:readText',
    listDirectory: 'files:listDirectory',
    readPdfText: 'files:readPdfText'
  },

  projects: {
    list: 'projects:list',
    import: 'projects:import',
    remove: 'projects:remove',
    setPermissions: 'projects:setPermissions',
    setActive: 'projects:setActive'
  },

  minecraft: {
    getConfig: 'minecraft:getConfig',
    saveConfig: 'minecraft:saveConfig',
    pickFolder: 'minecraft:pickFolder',
    listModelPresets: 'minecraft:listModelPresets',
    start: 'minecraft:start',
    stop: 'minecraft:stop',
    getStatus: 'minecraft:getStatus',
    onLog: 'minecraft:onLog',
    onStatus: 'minecraft:onStatus',
    getBotState: 'minecraft:getBotState'
  },

  project: {
    get: 'project:get',
    pickFolder: 'project:pickFolder',
    openInVsCode: 'project:openInVsCode'
  },

  chess: {
    // Arena & Director high-level channels (v2.1)
    getState: 'chess:getState',
    newGame: 'chess:newGame',
    undo: 'chess:undo',
    makeMove: 'chess:makeMove',
    playHumanVsAiMove: 'chess:playHumanVsAiMove',
    directAiTurn: 'chess:directAiTurn',
    runAiVsAiMatch: 'chess:runAiVsAiMatch',
    getPlayers: 'chess:getPlayers',
    setPlayers: 'chess:setPlayers',
    saveApiProfile: 'chess:saveApiProfile',
    listApiProfiles: 'chess:listApiProfiles',

    // Low-level & engine server channels
    startServer: 'chess:startServer',
    stopServer: 'chess:stopServer',
    getStatus: 'chess:getStatus',
    getPosition: 'chess:getPosition',
    getReview: 'chess:getReview',
    runMatch: 'chess:runMatch',
    listApis: 'chess:listApis',
    saveApi: 'chess:saveApi'
  },

  rea: {
    inspectFile: 'rea:inspectFile',
    inspectAsar: 'rea:inspectAsar',
    auditWorkspace: 'rea:auditWorkspace',
    generateFolder: 'rea:generateFolder',
    exportZip: 'rea:exportZip',
    codeOnEvidence: 'rea:codeOnEvidence'
  },

  dueMessages: {
    list: 'dueMessages:list',
    add: 'dueMessages:add',
    complete: 'dueMessages:complete',
    dismiss: 'dueMessages:dismiss',
    delete: 'dueMessages:delete',
    onUpdate: 'dueMessages:onUpdate'
  },

  plugins: {
    list: 'plugins:list',
    toggle: 'plugins:toggle',
    getState: 'plugins:getState',
    onStateChange: 'plugins:onStateChange'
  },

  image: {
    generate: 'image:generate'
  },

  mcp: {
    listServers: 'mcp:listServers',
    getStatus: 'mcp:getStatus',
    reloadServer: 'mcp:reloadServer',
    toggleServer: 'mcp:toggleServer',
    callTool: 'mcp:callTool',
    onStatusChange: 'mcp:onStatusChange'
  },

  guardian: {
    criticalError: 'guardian:criticalError',
    healProposal: 'guardian:healProposal',
    reportError: 'guardian:reportError',
    applyHeal: 'guardian:applyHeal',
    onCriticalError: 'guardian:onCriticalError',
    onHealProposal: 'guardian:onHealProposal'
  }
} as const
