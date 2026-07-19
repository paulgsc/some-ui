import type {
  ActiveLifetime,
  OrchestratorCommand,
  OrchestratorMode,
  OrchestratorState,
  SceneConfig,
} from "some-types-utils"

/**
 * Pure simulation of the orchestrator FSM/clock. Kept free of React and
 * timers so it can be driven from a `setInterval` in the hook, or exercised
 * directly in tests.
 */
export type EngineState = {
  mode: OrchestratorMode
  scenes: Array<SceneConfig>
  loopScenes: boolean
  /** Accumulated running time in ms. Frozen while paused/stopped. */
  elapsedMs: number
  /** Wall-clock ms the engine last ticked from. Null while not running. */
  lastTickAt: number | null
}

export function createEngineState(): EngineState {
  return {
    mode: "Unconfigured",
    scenes: [],
    loopScenes: false,
    elapsedMs: 0,
    lastTickAt: null,
  }
}

function pad(n: number, len = 2): string {
  return n.toString().padStart(len, "0")
}

export function formatTimecode(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`
}

export function totalDurationOf(scenes: Array<SceneConfig>): number {
  return scenes.reduce((max, s) => Math.max(max, s.start_time + s.duration), 0)
}

/** Synthetic scene_id - SceneConfig has no id of its own, only scene_name. */
export function sceneIdFor(scene: SceneConfig, index: number): string {
  return `${scene.scene_name}#${index}`
}

export function buildActiveLifetimes(
  scenes: Array<SceneConfig>,
  currentTime: number
): Array<ActiveLifetime> {
  const lifetimes: Array<ActiveLifetime> = []
  scenes.forEach((scene, index) => {
    const start = scene.start_time
    const end = scene.start_time + scene.duration
    if (currentTime >= start && currentTime < end) {
      lifetimes.push({
        id: index,
        kind: {
          Scene: {
            scene_id: sceneIdFor(scene, index),
            scene_name: scene.scene_name,
            duration: scene.duration,
            ui: scene.ui,
            layout: scene.layout,
          },
        },
        started_at: start,
      })
    }
  })
  return lifetimes
}

export function primarySceneId(
  lifetimes: Array<ActiveLifetime>
): string | null {
  if (lifetimes.length === 0) return null
  return lifetimes.reduce((earliest, curr) =>
    curr.started_at < earliest.started_at ? curr : earliest
  ).kind.Scene.scene_id
}

export function buildOrchestratorState(engine: EngineState): OrchestratorState {
  const totalDuration = totalDurationOf(engine.scenes)
  const currentTime = Math.min(engine.elapsedMs, totalDuration)
  // Only "Running"/"Paused" ever have something on screen - Idle (configured
  // but not started yet), Stopped, and Unconfigured should read as empty
  // even if elapsedMs would otherwise land inside a scene's window.
  const activeLifetimes =
    engine.mode === "Running" || engine.mode === "Paused"
      ? buildActiveLifetimes(engine.scenes, currentTime)
      : []

  return {
    mode: engine.mode,
    current_time: currentTime,
    total_duration: totalDuration,
    progress: totalDuration > 0 ? currentTime / totalDuration : 0,
    time_remaining: Math.max(0, totalDuration - currentTime),
    active_lifetimes: activeLifetimes,
    current_active_scene: primarySceneId(activeLifetimes),
    stream_status: {
      is_streaming: engine.mode === "Running",
      stream_time: currentTime,
      timecode: formatTimecode(currentTime),
    },
  }
}

/** Advances the clock by (now - lastTickAt). No-op unless currently Running. */
export function advanceClock(engine: EngineState, now: number): EngineState {
  if (engine.mode !== "Running" || engine.lastTickAt === null) return engine

  const delta = now - engine.lastTickAt
  let elapsedMs = engine.elapsedMs + delta
  let mode: OrchestratorMode = engine.mode
  let lastTickAt: number | null = now
  const totalDuration = totalDurationOf(engine.scenes)

  if (totalDuration > 0 && elapsedMs >= totalDuration) {
    if (engine.loopScenes) {
      elapsedMs = elapsedMs % totalDuration
    } else {
      elapsedMs = totalDuration
      mode = "Finished"
      lastTickAt = null
    }
  }

  return { ...engine, elapsedMs, mode, lastTickAt }
}

/** Applies a single orchestrator command, returning the next engine state. */
export function applyCommand(
  engine: EngineState,
  command: OrchestratorCommand,
  now: number
): EngineState {
  if ("Configure" in command) {
    return {
      mode: "Idle",
      scenes: command.Configure.scenes,
      loopScenes: command.Configure.loop_scenes,
      elapsedMs: 0,
      lastTickAt: null,
    }
  }

  if ("Start" in command) {
    if (engine.scenes.length === 0) return engine
    return { ...engine, mode: "Running", lastTickAt: now }
  }

  if ("Pause" in command) {
    if (engine.mode !== "Running") return engine
    return { ...engine, mode: "Paused", lastTickAt: null }
  }

  if ("Resume" in command) {
    if (engine.mode !== "Paused") return engine
    return { ...engine, mode: "Running", lastTickAt: now }
  }

  if ("Stop" in command) {
    // Preserve elapsedMs - a completion summary needs "how far did we get".
    return { ...engine, mode: "Stopped", lastTickAt: null }
  }

  if ("Reset" in command) {
    return {
      ...engine,
      mode: engine.scenes.length > 0 ? "Idle" : "Unconfigured",
      elapsedMs: 0,
      lastTickAt: null,
    }
  }

  if ("ForceScene" in command) {
    const target = engine.scenes.find(
      (s) => s.scene_name === command.ForceScene
    )
    if (!target) return engine
    return { ...engine, elapsedMs: target.start_time }
  }

  if ("SkipCurrentScene" in command) {
    const currentTime = Math.min(
      engine.elapsedMs,
      totalDurationOf(engine.scenes)
    )
    const active = buildActiveLifetimes(engine.scenes, currentTime)
    if (active.length === 0) return engine
    const earliestEnd = Math.min(
      ...active.map((lt) => lt.started_at + lt.kind.Scene.duration)
    )
    return { ...engine, elapsedMs: earliestEnd }
  }

  // UpdateStreamStatus: the engine derives stream status from its own clock,
  // so there's nothing external to apply.
  return engine
}
