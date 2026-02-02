import type {
  ClientObsState,
  FilterInfo,
  HotkeyInfo,
  InputInfo,
  ObsCommand,
  ObsEvent,
  ObsStats,
  SceneInfo,
  SourceInfo,
  TransitionInfo,
} from "some-types-utils"
import { create } from "zustand"
import { useShallow } from "zustand/shallow"

type CommandSender = (cmd: ObsCommand) => Promise<void>

// ============================================================================
// TEMPORAL LAYERS - Separated by update frequency
// ============================================================================

// 🔴 HIGH-FREQUENCY STATE (updates on every stats tick - ~1Hz)
type StatsState = {
  stats: ObsStats
  streamTimecode: string
  recordTimecode: string
}

// 🟢 LOW-FREQUENCY STATE (updates only on user actions or OBS events)
type CoreObsState = {
  // Connection
  obsVersion: string
  websocketVersion: string
  identified: boolean

  // Stream/Record status (boolean state only, not timecodes)
  streaming: boolean
  recording: boolean

  // Scenes
  scenes: Array<SceneInfo>
  currentScene: string

  // Sources and Inputs
  sources: Array<SourceInfo>
  inputs: Array<InputInfo>

  // Audio
  audioMutes: Record<string, boolean>
  audioVolumes: Record<string, { volumeDb: number; volumeMul: number }>

  // Profiles and Collections
  profiles: Array<string>
  currentProfile: string
  collections: Array<string>
  currentCollection: string

  // Features
  virtualCamActive: boolean
  replayBufferActive: boolean
  studioModeEnabled: boolean

  // Transitions
  currentTransitionName: string
  currentTransitionDuration: number
  transitions: Array<TransitionInfo>
  lastTransitionStartedName?: string
  lastTransitionEndedName?: string

  // Filters and Hotkeys
  sourceFilters: Record<string, Array<FilterInfo>>
  hotkeys: Array<HotkeyInfo>

  // Scene Items
  sceneItemEnableStates: Record<string, Record<number, boolean>>

  // Unknown events
  lastUnknownResponse?: { requestType: string; data: unknown }
  lastUnknownEvent?: { eventType: string; data: unknown }
}

// ============================================================================
// STORE DEFINITION
// ============================================================================

type ObsStoreState = {
  // === TEMPORAL LAYERS ===
  stats: StatsState
  core: CoreObsState

  // === CONNECTION STATE ===
  isConnected: boolean
  error: string | null

  // === RAW STATE (for debugging) ===
  rawState: ClientObsState

  // === INTERNAL ===
  _commandSender: CommandSender | null

  // === INTERNAL SETTERS (hook-only) ===
  _handleEvent: (event: ObsEvent) => void
  _setConnectionStatus: (isConnected: boolean, error?: string | null) => void
  _setCommandSender: (sender: CommandSender | null) => void
  _reset: () => void

  // === COMMANDS ===
  startStreaming: () => Promise<void>
  stopStreaming: () => Promise<void>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  switchScene: (scene: string) => Promise<void>
  setInputMute: (inputName: string, muted: boolean) => Promise<void>
  setInputVolume: (inputName: string, volumeDb: number) => Promise<void>
  toggleStudioMode: () => Promise<void>
  toggleVirtualCamera: () => Promise<void>
  toggleReplayBuffer: () => Promise<void>
  sendCustomCommand: (data: unknown) => Promise<void>
}

const defaultStatsState: StatsState = {
  stats: {
    cpuUsage: 0,
    memoryUsage: 0,
    availableDiskSpace: 0,
    activeFps: 0,
    averageFrameTime: 0,
    renderTotalFrames: 0,
    renderMissedFrames: 0,
    outputTotalFrames: 0,
    outputSkippedFrames: 0,
    webSocketSessionIncomingMessages: 0,
    webSocketSessionOutgoingMessages: 0,
  },
  streamTimecode: "00:00:00.000",
  recordTimecode: "00:00:00.000",
}

