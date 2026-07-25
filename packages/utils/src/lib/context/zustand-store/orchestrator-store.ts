import type {
  ActiveLifetime,
  OrchestratorCommand,
  OrchestratorMode,
  OrchestratorState,
  SceneConfig,
  StreamStatus,
} from "@some-ui/types"
import { defaultOrchestratorState } from "@some-ui/types"
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

// Normalized lifetime tracking (concurrent-aware)
type LifetimeState = {
  // All active lifetimes indexed by ID (structural truth)
  lifetimes: Map<number, ActiveLifetime>

  // Derived: set of currently active scene IDs
  active_scene_ids: Set<string>

  // Derived: ordered list of scene lifetimes (for UI iteration)
  scene_lifetimes: Array<ActiveLifetime>
}

// Orchestrator mode state (FSM tracking)
type ModeState = {
  mode: OrchestratorMode
  is_running: boolean
  is_paused: boolean
  is_terminal: boolean
}

type OrchestratorStoreState = {
  // === TEMPORAL LAYERS ===
  // Tick-driven state (updates every tick)
  clock: ClockState

  // Lifetime-driven state (updates only on lifetime boundaries)
  lifetimes: LifetimeState

  // Mode-driven state (updates on command boundaries)
  mode: ModeState

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

// Helper: Extract scene IDs from active lifetimes
function extractSceneIds(lifetimes: Array<ActiveLifetime>): Set<string> {
  const ids = new Set<string>()
  for (const lifetime of lifetimes) {
    if ("Scene" in lifetime.kind) {
      ids.add(lifetime.kind.Scene.scene_id)
    }
  }
  return ids
}

// Helper: Check if two sets are equal
function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

// Helper: Normalize lifetimes into concurrent-aware structure
function normalizeLifetimes(lifetimes: Array<ActiveLifetime>): LifetimeState {
  const lifetimeMap = new Map<number, ActiveLifetime>()
  const sceneLifetimes: Array<ActiveLifetime> = []

  for (const lifetime of lifetimes) {
    lifetimeMap.set(lifetime.id, lifetime)
    if ("Scene" in lifetime.kind) {
      sceneLifetimes.push(lifetime)
    }
  }

  return {
    lifetimes: lifetimeMap,
    active_scene_ids: extractSceneIds(lifetimes),
    scene_lifetimes: sceneLifetimes,
  }
}

// Helper: Derive mode state from mode enum
function deriveModeState(mode: OrchestratorMode): ModeState {
  const is_running = mode === "Running"
  const is_paused = mode === "Paused"
  const is_terminal =
    mode === "Finished" || mode === "Stopped" || mode === "Error"

  return {
    mode,
    is_running,
    is_paused,
    is_terminal,
  }
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
    lifetimes: {
      lifetimes: new Map(),
      active_scene_ids: new Set(),
      scene_lifetimes: [],
    },
    mode: deriveModeState("Unconfigured"),
    rawState: defaultOrchestratorState,
    isConnected: false,
    isInitializing: false,
    error: null,
    _commandSender: null,
    _streamId: null,

    // --- Internal setters ---
    // This is the KEY normalization point - handles concurrent lifetimes and mode
    _setState: (next): void =>
      set((prev) => {
        const prevSceneIds = prev.lifetimes.active_scene_ids
        const nextSceneIds = extractSceneIds(next.active_lifetimes)

        // Structural boundary detection (set-based, not scalar)
        const lifetimesChanged = !setEquals(prevSceneIds, nextSceneIds)

        // Mode boundary detection
        const modeChanged = prev.mode.mode !== next.mode

        return {
          rawState: next,

          // Clock ALWAYS updates (tick-driven)
          clock: {
            current_time: next.current_time,
            progress: next.progress,
            time_remaining: next.time_remaining,
            total_duration: next.total_duration,
          },

          // Lifetimes ONLY update on boundary (event-driven)
          lifetimes: lifetimesChanged
            ? normalizeLifetimes(next.active_lifetimes)
            : prev.lifetimes,

          // Mode ONLY updates on state change (command-driven)
          mode: modeChanged ? deriveModeState(next.mode) : prev.mode,
        }
      }),

    _setConnectionStatus: (isConnected, isInitializing): void =>
      set({ isConnected, isInitializing }),

    _setError: (error): void => set({ error }),

    _setCommandSender: (sender, streamId): void =>
      set({ _commandSender: sender, _streamId: streamId }),

    // --- Commands ---
    configure: async (scenes): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("configure")
        return
      }
      await _commandSender({
        Configure: {
          scenes,
          tick_interval_ms: 1000,
          loop_scenes: false,
        },
      })
    },

    start: async (): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("start")
        return
      }
      await _commandSender({ Start: null })
    },

    stop: async (): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("stop")
        return
      }
      await _commandSender({ Stop: null })
    },

    reset: async (): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("reset")
        return
      }
      await _commandSender({ Reset: null })
    },

    pause: async (): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("pause")
        return
      }
      await _commandSender({ Pause: null })
    },

    resume: async (): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("resume")
        return
      }
      await _commandSender({ Resume: null })
    },

    forceScene: async (scene): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("forceScene")
        return
      }
      await _commandSender({ ForceScene: scene })
    },

    skipCurrentScene: async (): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("skipCurrentScene")
        return
      }
      await _commandSender({ SkipCurrentScene: null })
    },

    updateStreamStatus: async (status): Promise<void> => {
      const { _commandSender } = get()
      if (!_commandSender) {
        warn("updateStreamStatus")
        return
      }
      await _commandSender({ UpdateStreamStatus: status })
    },
  })
)

