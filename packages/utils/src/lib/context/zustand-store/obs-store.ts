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
} from "@some-ui/types"
import { create } from "zustand"
import { useShallow } from "zustand/shallow"

import { assertNever } from "../../assert-never"

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

const defaultClientObsState: ClientObsState = {
  ...defaultCoreState,
  ...defaultStatsState,
}

/** Anything with string keys - what `deepEqual` can walk. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

// Helper: Deep equality check for objects (simple version)
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // Same two conditions as before (non-object, or null) via one predicate,
  // which also gives the body an indexable type without an assertion.
  if (!isRecord(a) || !isRecord(b)) return false

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
    case "streamStateChanged": {
      return {
        ...state,
        streaming: event.data.streaming ?? state.streaming,
        streamTimecode: event.data.timecode ?? state.streamTimecode,
      }
    }
    case "recordingStatusResponse":
    case "recordStateChanged": {
      return {
        ...state,
        recording: event.data.recording ?? state.recording,
        recordTimecode: event.data.timecode ?? state.recordTimecode,
      }
    }
    case "sceneListResponse": {
      return {
        ...state,
        scenes: event.data.scenes ?? state.scenes,
        currentScene: event.data.currentScene ?? state.currentScene,
      }
    }
    case "currentSceneResponse":
    case "currentProgramSceneChanged": {
      return {
        ...state,
        currentScene: event.data.sceneName ?? state.currentScene,
      }
    }
    case "sourcesListResponse": {
      return {
        ...state,
        sources: event.data.sources ?? state.sources,
      }
    }
    case "inputListResponse": {
      return {
        ...state,
        inputs: event.data.inputs ?? state.inputs,
      }
    }
    case "audioMuteResponse":
    case "inputMuteStateChanged": {
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
    }
    case "audioVolumeResponse":
    case "inputVolumeChanged": {
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
    }
    case "profileListResponse": {
      return {
        ...state,
        profiles: event.data.profiles ?? state.profiles,
        currentProfile: event.data.currentProfile ?? state.currentProfile,
      }
    }
    case "currentProfileResponse": {
      return {
        ...state,
        currentProfile: event.data.profileName ?? state.currentProfile,
      }
    }
    case "sceneCollectionListResponse": {
      return {
        ...state,
        collections: event.data.collections ?? state.collections,
        currentCollection:
          event.data.currentCollection ?? state.currentCollection,
      }
    }
    case "currentCollectionResponse": {
      return {
        ...state,
        currentCollection: event.data.collectionName ?? state.currentCollection,
      }
    }
    case "virtualCamStatusResponse":
    case "virtualcamStateChanged": {
      return {
        ...state,
        virtualCamActive: event.data.active ?? state.virtualCamActive,
      }
    }
    case "replayBufferStatusResponse":
    case "replayBufferStateChanged": {
      return {
        ...state,
        replayBufferActive: event.data.active ?? state.replayBufferActive,
      }
    }
    case "studioModeResponse":
    case "studioModeStateChanged": {
      return {
        ...state,
        studioModeEnabled: event.data.enabled ?? state.studioModeEnabled,
      }
    }
    case "statsResponse": {
      return {
        ...state,
        stats: event.data.stats ?? state.stats,
      }
    }
    case "currentTransitionResponse": {
      return {
        ...state,
        currentTransitionName:
          event.data.transitionName ?? state.currentTransitionName,
        currentTransitionDuration:
          event.data.transitionDuration ?? state.currentTransitionDuration,
      }
    }
    case "currentSceneTransitionChanged": {
      return {
        ...state,
        currentTransitionName:
          event.data.transitionName ?? state.currentTransitionName,
      }
    }
    case "transitionListResponse": {
      return {
        ...state,
        transitions: event.data.transitions ?? state.transitions,
      }
    }
    case "sceneTransitionStarted": {
      return {
        ...state,
        lastTransitionStartedName: event.data.transitionName,
      }
    }
    case "sceneTransitionEnded": {
      return {
        ...state,
        lastTransitionEndedName: event.data.transitionName,
      }
    }
    case "filterListResponse": {
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
    }
    case "hotkeyListResponse": {
      return {
        ...state,
        hotkeys: event.data.hotkeys ?? state.hotkeys,
      }
    }
    case "versionResponse": {
      return {
        ...state,
        obsVersion: event.data.obsVersion ?? state.obsVersion,
        websocketVersion: event.data.websocketVersion ?? state.websocketVersion,
      }
    }
    case "hello": {
      return {
        ...state,
        obsVersion: event.data.obsVersion ?? state.obsVersion,
      }
    }
    case "identified": {
      return {
        ...state,
        identified: true,
      }
    }
    case "sceneItemEnableStateChanged": {
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
              ...(state.sceneItemEnableStates[event.data.sceneName] ?? {}),
              [event.data.itemId]: event.data.enabled,
            },
          },
        }
      }
      return state
    }
    case "unknownResponse": {
      return {
        ...state,
        lastUnknownResponse: {
          requestType: event.data.requestType ?? "unknown",
          data: event.data.data,
        },
      }
    }
    case "unknownEvent": {
      return {
        ...state,
        lastUnknownEvent: {
          eventType: event.data.eventType ?? "unknown",
          data: event.data.data,
        },
      }
    }
    default: {
      // `ObsEvent` is a Zod discriminated union, parsed at the socket
      // boundary before anything reaches here - so an event of an unknown
      // type never gets this far, and a *new* event type added to the schema
      // without a case here stops compiling.
      return assertNever(event)
    }
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
  _handleEvent: (event): void =>
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

  _setConnectionStatus: (isConnected, error = null): void =>
    set({ isConnected, error }),

  _setCommandSender: (sender): void => set({ _commandSender: sender }),

  _reset: (): void =>
    set({
      stats: defaultStatsState,
      core: defaultCoreState,
      rawState: defaultClientObsState,
      isConnected: false,
      error: null,
    }),

  // --- Commands ---
  startStreaming: async (): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("startStreaming")
      return
    }
    await _commandSender({ type: "startStream" })
  },

  stopStreaming: async (): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("stopStreaming")
      return
    }
    await _commandSender({ type: "stopStream" })
  },

  startRecording: async (): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("startRecording")
      return
    }
    await _commandSender({ type: "startRecording" })
  },

  stopRecording: async (): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("stopRecording")
      return
    }
    await _commandSender({ type: "stopRecording" })
  },

  switchScene: async (scene: string): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("switchScene")
      return
    }
    await _commandSender({ type: "switchScene", data: scene })
  },

  setInputMute: async (inputName: string, muted: boolean): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("setInputMute")
      return
    }
    await _commandSender({ type: "setInputMute", data: [inputName, muted] })
  },

  setInputVolume: async (
    inputName: string,
    volumeDb: number
  ): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("setInputVolume")
      return
    }
    await _commandSender({
      type: "setInputVolume",
      data: [inputName, volumeDb],
    })
  },

  toggleStudioMode: async (): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("toggleStudioMode")
      return
    }
    await _commandSender({ type: "toggleStudioMode" })
  },

  toggleVirtualCamera: async (): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("toggleVirtualCamera")
      return
    }
    await _commandSender({ type: "toggleVirtualCamera" })
  },

  toggleReplayBuffer: async (): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("toggleReplayBuffer")
      return
    }
    await _commandSender({ type: "toggleReplayBuffer" })
  },

  sendCustomCommand: async (data: unknown): Promise<void> => {
    const { _commandSender } = get()
    if (!_commandSender) {
      warn("sendCustomCommand")
      return
    }
    await _commandSender({ type: "custom", data })
  },
}))

function warn(action: string): void {
  // eslint-disable-next-line no-console
  console.warn(`Cannot ${action}: OBS not connected`)
}

// ============================================================================
// SELECTORS - Organized by temporal contract
// ============================================================================

// -----------------------------------------------------------------------------
// 🔴 HIGH-FREQUENCY SELECTORS (explicit opt-in, may rerender frequently)
// Use these ONLY for: timecode displays, stats monitoring, performance metrics
// -----------------------------------------------------------------------------

const selectStreamTimecode = (s: ObsStoreState): string =>
  s.stats.streamTimecode

export const useStreamTimecode = (): string => useObsStore(selectStreamTimecode)

const selectRecordTimecode = (s: ObsStoreState): string =>
  s.stats.recordTimecode

export const useRecordTimecode = (): string => useObsStore(selectRecordTimecode)

// Individual stat selectors (for targeted subscriptions)
const selectCpuUsage = (s: ObsStoreState): number => s.stats.stats.cpuUsage

export const useCpuUsage = (): number => useObsStore(selectCpuUsage)

const selectActiveFps = (s: ObsStoreState): number => s.stats.stats.activeFps

export const useActiveFps = (): number => useObsStore(selectActiveFps)

// -----------------------------------------------------------------------------
// 🟢 LOW-FREQUENCY SELECTORS (default for UI, NO frequent rerenders)
// Use these for: layouts, scene lists, input controls, UI state
// -----------------------------------------------------------------------------

// Connection
const selectIsConnected = (s: ObsStoreState): boolean => s.isConnected

export const useIsConnected = (): boolean => useObsStore(selectIsConnected)

const selectConnectionInfo = (
  s: ObsStoreState
): {
  isConnected: boolean
  error: string | null
  obsVersion: string
  websocketVersion: string
  identified: boolean
} => ({
  isConnected: s.isConnected,
  error: s.error,
  obsVersion: s.core.obsVersion,
  websocketVersion: s.core.websocketVersion,
  identified: s.core.identified,
})

export const useConnectionInfo = (): ReturnType<typeof selectConnectionInfo> =>
  useObsStore(useShallow(selectConnectionInfo))

// Stream/Record status (boolean only)
const selectIsStreaming = (s: ObsStoreState): boolean => s.core.streaming

export const useIsStreaming = (): boolean => useObsStore(selectIsStreaming)

const selectIsRecording = (s: ObsStoreState): boolean => s.core.recording

export const useIsRecording = (): boolean => useObsStore(selectIsRecording)

const selectSceneInfo = (
  s: ObsStoreState
): { scenes: Array<SceneInfo>; currentScene: string } => ({
  scenes: s.core.scenes,
  currentScene: s.core.currentScene,
})

export const useSceneInfo = (): ReturnType<typeof selectSceneInfo> =>
  useObsStore(useShallow(selectSceneInfo))

const selectCurrentProfile = (s: ObsStoreState): string => s.core.currentProfile

export const useCurrentProfile = (): string => useObsStore(selectCurrentProfile)

const selectCurrentCollection = (s: ObsStoreState): string =>
  s.core.currentCollection

export const useCurrentCollection = (): string =>
  useObsStore(selectCurrentCollection)

// Features
const selectVirtualCamActive = (s: ObsStoreState): boolean =>
  s.core.virtualCamActive

export const useVirtualCamActive = (): boolean =>
  useObsStore(selectVirtualCamActive)

const selectReplayBufferActive = (s: ObsStoreState): boolean =>
  s.core.replayBufferActive

export const useReplayBufferActive = (): boolean =>
  useObsStore(selectReplayBufferActive)

const selectStudioModeEnabled = (s: ObsStoreState): boolean =>
  s.core.studioModeEnabled

export const useStudioModeEnabled = (): boolean =>
  useObsStore(selectStudioModeEnabled)

const selectCurrentTransition = (
  s: ObsStoreState
): { name: string; duration: number } => ({
  name: s.core.currentTransitionName,
  duration: s.core.currentTransitionDuration,
})

export const useCurrentTransition = (): ReturnType<
  typeof selectCurrentTransition
> => useObsStore(useShallow(selectCurrentTransition))

// -----------------------------------------------------------------------------
// COMMAND SELECTORS (get command functions)
// -----------------------------------------------------------------------------

const selectCommands = (
  s: ObsStoreState
): Pick<
  ObsStoreState,
  | "startStreaming"
  | "stopStreaming"
  | "startRecording"
  | "stopRecording"
  | "switchScene"
  | "setInputMute"
  | "setInputVolume"
  | "toggleStudioMode"
  | "toggleVirtualCamera"
  | "toggleReplayBuffer"
  | "sendCustomCommand"
> => ({
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

export const useObsCommands = (): ReturnType<typeof selectCommands> =>
  useObsStore(useShallow(selectCommands))