const defaultCoreState: CoreObsState = {
  obsVersion: "Unknown",
  websocketVersion: "Unknown",
  identified: false,
  streaming: false,
  recording: false,
  scenes: [],
  currentScene: "Unknown",
  sources: [],
  inputs: [],
  audioMutes: {},
  audioVolumes: {},
  profiles: [],
  currentProfile: "Unknown",
  collections: [],
  currentCollection: "Unknown",
  virtualCamActive: false,
  replayBufferActive: false,
  studioModeEnabled: false,
  currentTransitionName: "Cut",
  currentTransitionDuration: 300,
  transitions: [],
  sourceFilters: {},
  hotkeys: [],
  sceneItemEnableStates: {},
}

export const defaultClientObsState: ClientObsState = {
  ...defaultCoreState,
  ...defaultStatsState,
}

// Helper: Deep equality check for objects (simple version)
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object") return false
  if (a === null || b === null) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!keysB.includes(key)) return false
    if (!deepEqual(a[key], b[key])) return false
  }

  return true
}

// Helper: Apply OBS event to state (replaces updateClientObsState)
function applyObsEvent(state: ClientObsState, event: ObsEvent): ClientObsState {
  switch (event.type) {
    case "streamStatusResponse":
    case "streamStateChanged":
      return {
        ...state,
        streaming: event.data.streaming ?? state.streaming,
        streamTimecode: event.data.timecode ?? state.streamTimecode,
      }
    case "recordingStatusResponse":
    case "recordStateChanged":
      return {
        ...state,
        recording: event.data.recording ?? state.recording,
        recordTimecode: event.data.timecode ?? state.recordTimecode,
      }
    case "sceneListResponse":
      return {
        ...state,
        scenes: event.data.scenes ?? state.scenes,
        currentScene: event.data.currentScene ?? state.currentScene,
      }
    case "currentSceneResponse":
    case "currentProgramSceneChanged":
      return {
        ...state,
        currentScene: event.data.sceneName ?? state.currentScene,
      }
    case "sourcesListResponse":
      return {
        ...state,
        sources: event.data.sources ?? state.sources,
      }
    case "inputListResponse":
      return {
        ...state,
        inputs: event.data.inputs ?? state.inputs,
      }
    case "audioMuteResponse":
    case "inputMuteStateChanged":
      if (
        event.data.inputName !== undefined &&
        event.data.muted !== undefined
      ) {
        return {
          ...state,
          audioMutes: {
            ...state.audioMutes,
            [event.data.inputName]: event.data.muted,
          },
        }
      }
      return state
    case "audioVolumeResponse":
    case "inputVolumeChanged":
      if (
        event.data.inputName !== undefined &&
        event.data.volumeDb !== undefined &&
        event.data.volumeMul !== undefined
      ) {
        return {
          ...state,
          audioVolumes: {
            ...state.audioVolumes,
            [event.data.inputName]: {
              volumeDb: event.data.volumeDb,
              volumeMul: event.data.volumeMul,
            },
          },
        }
      }
      return state
    case "profileListResponse":
      return {
        ...state,
        profiles: event.data.profiles ?? state.profiles,
        currentProfile: event.data.currentProfile ?? state.currentProfile,
      }
    case "currentProfileResponse":
      return {
        ...state,
        currentProfile: event.data.profileName ?? state.currentProfile,
      }
    case "sceneCollectionListResponse":
      return {
        ...state,
        collections: event.data.collections ?? state.collections,
        currentCollection:
          event.data.currentCollection ?? state.currentCollection,
      }
    case "currentCollectionResponse":
      return {
        ...state,
        currentCollection: event.data.collectionName ?? state.currentCollection,
      }
    case "virtualCamStatusResponse":
    case "virtualcamStateChanged":
      return {
        ...state,
        virtualCamActive: event.data.active ?? state.virtualCamActive,
      }
    case "replayBufferStatusResponse":
    case "replayBufferStateChanged":
      return {
        ...state,
        replayBufferActive: event.data.active ?? state.replayBufferActive,
      }
    case "studioModeResponse":
    case "studioModeStateChanged":
      return {
        ...state,
        studioModeEnabled: event.data.enabled ?? state.studioModeEnabled,
      }
    case "statsResponse":
      return {
        ...state,
        stats: event.data.stats ?? state.stats,
      }
    case "currentTransitionResponse":
      return {
        ...state,
        currentTransitionName:
          event.data.transitionName ?? state.currentTransitionName,
        currentTransitionDuration:
          event.data.transitionDuration ?? state.currentTransitionDuration,
      }
    case "currentSceneTransitionChanged":
      return {
        ...state,
        currentTransitionName:
          event.data.transitionName ?? state.currentTransitionName,
      }
    case "transitionListResponse":
      return {
        ...state,
        transitions: event.data.transitions ?? state.transitions,
      }
    case "sceneTransitionStarted":
      return {
        ...state,
        lastTransitionStartedName: event.data.transitionName,
      }
    case "sceneTransitionEnded":
      return {
        ...state,
        lastTransitionEndedName: event.data.transitionName,
      }
    case "filterListResponse":
      if (event.data.sourceName && event.data.filters) {
        return {
          ...state,
          sourceFilters: {
            ...state.sourceFilters,
            [event.data.sourceName]: event.data.filters,
          },
        }
      }
      return state
    case "hotkeyListResponse":
      return {
        ...state,
        hotkeys: event.data.hotkeys ?? state.hotkeys,
      }
    case "versionResponse":
      return {
        ...state,
        obsVersion: event.data.obsVersion ?? state.obsVersion,
        websocketVersion: event.data.websocketVersion ?? state.websocketVersion,
      }
    case "hello":
      return {
        ...state,
        obsVersion: event.data.obsVersion ?? state.obsVersion,
      }
    case "identified":
      return {
        ...state,
        identified: true,
      }
    case "sceneItemEnableStateChanged":
      if (
        event.data.sceneName !== undefined &&
        event.data.itemId !== undefined &&
        event.data.enabled !== undefined
      ) {
        return {
          ...state,
          sceneItemEnableStates: {
            ...state.sceneItemEnableStates,
            [event.data.sceneName]: {
              ...(state.sceneItemEnableStates[event.data.sceneName] || {}),
              [event.data.itemId]: event.data.enabled,
            },
          },
        }
      }
      return state
    case "unknownResponse":
      return {
        ...state,
        lastUnknownResponse: {
          requestType: event.data.requestType ?? "unknown",
          data: event.data.data,
        },
      }
    case "unknownEvent":
      return {
        ...state,
        lastUnknownEvent: {
          eventType: event.data.eventType ?? "unknown",
          data: event.data.data,
        },
      }
    default:
      return state
  }
}

