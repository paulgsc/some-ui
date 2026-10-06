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

// State is split by update frequency: clock per tick, lifetimes on
// lifetime boundaries, mode on commands. Selectors below follow that split.
type ClockState = {
  current_time: number
  progress: number
  time_remaining: number
  total_duration: number
}

type LifetimeState = {
  lifetimes: Map<number, ActiveLifetime>
  active_scene_ids: Set<string>
  scene_lifetimes: Array<ActiveLifetime>
}

type ModeState = {
  mode: OrchestratorMode
  is_running: boolean
  is_paused: boolean
  is_terminal: boolean
}

type OrchestratorStoreState = {
  clock: ClockState
  lifetimes: LifetimeState
  mode: ModeState

  // Escape hatch for debugging.
  rawState: OrchestratorState

  isConnected: boolean
  isInitializing: boolean
  error: string | null

  _commandSender: CommandSender | null
  _streamId: string | null

  // Hook-only setters.
  _setState: (state: OrchestratorState) => void
  _setConnectionStatus: (isConnected: boolean, isInitializing: boolean) => void
  _setError: (error: string | null) => void
  _setCommandSender: (sender: CommandSender, streamId: string) => void

  configure: (scenes: Array<SceneConfig>) => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  reset: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  forceScene: (scene: string) => Promise<void>
  skipCurrentScene: () => Promise<void>
  extend: (ms: number) => Promise<void>
  updateStreamStatus: (status: StreamStatus) => Promise<void>
}

function extractSceneIds(lifetimes: Array<ActiveLifetime>): Set<string> {
  const ids = new Set<string>()
  for (const lifetime of lifetimes) {
    if ("Scene" in lifetime.kind) {
      ids.add(lifetime.kind.Scene.scene_id)
    }
  }
  return ids
}

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

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

    // Lifetimes and mode keep their previous reference unless they changed,
    // so lifetime/mode selectors do not rerender on every tick.
    _setState: (next): void =>
      set((prev) => {
        const prevSceneIds = prev.lifetimes.active_scene_ids
        const nextSceneIds = extractSceneIds(next.active_lifetimes)

        const lifetimesChanged = !setEquals(prevSceneIds, nextSceneIds)

        const modeChanged = prev.mode.mode !== next.mode

        return {
          rawState: next,

          clock: {
            current_time: next.current_time,
            progress: next.progress,
            time_remaining: next.time_remaining,
            total_duration: next.total_duration,
          },

          lifetimes: lifetimesChanged
            ? normalizeLifetimes(next.active_lifetimes)
            : prev.lifetimes,

          mode: modeChanged ? deriveModeState(next.mode) : prev.mode,
        }
      }),

    _setConnectionStatus: (isConnected, isInitializing): void =>
      set({ isConnected, isInitializing }),

    _setError: (error): void => set({ error }),

    _setCommandSender: (sender, streamId): void =>
      set({ _commandSender: sender, _streamId: streamId }),

    configure: (scenes): Promise<void> =>
      sendCommand(get()._commandSender, "configure", {
        Configure: {
          scenes,
          tick_interval_ms: 1000,
          loop_scenes: false,
        },
      }),

    start: (): Promise<void> =>
      sendCommand(get()._commandSender, "start", { Start: null }),

    stop: (): Promise<void> =>
      sendCommand(get()._commandSender, "stop", { Stop: null }),

    reset: (): Promise<void> =>
      sendCommand(get()._commandSender, "reset", { Reset: null }),

    pause: (): Promise<void> =>
      sendCommand(get()._commandSender, "pause", { Pause: null }),

    resume: (): Promise<void> =>
      sendCommand(get()._commandSender, "resume", { Resume: null }),

    forceScene: (scene): Promise<void> =>
      sendCommand(get()._commandSender, "forceScene", { ForceScene: scene }),

    skipCurrentScene: (): Promise<void> =>
      sendCommand(get()._commandSender, "skipCurrentScene", {
        SkipCurrentScene: null,
      }),

    extend: (ms): Promise<void> =>
      sendCommand(get()._commandSender, "extend", { Extend: ms }),

    updateStreamStatus: (status): Promise<void> =>
      sendCommand(get()._commandSender, "updateStreamStatus", {
        UpdateStreamStatus: status,
      }),
  })
)

/**
 * Hands one command to the connected orchestrator and returns the sender's own
 * promise: nothing is sequenced after it. A sender that throws synchronously
 * still yields a rejected promise, as the async actions this replaced did.
 */
function sendCommand(
  sender: CommandSender | null,
  action: string,
  command: OrchestratorCommand
): Promise<void> {
  if (!sender) {
    warn(action)
    return Promise.resolve()
  }
  try {
    return sender(command)
  } catch (error) {
    return Promise.reject(error)
  }
}

function warn(action: string): void {
  // eslint-disable-next-line no-console
  console.warn(`Cannot ${action}: orchestrator not connected`)
}

// Tick-aware selectors rerender every tick: use only for progress bars,
// timecodes, playheads and animations.

const selectClock = (s: OrchestratorStoreState): ClockState => s.clock

export const useOrchestratorClock = (): ClockState =>
  useOrchestratorStore(useShallow(selectClock))

export const selectCurrentTime = (s: OrchestratorStoreState): number =>
  s.clock.current_time

export const selectTotalDuration = (s: OrchestratorStoreState): number =>
  s.clock.total_duration

// Lifetime-stable selectors (the UI default) change only on lifetime
// boundaries. Several scenes may be active at once.
const selectSceneLifetimes = (
  s: OrchestratorStoreState
): Array<ActiveLifetime> => s.lifetimes.scene_lifetimes

export const useSceneLifetimes = (): Array<ActiveLifetime> =>
  useOrchestratorStore(useShallow(selectSceneLifetimes))

// Mode selectors change only on mode transitions.
const selectIsRunning = (s: OrchestratorStoreState): boolean =>
  s.mode.is_running

export const useIsRunning = (): boolean => useOrchestratorStore(selectIsRunning)

const selectIsPaused = (s: OrchestratorStoreState): boolean => s.mode.is_paused

export const useIsPaused = (): boolean => useOrchestratorStore(selectIsPaused)

const selectIsTerminal = (s: OrchestratorStoreState): boolean =>
  s.mode.is_terminal

export const useIsTerminal = (): boolean =>
  useOrchestratorStore(selectIsTerminal)

/** The earliest-started active scene, or null when none is active. */
export function primaryOf(
  lifetimes: Array<ActiveLifetime>
): ActiveLifetime | null {
  if (lifetimes.length === 0) return null

  return lifetimes.reduce((earliest, current) =>
    current.started_at < earliest.started_at ? current : earliest
  )
}

export function usePrimaryScene(): ActiveLifetime | null {
  return primaryOf(useSceneLifetimes())
}
