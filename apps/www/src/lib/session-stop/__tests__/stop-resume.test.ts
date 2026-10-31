/**
 * @vitest-environment jsdom
 *
 * Promise SS1: honest stop and resume, on both surfaces (#1868).
 *
 * - Claim: across any run of stops and resumes of a session the player took
 *   over (`begin` ran), on the phone or the desktop web, the session's clock
 *   does not move while it is stopped, each resume goes on from the clock
 *   position and the scene its stop left, and the session closes with the
 *   time it was played.
 * - Family: every interleaving, one to three stops a session, of
 *   - how it stops: "Got to go"; the app hidden (the phone); the player's
 *     screen closing (Back, a link, "Go"); the page going away, reloaded or
 *     kept in the browser's cache (both surfaces);
 *   - how it resumes: back within a glance, "Oops, keep going", or "Pick up",
 *     in the same player or once it reopened;
 *   - how it ends: played to its end, "Call it done", or lapsed;
 *   - playing, or paused by the person, when it stopped;
 *   - with or without a "+5 min" first;
 *   - the surface: the phone (`apk`) and the desktop web, where a hidden tab
 *     is not a stop: the session plays on, and that time counts.
 * - Proof: this file. It enumerates the Family and drives the real runtime,
 *   the real orchestrator store through `orchestratorPlayback`, and the real
 *   engine, each reopening reconfiguring it from zero as `LivePlayer` does.
 *   What the person played is counted here, apart from the engine, and every
 *   resume and every close is checked against it.
 * - Not covered: the activity inside a scene starts its own content again
 *   once its player reopens (topik's open drill, leetype's term); Skip and
 *   seek move the clock by design, so "time played" is the clock's, not the
 *   wall's; a departure the app cannot see (a crash on screen) leaves no
 *   stop; a session the player never took over (a scheduled one, a finished
 *   one played again) keeps none.
 */

import type { OrchestratorCommand, SceneConfig } from "@some-ui/types"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { primaryOf, useOrchestratorStore } from "@/lib/orchestrator"
import type { EngineState } from "@/lib/orchestrator/mock-orchestrator-engine"
import {
  advanceClock,
  applyCommand,
  buildOrchestratorState,
  createEngineState,
} from "@/lib/orchestrator/mock-orchestrator-engine"
import { closedPatch, latestStop, PICK_UP_MS } from "@/lib/session-stop"
import { orchestratorPlayback } from "@/lib/session-stop/playback"
import type { StopRuntime, Surface } from "@/lib/session-stop/runtime"
import { createStopRuntime } from "@/lib/session-stop/runtime"

const MIN = 60_000
const SESSION = "s"
const scene = (name: string, start: number): SceneConfig => ({
  scene_name: name,
  start_time: start,
  duration: 10 * MIN,
  ui: [],
})
/** Twenty minutes, so three stops six minutes apart cross into the second. */
const SCENES = [scene("reading", 0), scene("drill", 10 * MIN)]
const BASE = Date.parse("2026-10-31T09:00:00.000Z")
const GLANCE = 10_000
const AWHILE = 5 * MIN
const STRETCH = 6 * MIN
/** Each enumeration runs a thousand or so sittings: seconds, on a busy runner. */
const ENUMERATION_MS = 60_000

/** One app's worth of state: the clock, the engine, and the player mounted. */
type World = {
  surface: Surface
  t: number
  engine: EngineState
  /** What the person played, counted apart from the engine. */
  played: number
  mount: { stops: StopRuntime; disconnect: () => void } | null
}

let world: World

function emit(): void {
  useOrchestratorStore
    .getState()
    ._setState(buildOrchestratorState(world.engine))
}

function send(command: OrchestratorCommand): Promise<void> {
  world.engine = applyCommand(
    advanceClock(world.engine, world.t),
    command,
    world.t
  )
  emit()
  return Promise.resolve()
}

const elapsed = (): number => world.engine.elapsedMs
const playing = (): boolean => world.engine.mode === "Running"
const sceneNow = (): string | null =>
  primaryOf(useOrchestratorStore.getState().lifetimes.scene_lifetimes)?.kind
    .Scene.scene_name ?? null

/** Time passes. `counts`: the person was in the session, playing it. */
function pass(ms: number, counts: boolean): void {
  if (counts && playing()) world.played += ms
  world.t += ms
  world.engine = advanceClock(world.engine, world.t)
  emit()
}