export const useObsStore = create<ObsStoreState>((set, get) => ({
  // --- Initial state ---
  stats: defaultStatsState,
  core: defaultCoreState,
  isConnected: false,
  error: null,
  rawState: defaultClientObsState,
  _commandSender: null,

  // --- Internal setters ---
  _handleEvent: (event) =>
    set((prev) => {
      // Apply event to raw state
      const next = applyObsEvent(prev.rawState, event)

      // Extract stats state (high-frequency)
      const nextStats: StatsState = {
        stats: next.stats,
        streamTimecode: next.streamTimecode,
        recordTimecode: next.recordTimecode,
      }

      // Extract core state (low-frequency)
      const nextCore: CoreObsState = {
        obsVersion: next.obsVersion,
        websocketVersion: next.websocketVersion,
        identified: next.identified,
        streaming: next.streaming,
        recording: next.recording,
        scenes: next.scenes,
        currentScene: next.currentScene,
        sources: next.sources,
        inputs: next.inputs,
        audioMutes: next.audioMutes,
        audioVolumes: next.audioVolumes,
        profiles: next.profiles,
        currentProfile: next.currentProfile,
        collections: next.collections,
        currentCollection: next.currentCollection,
        virtualCamActive: next.virtualCamActive,
        replayBufferActive: next.replayBufferActive,
        studioModeEnabled: next.studioModeEnabled,
        currentTransitionName: next.currentTransitionName,
        currentTransitionDuration: next.currentTransitionDuration,
        transitions: next.transitions,
        lastTransitionStartedName: next.lastTransitionStartedName,
        lastTransitionEndedName: next.lastTransitionEndedName,
        sourceFilters: next.sourceFilters,
        hotkeys: next.hotkeys,
        sceneItemEnableStates: next.sceneItemEnableStates,
        lastUnknownResponse: next.lastUnknownResponse,
        lastUnknownEvent: next.lastUnknownEvent,
      }

      // Stats ALWAYS update (high-frequency)
      // Core ONLY updates if changed (low-frequency)
      const coreChanged = !deepEqual(prev.core, nextCore)

      return {
        rawState: next,
        stats: nextStats,
        core: coreChanged ? nextCore : prev.core,
      }
    }),

  _setConnectionStatus: (isConnected, error = null) =>
    set({ isConnected, error }),

  _setCommandSender: (sender) => set({ _commandSender: sender }),

  _reset: () =>
    set({
      stats: defaultStatsState,
      core: defaultCoreState,
      rawState: defaultClientObsState,
      isConnected: false,
      error: null,
    }),

  // --- Commands ---
  startStreaming: async () => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 startStreaming called", {
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("startStreaming")
    await _commandSender({ type: "startStream" })
  },

  stopStreaming: async () => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 stopStreaming called", {
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("stopStreaming")
    await _commandSender({ type: "stopStream" })
  },

  startRecording: async () => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 startRecording called", {
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("startRecording")
    await _commandSender({ type: "startRecording" })
  },

  stopRecording: async () => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 stopRecording called", {
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("stopRecording")
    await _commandSender({ type: "stopRecording" })
  },

  switchScene: async (scene: string) => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 switchScene called", {
      scene,
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("switchScene")
    await _commandSender({ type: "switchScene", data: scene })
  },

  setInputMute: async (inputName: string, muted: boolean) => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 setInputMute called", {
      inputName,
      muted,
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("setInputMute")
    await _commandSender({ type: "setInputMute", data: [inputName, muted] })
  },

  setInputVolume: async (inputName: string, volumeDb: number) => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 setInputVolume called", {
      inputName,
      volumeDb,
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("setInputVolume")
    await _commandSender({
      type: "setInputVolume",
      data: [inputName, volumeDb],
    })
  },

  toggleStudioMode: async () => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 toggleStudioMode called", {
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("toggleStudioMode")
    await _commandSender({ type: "toggleStudioMode" })
  },

  toggleVirtualCamera: async () => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 toggleVirtualCamera called", {
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("toggleVirtualCamera")
    await _commandSender({ type: "toggleVirtualCamera" })
  },

  toggleReplayBuffer: async () => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 toggleReplayBuffer called", {
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("toggleReplayBuffer")
    await _commandSender({ type: "toggleReplayBuffer" })
  },

  sendCustomCommand: async (data: unknown) => {
    const { _commandSender, isConnected } = get()
    console.log("🎥 sendCustomCommand called", {
      data,
      hasSender: !!_commandSender,
      isConnected,
    })
    if (!_commandSender) return warn("sendCustomCommand")
    await _commandSender({ type: "custom", data })
  },
}))

