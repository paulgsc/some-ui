import type {
  OrchestratorCommand,
  OrchestratorState,
  SceneConfig,
  ScheduledElement,
} from "some-types-utils"
import { defaultOrchestratorState } from "some-types-utils"
import { create } from "zustand"

type CommandSender = (command: OrchestratorCommand) => Promise<void>

type OrchestratorStoreState = {
  // === STATE (broadcast from server) ===
  state: OrchestratorState
  isConnected: boolean
  isInitializing: boolean
  error: string | null

  // === INTERNAL (set by hook, not exposed to components) ===
  _commandSender: CommandSender | null
  _streamId: string | null

  // === ACTIONS (called by components) ===
  // State updates (only called by hook)
  _setState: (state: OrchestratorState) => void
  _setConnectionStatus: (isConnected: boolean, isInitializing: boolean) => void
  _setError: (error: string | null) => void
  _setCommandSender: (sender: CommandSender, streamId: string) => void

  // Commands (called by any component)
  start: (scenes?: Array<SceneConfig>) => Promise<void>
  stop: () => Promise<void>
  reset: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  forceScene: (scene: string) => Promise<void>
  skipCurrentScene: () => Promise<void>
  updateStreamStatus: (
    isStreaming: boolean,
    streamTime: number,
    timecode: string
  ) => Promise<void>
  reconfigure: (scenes: Array<SceneConfig>) => Promise<void>
}

export const useOrchestratorStore = create<OrchestratorStoreState>(
  (set, get) => ({
    // Initial state
    state: defaultOrchestratorState,
    isConnected: false,
    isInitializing: false,
    error: null,
    _commandSender: null,
    _streamId: null,

    // === INTERNAL SETTERS (hook only) ===
    _setState: (state) => set({ state }),

    _setConnectionStatus: (isConnected, isInitializing) =>
      set({ isConnected, isInitializing }),

    _setError: (error) => set({ error }),

    _setCommandSender: (sender, streamId) =>
      set({ _commandSender: sender, _streamId: streamId }),

    // === PUBLIC ACTIONS (any component) ===
    start: async (scenes) => {
      const { _commandSender, state: currentState } = get()
      if (!_commandSender) {
        console.warn("Cannot start: orchestrator not connected")
        return
      }
      const scenesToUse = scenes || currentState.scenes
      await _commandSender({ Start: { scenes: scenesToUse } })
    },

    stop: async () => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot stop: orchestrator not connected")
        return
      }
      await _commandSender({ Stop: null })
    },

    reset: async () => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot reset: orchestrator not connected")
        return
      }
      await _commandSender({ Reset: null })
    },

    pause: async () => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot pause: orchestrator not connected")
        return
      }
      await _commandSender({ Pause: null })
    },

    resume: async () => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot resume: orchestrator not connected")
        return
      }
      await _commandSender({ Resume: null })
    },

    forceScene: async (scene) => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot force scene: orchestrator not connected")
        return
      }
      await _commandSender({ ForceScene: scene })
    },

    skipCurrentScene: async () => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot skip scene: orchestrator not connected")
        return
      }
      await _commandSender({ SkipCurrentScene: null })
    },

    updateStreamStatus: async (is_streaming, stream_time, timecode) => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot update stream status: orchestrator not connected")
        return
      }
      await _commandSender({
        UpdateStreamStatus: { is_streaming, stream_time, timecode },
      })
    },

    reconfigure: async (scenes) => {
      const { _commandSender } = get()
      if (!_commandSender) {
        console.warn("Cannot reconfigure: orchestrator not connected")
        return
      }
      await _commandSender({ Reconfigure: { scenes } })
    },
  })
)

export const selectCurrentScene = (
  state: OrchestratorStoreState
): ScheduledElement | null =>
  state.state.scheduled_elements[state.state.current_scene_index]

export const selectCompletedScene = (
  state: OrchestratorStoreState
): ScheduledElement | null =>
  state.state.current_scene_index > 0
    ? state.state.scheduled_elements[state.state.current_scene_index - 1]
    : null

export const selectCurrentSceneIndex = (
  state: OrchestratorStoreState
): number => state.state.current_scene_index

export const selectScheduledScenes = (
  state: OrchestratorStoreState
): Array<ScheduledElement> => state.state.scheduled_elements

export const selectIsRunning = (state: OrchestratorStoreState): boolean =>
  state.state.is_running

export const selectIsPaused = (state: OrchestratorStoreState): boolean =>
  state.state.is_paused

export const selectScenes = (
  state: OrchestratorStoreState
): Array<SceneConfig> => state.state.scenes

export const selectCurrentTime = (state: OrchestratorStoreState): number =>
  state.state.current_time

export const selectTimeRemaining = (state: OrchestratorStoreState): number =>
  state.state.time_remaining

export const selectTotalDuration = (state: OrchestratorStoreState): number =>
  state.state.total_duration

export const selectProgress = (state: OrchestratorStoreState): number => {
  const { current_time, total_duration } = state.state
  return total_duration > 0 ? current_time / total_duration : 0
}

export const selectConnectionStatus = (state: OrchestratorStoreState) => ({
  isConnected: state.isConnected,
  isInitializing: state.isInitializing,
  error: state.error,
})