/** `LivePlayer` mounting: its effects connect, then configure, then begin. */
function open(): void {
  const stops = createStopRuntime(
    SESSION,
    orchestratorPlayback,
    () => new Date(BASE + world.t)
  )
  const disconnect = stops.connect(world.surface)
  void useOrchestratorStore.getState().configure(SCENES)
  stops.begin()
  world.mount = { stops, disconnect }
}

function close(): void {
  world.mount?.disconnect()
  world.mount = null
}

function stops(): StopRuntime {
  if (world.mount === null) throw new Error("no player mounted")
  return world.mount.stops
}

let visibility: DocumentVisibilityState = "visible"
function setVisibility(next: DocumentVisibilityState): void {
  visibility = next
  document.dispatchEvent(new Event("visibilitychange"))
}

function pageTransition(
  type: "pagehide" | "pageshow",
  persisted: boolean
): void {
  window.dispatchEvent(new PageTransitionEvent(type, { persisted }))
}

/**
 * One stop and its resume, as the person meets it. `away` passes while the
 * session is stopped; `resume` runs once they are back.
 */
type Route = {
  name: string
  surfaces: ReadonlyArray<Surface>
  run: () => void
}

/** Away for `ms`, then back. The clock must not have moved meanwhile. */
function away(ms: number): void {
  const before = elapsed()
  pass(ms, false)
  expect(elapsed(), "the clock moved while stopped").toBe(before)
}

const BOTH: ReadonlyArray<Surface> = ["phone", "desktop"]
const PHONE: ReadonlyArray<Surface> = ["phone"]

const ROUTES: ReadonlyArray<Route> = [
  {
    name: "Got to go, then Oops, keep going",
    surfaces: BOTH,
    run: (): void => {
      stops().tap()
      away(GLANCE)
      stops().pickUp()
    },
  },
  {
    name: "Got to go, Go, reopened and picked up",
    surfaces: BOTH,
    run: (): void => {
      stops().tap()
      close()
      away(AWHILE)
      open()
      stops().pickUp()
    },
  },
  {
    name: "Got to go, the app hidden, shown and picked up",
    surfaces: BOTH,
    run: (): void => {
      stops().tap()
      setVisibility("hidden")
      away(AWHILE)
      setVisibility("visible")
      stops().pickUp()
    },
  },
  {
    name: "the app hidden for a glance",
    surfaces: PHONE,
    run: (): void => {
      setVisibility("hidden")
      away(GLANCE)
      setVisibility("visible")
    },
  },
  {
    name: "the app hidden awhile, then picked up",
    surfaces: PHONE,
    run: (): void => {
      setVisibility("hidden")
      away(AWHILE)
      setVisibility("visible")
      stops().pickUp()
    },
  },
  {
    name: "the screen closed for a glance",
    surfaces: BOTH,
    run: (): void => {
      close()
      away(GLANCE)
      open()
    },
  },
  {
    name: "the screen closed awhile, reopened and picked up",
    surfaces: BOTH,
    run: (): void => {
      close()
      away(AWHILE)
      open()
      stops().pickUp()
    },
  },
  {
    name: "the page reloaded at once",
    surfaces: BOTH,
    run: (): void => {
      pageTransition("pagehide", false)
      close()
      away(GLANCE)
      open()
    },
  },
  {
    name: "the page closed awhile, reopened and picked up",
    surfaces: BOTH,
    run: (): void => {
      pageTransition("pagehide", false)
      close()
      away(AWHILE)
      open()
      stops().pickUp()
    },
  },
  {
    name: "the page cached for a glance",
    surfaces: BOTH,
    run: (): void => {
      pageTransition("pagehide", true)
      away(GLANCE)
      pageTransition("pageshow", true)
    },
  },
  {
    name: "the page cached awhile, then picked up",
    surfaces: BOTH,
    run: (): void => {
      pageTransition("pagehide", true)
      away(AWHILE)
      pageTransition("pageshow", true)
      stops().pickUp()
    },
  },
]

type Ending = { name: string; run: () => number }