function warn(action: string) {
  console.warn(`Cannot ${action}: OBS not connected`)
}

// ============================================================================
// SELECTORS - Organized by temporal contract
// ============================================================================

// -----------------------------------------------------------------------------
// 🔴 HIGH-FREQUENCY SELECTORS (explicit opt-in, may rerender frequently)
// Use these ONLY for: timecode displays, stats monitoring, performance metrics
// -----------------------------------------------------------------------------

export const selectStats = (s: ObsStoreState): ObsStats => s.stats.stats

export const useObsStats = () => useObsStore(useShallow(selectStats))

export const selectStreamTimecode = (s: ObsStoreState): string =>
  s.stats.streamTimecode

export const useStreamTimecode = () => useObsStore(selectStreamTimecode)

export const selectRecordTimecode = (s: ObsStoreState): string =>
  s.stats.recordTimecode

export const useRecordTimecode = () => useObsStore(selectRecordTimecode)

// Individual stat selectors (for targeted subscriptions)
export const selectCpuUsage = (s: ObsStoreState): number =>
  s.stats.stats.cpuUsage

export const useCpuUsage = () => useObsStore(selectCpuUsage)

export const selectMemoryUsage = (s: ObsStoreState): number =>
  s.stats.stats.memoryUsage

export const useMemoryUsage = () => useObsStore(selectMemoryUsage)

