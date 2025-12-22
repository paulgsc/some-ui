import type {
  ActiveLifetime,
  OrchestratorCommand,
  OrchestratorState,
  SceneConfig,
  StreamStatus,
} from "some-types-utils"
import { defaultOrchestratorState } from "some-types-utils"
import { create } from "zustand"

type CommandSender = (command: OrchestratorCommand) => Promise<void>

type OrchestratorStoreState = {
  // === STATE (from server) ===
  state: OrchestratorState
  isConnected: boolean
  isInitializing: boolean
  error: string | null

  // === INTERNAL ===
  _commandSender: CommandSender | null
  _streamId: string | null

  // === INTERNAL SETTERS (hook-only) ===
  _setState: (state: OrchestratorState) => void
  _setConnectionStatus: (isConnected: boolean, isInitializing: boolean) => void
  _setError: (error: string | null) => void
  _setCommandSender: (sender: CommandSender, streamId: string) => void

  // === COMMANDS ===
  configure: (scenes: Array<SceneConfig>) => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  reset: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  forceScene: (scene: string) => Promise<void>
  skipCurrentScene: () => Promise<void>
  updateStreamStatus: (status: StreamStatus) => Promise<void>
}

export const useOrchestratorStore = create<OrchestratorStoreState>(
  (set, get) => ({
    // --- Initial ---
    state: defaultOrchestratorState,
    isConnected: false,
    isInitializing: false,
    error: null,

    _commandSender: null,
    _streamId: null,

    // --- Internal setters ---
    _setState: (state) => set({ state }),

    _setConnectionStatus: (isConnected, isInitializing) =>
      set({ isConnected, isInitializing }),

    _setError: (error) => set({ error }),

    _setCommandSender: (sender, streamId) =>
      set({ _commandSender: sender, _streamId: streamId }),

    // --- Commands ---
    configure: async (scenes) => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("configure")
      await _commandSender({
        Configure: {
          scenes,
          tick_interval_ms: 1000,
          loop_scenes: false,
        },
      })
    },

    start: async () => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("start")
      await _commandSender({ Start: null })
    },

    stop: async () => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("stop")
      await _commandSender({ Stop: null })
    },

    reset: async () => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("reset")
      await _commandSender({ Reset: null })
    },

    pause: async () => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("pause")
      await _commandSender({ Pause: null })
    },

    resume: async () => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("resume")
      await _commandSender({ Resume: null })
    },

    forceScene: async (scene) => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("forceScene")
      await _commandSender({ ForceScene: scene })
    },

    skipCurrentScene: async () => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("skipCurrentScene")
      await _commandSender({ SkipCurrentScene: null })
    },

    updateStreamStatus: async (status) => {
      const { _commandSender } = get()
      if (!_commandSender) return warn("updateStreamStatus")
      await _commandSender({ UpdateStreamStatus: status })
    },
  })
)

function warn(action: string) {
  console.warn(`Cannot ${action}: orchestrator not connected`)
}

export const selectOrchestratorState = (s: OrchestratorStoreState) => s.state

export const selectIsRunning = (s: OrchestratorStoreState) => s.state.is_running

export const selectIsPaused = (s: OrchestratorStoreState) => s.state.is_paused

export const selectProgress = (s: OrchestratorStoreState) => s.state.progress

export const selectCurrentTime = (s: OrchestratorStoreState) =>
  s.state.current_time

export const selectTimeRemaining = (s: OrchestratorStoreState) =>
  s.state.time_remaining

export const selectTotalDuration = (s: OrchestratorStoreState) =>
  s.state.total_duration

export const selectActiveLifetimes = (
  s: OrchestratorStoreState
): Array<ActiveLifetime> => s.state.active_lifetimes

export const selectCurrentActiveScene = (
  s: OrchestratorStoreState
): string | null => s.state.current_active_scene

export const selectStreamStatus = (s: OrchestratorStoreState) =>
  s.state.stream_status

export const selectConnectionStatus = (s: OrchestratorStoreState) => ({
  isConnected: s.isConnected,
  isInitializing: s.isInitializing,
  error: s.error,
})