/** Each returns the time the session closes with. */
const ENDINGS: ReadonlyArray<Ending> = [
  {
    name: "played to its end",
    run: (): number => {
      pass(planned() - elapsed(), true)
      expect(world.engine.mode).toBe("Finished")
      return elapsed()
    },
  },
  {
    name: "called done",
    run: (): number => {
      close()
      away(AWHILE)
      open()
      stops().done()
      return closedAt()
    },
  },
  {
    name: "lapsed",
    run: (): number => {
      close()
      away(PICK_UP_MS + MIN)
      open()
      expect(world.engine.mode).toBe("Stopped")
      return closedAt()
    },
  },
]

function planned(): number {
  return buildOrchestratorState(world.engine).total_duration
}

function closedAt(): number {
  const stop = latestStop(SESSION)
  expect(stop?.outcome === "done" || stop?.outcome === "lapsed").toBe(true)
  return (stop && closedPatch(stop).finalElapsedMs) ?? Number.NaN
}

type Leg = { route: Route; pausedFirst: boolean }

/** Plays a session through `legs` and `ending`, checking SS1 at each step. */
function sitting(
  surface: Surface,
  extended: boolean,
  legs: ReadonlyArray<Leg>,
  ending: Ending
): void {
  world = {
    surface,
    t: 0,
    engine: createEngineState(),
    played: 0,
    mount: null,
  }
  localStorage.clear()
  open()
  expect(playing()).toBe(true)
  if (extended) void useOrchestratorStore.getState().extend(5 * MIN)

  for (const { route, pausedFirst } of legs) {
    pass(STRETCH, true)
    if (pausedFirst) {
      void useOrchestratorStore.getState().pause()
      pass(MIN, true)
    }
    const at = elapsed()
    const where = sceneNow()
    route.run()
    expect(elapsed(), `${route.name}: resumed elsewhere`).toBe(at)
    expect(sceneNow(), `${route.name}: in another scene`).toBe(where)
    expect(elapsed(), `${route.name}: off what was played`).toBe(world.played)
    expect(planned()).toBe(extended ? 25 * MIN : 20 * MIN)
    // Back in it: a resume that left it paused is played on by hand.
    if (!playing()) void useOrchestratorStore.getState().resume()
    expect(playing()).toBe(true)
  }

  expect(ending.run(), `closed off what was played`).toBe(
    Math.min(world.played, planned())
  )
  close()
}

/** Every sequence of `n` picks from `options`. */
function sequences<T>(options: ReadonlyArray<T>, n: number): Array<Array<T>> {
  if (n === 0) return [[]]
  return sequences(options, n - 1).flatMap((rest) =>
    options.map((option) => [...rest, option])
  )
}

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  })
  const store = useOrchestratorStore.getState()
  store._setCommandSender(send, "test")
  store._setConnectionStatus(true, false)
})

afterEach(() => {
  close()
  visibility = "visible"
  localStorage.clear()
})

describe("SS1: stop and resume keep the session's clock honest", () => {
  for (const surface of BOTH) {
    const legs = ROUTES.filter((r) => r.surfaces.includes(surface)).flatMap(
      (route) => [false, true].map((pausedFirst) => ({ route, pausedFirst }))
    )

    for (const ending of ENDINGS) {
      it(
        `on the ${surface}: every pair of stops, ${ending.name}, with or without +5 min`,
        () => {
          let runs = 0
          for (const pair of sequences(legs, 2)) {
            for (const extended of [false, true]) {
              sitting(surface, extended, pair, ending)
              runs += 1
            }
          }
          expect(runs).toBe(legs.length ** 2 * 2)
        },
        ENUMERATION_MS
      )
    }

    it(
      `on the ${surface}: every run of three stops`,
      () => {
        const [ending] = ENDINGS
        // Playing or paused at a stop is already crossed with every pair.
        const playingLegs = legs.filter((leg) => !leg.pausedFirst)
        for (const run of sequences(playingLegs, 3)) {
          sitting(surface, false, run, ending)
        }
      },
      ENUMERATION_MS
    )
  }

  it("on the desktop, a hidden tab plays on and counts, keeping no stop", () => {
    world = {
      surface: "desktop",
      t: 0,
      engine: createEngineState(),
      played: 0,
      mount: null,
    }
    open()
    pass(STRETCH, true)
    setVisibility("hidden")
    pass(AWHILE, true)
    setVisibility("visible")

    expect(latestStop(SESSION)).toBeNull()
    expect(elapsed()).toBe(world.played)
    expect(world.played).toBe(STRETCH + AWHILE)
  })
})