export const selectActiveFps = (s: ObsStoreState): number =>
  s.stats.stats.activeFps

export const useActiveFps = () => useObsStore(selectActiveFps)

// -----------------------------------------------------------------------------
// 🟢 LOW-FREQUENCY SELECTORS (default for UI, NO frequent rerenders)
// Use these for: layouts, scene lists, input controls, UI state
// -----------------------------------------------------------------------------

// Connection
export const selectIsConnected = (s: ObsStoreState): boolean => s.isConnected

export const useIsConnected = () => useObsStore(selectIsConnected)

export const selectConnectionInfo = (s: ObsStoreState) => ({
  isConnected: s.isConnected,
  error: s.error,
  obsVersion: s.core.obsVersion,
  websocketVersion: s.core.websocketVersion,
  identified: s.core.identified,
})

export const useConnectionInfo = () =>
  useObsStore(useShallow(selectConnectionInfo))

// Stream/Record status (boolean only)
export const selectIsStreaming = (s: ObsStoreState): boolean => s.core.streaming

export const useIsStreaming = () => useObsStore(selectIsStreaming)

export const selectIsRecording = (s: ObsStoreState): boolean => s.core.recording

export const useIsRecording = () => useObsStore(selectIsRecording)

export const selectStreamRecordStatus = (s: ObsStoreState) => ({
  streaming: s.core.streaming,
  recording: s.core.recording,
})

export const useStreamRecordStatus = () =>
  useObsStore(useShallow(selectStreamRecordStatus))

// Scenes
export const selectScenes = (s: ObsStoreState): Array<SceneInfo> =>
  s.core.scenes

export const useScenes = () => useObsStore(useShallow(selectScenes))

export const selectCurrentScene = (s: ObsStoreState): string =>
  s.core.currentScene

export const useCurrentScene = () => useObsStore(selectCurrentScene)

export const selectSceneInfo = (s: ObsStoreState) => ({
  scenes: s.core.scenes,
  currentScene: s.core.currentScene,
})

export const useSceneInfo = () => useObsStore(useShallow(selectSceneInfo))

// Sources and Inputs
export const selectSources = (s: ObsStoreState): Array<SourceInfo> =>
  s.core.sources

export const useSources = () => useObsStore(useShallow(selectSources))

export const selectInputs = (s: ObsStoreState): Array<InputInfo> =>
  s.core.inputs

export const useInputs = () => useObsStore(useShallow(selectInputs))

// Audio
export const selectAudioMutes = (s: ObsStoreState): Record<string, boolean> =>
  s.core.audioMutes

export const useAudioMutes = () => useObsStore(useShallow(selectAudioMutes))

export const selectAudioVolumes = (
  s: ObsStoreState
): Record<string, { volumeDb: number; volumeMul: number }> =>
  s.core.audioVolumes

export const useAudioVolumes = () => useObsStore(useShallow(selectAudioVolumes))

export const selectInputAudio = (inputName: string) => (s: ObsStoreState) => ({
  muted: s.core.audioMutes[inputName] ?? false,
  volume: s.core.audioVolumes[inputName] ?? { volumeDb: 0, volumeMul: 1 },
})

export const useInputAudio = (inputName: string) =>
  useObsStore(useShallow(selectInputAudio(inputName)))

// Profiles and Collections
export const selectProfiles = (s: ObsStoreState): Array<string> =>
  s.core.profiles

export const useProfiles = () => useObsStore(useShallow(selectProfiles))

export const selectCurrentProfile = (s: ObsStoreState): string =>
  s.core.currentProfile

export const useCurrentProfile = () => useObsStore(selectCurrentProfile)

export const selectCollections = (s: ObsStoreState): Array<string> =>
  s.core.collections

export const useCollections = () => useObsStore(useShallow(selectCollections))

export const selectCurrentCollection = (s: ObsStoreState): string =>
  s.core.currentCollection

export const useCurrentCollection = () => useObsStore(selectCurrentCollection)

// Features
export const selectVirtualCamActive = (s: ObsStoreState): boolean =>
  s.core.virtualCamActive

