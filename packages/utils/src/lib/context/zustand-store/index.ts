import type {
  ActiveLifetime,
  OrchestratorCommand,
  OrchestratorState,
  SceneConfig,
  StreamStatus,
} from "some-types-utils"
import { defaultOrchestratorState } from "some-types-utils"
import { create } from "zustand"
import { useShallow } from "zustand/shallow"

type CommandSender = (command: OrchestratorCommand) => Promise<void>

// Temporal layers - separated by update frequency
type ClockState = {
  current_time: number
  progress: number
  time_remaining: number
  total_duration: number
}

type OrchestratorStoreState = {
  // === TEMPORAL LAYERS ===
  // Tick-driven state (updates every tick)
  clock: ClockState

  // Scene-driven state (updates only on scene boundary)
  scene_lifetimes: Array<ActiveLifetime>
  scene_id: string | null

  // === RAW STATE (escape hatch for debugging) ===
  rawState: OrchestratorState

  // === CONNECTION STATE ===
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
    // --- Initial state ---
    clock: {
      current_time: 0,
      progress: 0,
      time_remaining: 0,
      total_duration: 0,
    },
    scene_lifetimes: [],
    scene_id: null,
    rawState: defaultOrchestratorState,
    isConnected: false,
    isInitializing: false,
    error: null,
    _commandSender: null,
    _streamId: null,

    // --- Internal setters ---
    // This is the KEY normalization point - splits temporal domains
    _setState: (next) =>
      set((prev) => {
        const prevSceneId = prev.scene_id
        const nextSceneId = next.current_active_scene

        // Semantic boundary detection
        const sceneChanged = prevSceneId !== nextSceneId

        return {
          rawState: next,

          // Clock ALWAYS updates (tick-driven)
          clock: {
            current_time: next.current_time,
            progress: next.progress,
            time_remaining: next.time_remaining,
            total_duration: next.total_duration,
          },

          // Scene data ONLY updates on boundary (event-driven)
          scene_id: nextSceneId,
          scene_lifetimes: sceneChanged
            ? next.active_lifetimes
            : prev.scene_lifetimes,
        }
      }),

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

// ============================================================================
// SELECTORS - Organized by temporal contract
// ============================================================================

// -----------------------------------------------------------------------------
// 🔴 TICK-AWARE SELECTORS (explicit opt-in, rerenders every tick)
// Use these ONLY for: progress bars, timecode displays, playheads, animations
// -----------------------------------------------------------------------------

export const selectClock = (s: OrchestratorStoreState): ClockState => s.clock

export const useOrchestratorClock = () =>
  useOrchestratorStore(useShallow(selectClock))

export const selectCurrentTime = (s: OrchestratorStoreState) =>
  s.clock.current_time

export const selectProgress = (s: OrchestratorStoreState) => s.clock.progress

export const selectTimeRemaining = (s: OrchestratorStoreState) =>
  s.clock.time_remaining

export const selectTotalDuration = (s: OrchestratorStoreState) =>
  s.clock.total_duration

// -----------------------------------------------------------------------------
// 🟢 SCENE-STABLE SELECTORS (default for UI, NO tick rerenders)
// Use these for: layouts, panels, registry resolution, component lifetimes
// -----------------------------------------------------------------------------

/**
 * Returns active lifetimes for the current scene.
 * STABLE: Does not change on tick updates, only on scene boundaries.
 * This is your primary UI data source.
 */
export const selectSceneLifetimes = (
  s: OrchestratorStoreState
): Array<ActiveLifetime> => s.scene_lifetimes

export const useSceneLifetimes = () =>
  useOrchestratorStore(useShallow(selectSceneLifetimes))

/**
 * Returns current scene ID.
 * STABLE: Only changes when scene changes.
 * Use as dependency for remounting, layout resets, registry resolution.
 */
export const selectCurrentSceneId = (
  s: OrchestratorStoreState
): string | null => s.scene_id

export const useCurrentSceneId = () =>
  useOrchestratorStore(selectCurrentSceneId)

// -----------------------------------------------------------------------------
// ORCHESTRATOR STATE (non-temporal)
// -----------------------------------------------------------------------------

export const selectIsRunning = (s: OrchestratorStoreState) =>
  s.rawState.is_running

export const selectIsPaused = (s: OrchestratorStoreState) =>
  s.rawState.is_paused

export const selectStreamStatus = (s: OrchestratorStoreState) =>
  s.rawState.stream_status

export const useStreamStatus = () =>
  useOrchestratorStore(useShallow(selectStreamStatus))

export const selectConnectionStatus = (s: OrchestratorStoreState) => ({
  isConnected: s.isConnected,
  isInitializing: s.isInitializing,
  error: s.error,
})

export const useConnectionStatus = () =>
  useOrchestratorStore(useShallow(selectConnectionStatus))

// -----------------------------------------------------------------------------
// ESCAPE HATCH (use only for debugging)
// -----------------------------------------------------------------------------

/**
 * ⚠️ WARNING: Returns raw state from server.
 * This updates every tick. Do not use in components unless you explicitly
 * want tick-rate rerenders. Use temporal-specific selectors instead.
 */
export const selectRawState = (s: OrchestratorStoreState): OrchestratorState =>
  s.rawState

// ============================================================================
// DERIVED HOOKS (Scene-scoped computations)
// ============================================================================

/**
 * Returns time elapsed within the current scene.
 * TICK-AWARE: Rerenders every tick (explicit leakage).
 */
export function useSceneElapsedTime(): number | null {
  const { current_time } = useOrchestratorClock()
  const lifetimes = useSceneLifetimes()

  const sceneLifetime = lifetimes.find((l) => "Scene" in l.kind)
  if (!sceneLifetime) return null

  return current_time - sceneLifetime.started_at
}

/**
 * Returns progress within the current scene (0-1).
 * TICK-AWARE: Rerenders every tick (explicit leakage).
 */
export function useSceneProgress(): number | null {
  const elapsed = useSceneElapsedTime()
  const lifetimes = useSceneLifetimes()

  const sceneLifetime = lifetimes.find((l) => "Scene" in l.kind)
  if (!sceneLifetime || elapsed === null) return null

  const duration = sceneLifetime.kind.Scene.duration
  return duration > 0 ? Math.min(elapsed / duration, 1) : 0
}