function warn(action: string): void {
  // eslint-disable-next-line no-console
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

export const useOrchestratorClock = (): ClockState =>
  useOrchestratorStore(useShallow(selectClock))

export const selectCurrentTime = (s: OrchestratorStoreState): number =>
  s.clock.current_time

export const selectProgress = (s: OrchestratorStoreState): number =>
  s.clock.progress

export const selectTimeRemaining = (s: OrchestratorStoreState): number =>
  s.clock.time_remaining

export const selectTotalDuration = (s: OrchestratorStoreState): number =>
  s.clock.total_duration

// -----------------------------------------------------------------------------
// 🟢 LIFETIME-STABLE SELECTORS (default for UI, NO tick rerenders)
// Use these for: layouts, panels, registry resolution, component lifetimes
// -----------------------------------------------------------------------------

/**
 * Returns all active scene lifetimes (concurrent-aware).
 * STABLE: Does not change on tick updates, only on lifetime boundaries.
 * May contain multiple concurrent scenes.
 */
export const selectSceneLifetimes = (
  s: OrchestratorStoreState
): Array<ActiveLifetime> => s.lifetimes.scene_lifetimes

export const useSceneLifetimes = (): Array<ActiveLifetime> =>
  useOrchestratorStore(useShallow(selectSceneLifetimes))

/**
 * Returns set of active scene IDs (concurrent-aware).
 * STABLE: Only changes when lifetime boundaries change.
 */
export const selectActiveSceneIds = (s: OrchestratorStoreState): Set<string> =>
  s.lifetimes.active_scene_ids

export const useActiveSceneIds = (): Set<string> =>
  useOrchestratorStore(selectActiveSceneIds)

/**
 * Returns a specific lifetime by ID.
 * STABLE: Only changes when that lifetime starts/ends.
 */
export const selectLifetimeById =
  (id: number) =>
  (s: OrchestratorStoreState): ActiveLifetime | null =>
    s.lifetimes.lifetimes.get(id) ?? null

/**
 * Returns all active lifetimes as a Map.
 * STABLE: Only changes on lifetime boundaries.
 */
export const selectAllLifetimes = (
  s: OrchestratorStoreState
): Map<number, ActiveLifetime> => s.lifetimes.lifetimes

// -----------------------------------------------------------------------------
// 🟡 MODE SELECTORS (stable across ticks, changes on commands)
// Use these for: control buttons, FSM-dependent UI, status indicators
// -----------------------------------------------------------------------------

/**
 * Returns the current orchestrator mode.
 * STABLE: Only changes on mode transitions (Start, Stop, Pause, etc.)
 */
export const selectMode = (s: OrchestratorStoreState): OrchestratorMode =>
  s.mode.mode

export const useMode = (): OrchestratorMode => useOrchestratorStore(selectMode)

/**
 * Returns true if orchestrator is actively running.
 * STABLE: Only changes on mode transitions.
 */
export const selectIsRunning = (s: OrchestratorStoreState): boolean =>
  s.mode.is_running

export const useIsRunning = (): boolean => useOrchestratorStore(selectIsRunning)

/**
 * Returns true if orchestrator is paused.
 * STABLE: Only changes on mode transitions.
 */
export const selectIsPaused = (s: OrchestratorStoreState): boolean =>
  s.mode.is_paused

export const useIsPaused = (): boolean => useOrchestratorStore(selectIsPaused)

/**
 * Returns true if orchestrator is in a terminal state (Finished, Stopped, Error).
 * STABLE: Only changes on mode transitions.
 */
export const selectIsTerminal = (s: OrchestratorStoreState): boolean =>
  s.mode.is_terminal

export const useIsTerminal = (): boolean =>
  useOrchestratorStore(selectIsTerminal)

/**
 * Returns true if orchestrator can accept playback commands (Idle, Running, Paused).
 * STABLE: Only changes on mode transitions.
 */
export const selectIsActive = (s: OrchestratorStoreState): boolean =>
  s.mode.mode === "Idle" ||
  s.mode.mode === "Running" ||
  s.mode.mode === "Paused"

export const useIsActive = (): boolean => useOrchestratorStore(selectIsActive)

// -----------------------------------------------------------------------------
// LEGACY COMPATIBILITY (deprecated but kept for migration)
// -----------------------------------------------------------------------------

/**
 * @deprecated Use selectActiveSceneIds or selectSceneLifetimes instead.
 * Returns first active scene ID for legacy code that assumes single scene.
 * Returns null if no scenes active, or if multiple scenes are concurrent.
 */
export const selectCurrentSceneId = (
  s: OrchestratorStoreState
): string | null => {
  const sceneIds = s.lifetimes.active_scene_ids
  // Only return a value if exactly one scene is active
  return sceneIds.size === 1 ? (Array.from(sceneIds).at(0) ?? null) : null
}

export const useCurrentSceneId = (): string | null =>
  useOrchestratorStore(selectCurrentSceneId)

// -----------------------------------------------------------------------------
// OTHER STATE SELECTORS
// -----------------------------------------------------------------------------

export const selectStreamStatus = (s: OrchestratorStoreState): StreamStatus =>
  s.rawState.stream_status

export const useStreamStatus = (): StreamStatus =>
  useOrchestratorStore(useShallow(selectStreamStatus))

export const selectConnectionStatus = (
  s: OrchestratorStoreState
): { isConnected: boolean; isInitializing: boolean; error: string | null } => ({
  isConnected: s.isConnected,
  isInitializing: s.isInitializing,
  error: s.error,
})

export const useConnectionStatus = (): ReturnType<
  typeof selectConnectionStatus
> => useOrchestratorStore(useShallow(selectConnectionStatus))

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
// DERIVED HOOKS (Concurrent-aware computations)
// ============================================================================

/**
 * Returns time elapsed for a specific scene lifetime.
 * TICK-AWARE: Rerenders every tick (explicit leakage).
 * @param sceneId - The scene ID to track
 */
export function useSceneElapsedTime(sceneId: string): number | null {
  const { current_time } = useOrchestratorClock()
  const lifetimes = useSceneLifetimes()

  const sceneLifetime = lifetimes.find(
    (l) => "Scene" in l.kind && l.kind.Scene.scene_id === sceneId
  )
  if (!sceneLifetime) return null

  return current_time - sceneLifetime.started_at
}

/**
 * Returns progress for a specific scene lifetime (0-1).
 * TICK-AWARE: Rerenders every tick (explicit leakage).
 * @param sceneId - The scene ID to track
 */
export function useSceneProgress(sceneId: string): number | null {
  const elapsed = useSceneElapsedTime(sceneId)
  const lifetimes = useSceneLifetimes()

  const sceneLifetime = lifetimes.find(
    (l) => "Scene" in l.kind && l.kind.Scene.scene_id === sceneId
  )
  if (!sceneLifetime || elapsed === null) return null

  const duration = sceneLifetime.kind.Scene.duration
  return duration > 0 ? Math.min(elapsed / duration, 1) : 0
}

/**
 * Returns primary scene (useful for UI that needs a "main" scene).
 * Heuristic: earliest started scene, or null if no scenes active.
 * STABLE: Only changes on lifetime boundaries.
 */
export function usePrimaryScene(): ActiveLifetime | null {
  const lifetimes = useSceneLifetimes()
  if (lifetimes.length === 0) return null

  // Return earliest started scene
  return lifetimes.reduce((earliest, current) =>
    current.started_at < earliest.started_at ? current : earliest
  )
}

/**
 * Check if a specific scene is currently active.
 * STABLE: Only changes on lifetime boundaries.
 */
export function useIsSceneActive(sceneId: string): boolean {
  const activeIds = useActiveSceneIds()
  return activeIds.has(sceneId)
}
