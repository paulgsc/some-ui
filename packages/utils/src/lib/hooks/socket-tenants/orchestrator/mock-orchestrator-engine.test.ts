import type { OrchestratorCommand, SceneConfig } from "some-types-utils"
import { describe, expect, it } from "vitest"

import {
  advanceClock,
  applyCommand,
  buildActiveLifetimes,
  buildOrchestratorState,
  createEngineState,
  formatTimecode,
  primarySceneId,
  totalDurationOf,
} from "./mock-orchestrator-engine"
import type { EngineState } from "./mock-orchestrator-engine"

function scene(overrides: Partial<SceneConfig> = {}): SceneConfig {
  return {
    scene_name: "hangul",
    duration: 10_000,
    start_time: 0,
    ui: [],
    ...overrides,
  }
}

function configured(
  scenes: Array<SceneConfig>,
  overrides: Partial<EngineState> = {}
): EngineState {
  return { ...createEngineState(), scenes, mode: "Idle", ...overrides }
}

describe("totalDurationOf", () => {
  it("returns the max end time across scenes", () => {
    const scenes = [
      scene({ start_time: 0, duration: 5_000 }),
      scene({ start_time: 5_000, duration: 8_000 }),
    ]
    expect(totalDurationOf(scenes)).toBe(13_000)
  })

  it("returns 0 for an empty scene list", () => {
    expect(totalDurationOf([])).toBe(0)
  })
})

describe("buildActiveLifetimes", () => {
  const scenes = [
    scene({ scene_name: "hangul", start_time: 0, duration: 5_000 }),
    scene({ scene_name: "leetype", start_time: 5_000, duration: 5_000 }),
  ]

  it("includes only scenes whose [start, end) window contains currentTime", () => {
    expect(
      buildActiveLifetimes(scenes, 2_000).map((lt) => lt.kind.Scene.scene_name)
    ).toEqual(["hangul"])
    expect(
      buildActiveLifetimes(scenes, 5_000).map((lt) => lt.kind.Scene.scene_name)
    ).toEqual(["leetype"])
    expect(buildActiveLifetimes(scenes, 10_000)).toEqual([])
  })

  it("supports concurrent scenes overlapping the same window", () => {
    const overlapping = [
      scene({ scene_name: "a", start_time: 0, duration: 10_000 }),
      scene({ scene_name: "b", start_time: 0, duration: 10_000 }),
    ]
    expect(buildActiveLifetimes(overlapping, 1_000)).toHaveLength(2)
  })
})

describe("primarySceneId", () => {
  it("returns null when nothing is active", () => {
    expect(primarySceneId([])).toBeNull()
  })

  it("returns the earliest-started lifetime's scene_id", () => {
    const scenes = [
      scene({ scene_name: "a", start_time: 5_000, duration: 5_000 }),
      scene({ scene_name: "b", start_time: 0, duration: 10_000 }),
    ]
    const lifetimes = buildActiveLifetimes(scenes, 6_000)
    expect(primarySceneId(lifetimes)).toBe("b#1")
  })
})

describe("buildOrchestratorState", () => {
  it("reports empty active_lifetimes while Idle even if elapsedMs falls inside a scene window", () => {
    const engine = configured([scene({ start_time: 0, duration: 5_000 })], {
      elapsedMs: 0,
    })
    const state = buildOrchestratorState(engine)
    expect(state.active_lifetimes).toEqual([])
    expect(state.current_active_scene).toBeNull()
  })

  it("reports active_lifetimes while Running", () => {
    const engine = configured([scene({ start_time: 0, duration: 5_000 })], {
      mode: "Running",
      elapsedMs: 1_000,
      lastTickAt: 0,
    })
    const state = buildOrchestratorState(engine)
    expect(state.active_lifetimes).toHaveLength(1)
    expect(state.progress).toBeCloseTo(0.2)
    expect(state.time_remaining).toBe(4_000)
  })

  it("reports empty active_lifetimes while Stopped, preserving current_time", () => {
    const engine = configured([scene({ start_time: 0, duration: 5_000 })], {
      mode: "Stopped",
      elapsedMs: 3_000,
    })
    const state = buildOrchestratorState(engine)
    expect(state.active_lifetimes).toEqual([])
    expect(state.current_time).toBe(3_000)
  })
})

describe("advanceClock", () => {
  it("is a no-op when not Running", () => {
    const engine = configured([scene()], { mode: "Idle" })
    expect(advanceClock(engine, 1_000)).toBe(engine)
  })

  it("advances elapsedMs by the wall-clock delta since lastTickAt", () => {
    const engine = configured([scene({ duration: 10_000 })], {
      mode: "Running",
      elapsedMs: 1_000,
      lastTickAt: 1_000,
    })
    const next = advanceClock(engine, 1_400)
    expect(next.elapsedMs).toBe(1_400)
    expect(next.lastTickAt).toBe(1_400)
    expect(next.mode).toBe("Running")
  })

  it("transitions to Finished once elapsed reaches total duration without looping", () => {
    const engine = configured([scene({ duration: 1_000 })], {
      mode: "Running",
      elapsedMs: 900,
      lastTickAt: 0,
    })
    const next = advanceClock(engine, 200)
    expect(next.mode).toBe("Finished")
    expect(next.elapsedMs).toBe(1_000)
    expect(next.lastTickAt).toBeNull()
  })

  it("wraps elapsedMs and keeps Running when loopScenes is set", () => {
    const engine = configured([scene({ duration: 1_000 })], {
      mode: "Running",
      loopScenes: true,
      elapsedMs: 900,
      lastTickAt: 0,
    })
    const next = advanceClock(engine, 300)
    expect(next.mode).toBe("Running")
    expect(next.elapsedMs).toBe(200)
  })
})