export const useVirtualCamActive = () => useObsStore(selectVirtualCamActive)

export const selectReplayBufferActive = (s: ObsStoreState): boolean =>
  s.core.replayBufferActive

export const useReplayBufferActive = () => useObsStore(selectReplayBufferActive)

export const selectStudioModeEnabled = (s: ObsStoreState): boolean =>
  s.core.studioModeEnabled

export const useStudioModeEnabled = () => useObsStore(selectStudioModeEnabled)

export const selectFeatureStatus = (s: ObsStoreState) => ({
  virtualCamActive: s.core.virtualCamActive,
  replayBufferActive: s.core.replayBufferActive,
  studioModeEnabled: s.core.studioModeEnabled,
})

export const useFeatureStatus = () =>
  useObsStore(useShallow(selectFeatureStatus))

// Transitions
export const selectTransitions = (s: ObsStoreState): Array<TransitionInfo> =>
  s.core.transitions

export const useTransitions = () => useObsStore(useShallow(selectTransitions))

export const selectCurrentTransition = (s: ObsStoreState) => ({
  name: s.core.currentTransitionName,
  duration: s.core.currentTransitionDuration,
})

export const useCurrentTransition = () =>
  useObsStore(useShallow(selectCurrentTransition))

// Filters
export const selectSourceFilters = (
  s: ObsStoreState
): Record<string, Array<FilterInfo>> => s.core.sourceFilters

export const useSourceFilters = () =>
  useObsStore(useShallow(selectSourceFilters))

export const selectFiltersForSource =
  (sourceName: string) => (s: ObsStoreState) =>
    s.core.sourceFilters[sourceName] ?? []

export const useFiltersForSource = (sourceName: string) =>
  useObsStore(useShallow(selectFiltersForSource(sourceName)))

// Hotkeys
export const selectHotkeys = (s: ObsStoreState): Array<HotkeyInfo> =>
  s.core.hotkeys

export const useHotkeys = () => useObsStore(useShallow(selectHotkeys))

// Scene Items
export const selectSceneItemEnableStates = (
  s: ObsStoreState
): Record<string, Record<number, boolean>> => s.core.sceneItemEnableStates

export const useSceneItemEnableStates = () =>
  useObsStore(useShallow(selectSceneItemEnableStates))

// -----------------------------------------------------------------------------
// COMMAND SELECTORS (get command functions)
// -----------------------------------------------------------------------------

export const selectCommands = (s: ObsStoreState) => ({
  startStreaming: s.startStreaming,
  stopStreaming: s.stopStreaming,
  startRecording: s.startRecording,
  stopRecording: s.stopRecording,
  switchScene: s.switchScene,
  setInputMute: s.setInputMute,
  setInputVolume: s.setInputVolume,
  toggleStudioMode: s.toggleStudioMode,
  toggleVirtualCamera: s.toggleVirtualCamera,
  toggleReplayBuffer: s.toggleReplayBuffer,
  sendCustomCommand: s.sendCustomCommand,
})

export const useObsCommands = () => useObsStore(useShallow(selectCommands))

// -----------------------------------------------------------------------------
// ESCAPE HATCH (use only for debugging)
// -----------------------------------------------------------------------------

/**
 * ⚠️ WARNING: Returns raw state from OBS.
 * This may update frequently. Do not use in components unless you explicitly
 * want high-frequency rerenders. Use temporal-specific selectors instead.
 */
export const selectRawState = (s: ObsStoreState): ClientObsState => s.rawState

// ============================================================================
// DERIVED HOOKS
// ============================================================================

/**
 * Check if a specific scene is active.
 * STABLE: Only changes when scene changes.
 */
export function useIsSceneActive(sceneName: string): boolean {
  const currentScene = useCurrentScene()
  return currentScene === sceneName
}

/**
 * Get all scene names as an array.
 * STABLE: Only changes when scene list changes.
 */
export function useSceneNames(): Array<string> {
  const scenes = useScenes()
  return scenes.map((s) => s.name)
}

/**
 * Get input names as an array.
 * STABLE: Only changes when input list changes.
 */
export function useInputNames(): Array<string> {
  const inputs = useInputs()
  return inputs.map((i) => i.name)
}