describe("applyCommand", () => {
  const cmd = (command: OrchestratorCommand): OrchestratorCommand => command

  it("Configure resets the engine to Idle with the given scenes", () => {
    const scenes = [scene()]
    const next = applyCommand(
      createEngineState(),
      cmd({
        Configure: { scenes, tick_interval_ms: 1000, loop_scenes: false },
      }),
      0
    )
    expect(next.mode).toBe("Idle")
    expect(next.scenes).toBe(scenes)
    expect(next.elapsedMs).toBe(0)
  })

  it("Start is a no-op with no scenes configured", () => {
    const engine = createEngineState()
    expect(applyCommand(engine, cmd({ Start: null }), 100)).toBe(engine)
  })

  it("Start transitions Idle -> Running and stamps lastTickAt", () => {
    const engine = configured([scene()])
    const next = applyCommand(engine, cmd({ Start: null }), 500)
    expect(next.mode).toBe("Running")
    expect(next.lastTickAt).toBe(500)
  })

  it("Pause only takes effect while Running", () => {
    const idle = configured([scene()])
    expect(applyCommand(idle, cmd({ Pause: null }), 0)).toBe(idle)

    const running = { ...idle, mode: "Running" as const, lastTickAt: 0 }
    const paused = applyCommand(running, cmd({ Pause: null }), 100)
    expect(paused.mode).toBe("Paused")
    expect(paused.lastTickAt).toBeNull()
  })

  it("Resume only takes effect while Paused, and re-stamps lastTickAt", () => {
    const paused = configured([scene()], { mode: "Paused", elapsedMs: 2_000 })
    const next = applyCommand(paused, cmd({ Resume: null }), 999)
    expect(next.mode).toBe("Running")
    expect(next.lastTickAt).toBe(999)
    expect(next.elapsedMs).toBe(2_000)
  })

  it("Stop halts playback but preserves elapsedMs for a completion summary", () => {
    const running = configured([scene()], {
      mode: "Running",
      elapsedMs: 4_000,
      lastTickAt: 0,
    })
    const next = applyCommand(running, cmd({ Stop: null }), 100)
    expect(next.mode).toBe("Stopped")
    expect(next.elapsedMs).toBe(4_000)
  })

  it("Reset zeroes elapsedMs and returns to Idle when scenes remain configured", () => {
    const finished = configured([scene()], {
      mode: "Finished",
      elapsedMs: 10_000,
    })
    const next = applyCommand(finished, cmd({ Reset: null }), 0)
    expect(next.mode).toBe("Idle")
    expect(next.elapsedMs).toBe(0)
  })

  it("Reset returns to Unconfigured when there are no scenes", () => {
    const next = applyCommand(createEngineState(), cmd({ Reset: null }), 0)
    expect(next.mode).toBe("Unconfigured")
  })

  it("ForceScene jumps elapsedMs to the target scene's start_time", () => {
    const scenes = [
      scene({ scene_name: "a", start_time: 0, duration: 5_000 }),
      scene({ scene_name: "b", start_time: 5_000, duration: 5_000 }),
    ]
    const engine = configured(scenes, {
      mode: "Running",
      elapsedMs: 1_000,
      lastTickAt: 0,
    })
    const next = applyCommand(engine, cmd({ ForceScene: "b" }), 0)
    expect(next.elapsedMs).toBe(5_000)
  })

  it("ForceScene is a no-op for an unknown scene name", () => {
    const engine = configured([scene({ scene_name: "a" })], {
      elapsedMs: 1_000,
    })
    expect(applyCommand(engine, cmd({ ForceScene: "does-not-exist" }), 0)).toBe(
      engine
    )
  })

  it("SkipCurrentScene jumps to the earliest end among active scenes", () => {
    const scenes = [
      scene({ scene_name: "a", start_time: 0, duration: 3_000 }),
      scene({ scene_name: "b", start_time: 0, duration: 8_000 }),
    ]
    const engine = configured(scenes, {
      mode: "Running",
      elapsedMs: 1_000,
      lastTickAt: 0,
    })
    const next = applyCommand(engine, cmd({ SkipCurrentScene: null }), 0)
    expect(next.elapsedMs).toBe(3_000)
  })

  it("SkipCurrentScene is a no-op when nothing is active", () => {
    const engine = configured([scene({ start_time: 0, duration: 1_000 })], {
      mode: "Running",
      elapsedMs: 5_000,
      lastTickAt: 0,
    })
    expect(applyCommand(engine, cmd({ SkipCurrentScene: null }), 0)).toBe(
      engine
    )
  })
})

describe("formatTimecode", () => {
  it("formats hours/minutes/seconds/millis with zero padding", () => {
    expect(formatTimecode(0)).toBe("00:00:00.000")
    expect(formatTimecode(61_234)).toBe("00:01:01.234")
    expect(formatTimecode(3_661_000)).toBe("01:01:01.000")
  })

  it("clamps negative input to zero", () => {
    expect(formatTimecode(-500)).toBe("00:00:00.000")
  })
})
