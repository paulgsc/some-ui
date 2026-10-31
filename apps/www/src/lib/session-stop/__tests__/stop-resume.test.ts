/**
 * @vitest-environment jsdom
 *
 * Promise SS1: honest stop and resume, on both surfaces (#1868), and the
 * session waiting while the reflection drawer is open (#1870).
 *
 * - Claim: across any run of stops and resumes of a session the player took
 *   over (`begin` ran), and of the reflection drawer opening and closing, on
 *   the phone or the desktop web, the session's clock does not move while it
 *   is stopped or the drawer is open, each resume goes on from the clock
 *   position and the scene its stop left, closing the drawer plays on a
 *   session that was playing when it opened (and leaves one paused by the
 *   person paused), the orchestrator never plays behind a closed player,
 *   and the session closes with the time it was played.
 * - Family: every interleaving, one to three stops a session, of
 *   - how it stops: "Got to go"; the app hidden (the phone); the player's
 *     screen closing (Back, a link, "Go"); the page going away, reloaded or
 *     kept in the browser's cache (both surfaces);
 *   - how it resumes: back within a glance, "Oops, keep going", or "Pick up",
 *     in the same player or once it reopened;
 *   - how it ends: played to its end, "Call it done", or lapsed, the last
 *     with the drawer open too;
 *   - playing, or paused by the person, when it stopped or the drawer opened;
 *   - with or without a "+5 min" first;
 *   - the reflection drawer: opened and closed on its own; open across the
 *     app hidden, the page cached and the screen closing, back within a
 *     glance or picked up; and, on the phone, gone with its strip as a stop
 *     opens (`LivePlayer` remounts `SessionChrome` by the stop's kind), on
 *     the desktop open behind the stop until it is closed; the player's
 *     screen closing tears the drawer down before or after the stop runtime;
 *   - the surface: the phone (`apk`) and the desktop web, where a hidden tab
 *     is not a stop: the session plays on, and that time counts, unless the
 *     drawer is open.
 * - Proof: this file. It enumerates the Family and drives the real runtime
 *   and the drawer's hold over the real orchestrator store, through
 *   `holdable(orchestratorPlayback)` as `useSessionStop` builds it, and the
 *   real engine, each reopening reconfiguring it from zero as `LivePlayer`
 *   does. What the person played is counted here, apart from the engine, and
 *   every resume and every close is checked against it.
 * - Not covered: the activity inside a scene, which is SS2's (below); Skip
 *   and seek move the clock by design, so "time played" is the clock's, not
 *   the wall's; a departure the app cannot see (a crash on screen) leaves no
 *   stop; a session the player never took over (a scheduled one, a finished
 *   one played again) keeps none.
 *
 * Promise SS2: inside a session, each activity follows it (#1868, #1870).
 *
 * - Claim: every activity a session plays waits exactly while the session's
 *   clock stands still (paused by the person, stopped, left, or behind the
 *   reflection drawer) and plays again as it plays, through the one host
 *   the session's playback port makes (`../activity-host`, followed by
 *   `useHostHold` in `@some-ui/react-hooks`); and the place it kept goes on
 *   when the player reopens on that scene at a stop, and is forgotten when
 *   the session starts from its beginning or ends at a stop.
 * - Family: SS1's whole Family above (every stop, resume, ending, drawer
 *   and surface), crossed with each activity that holds anything in time:
 *   leetype's term (the typing deadline and a session file's declared
 *   length with it), topik's desktop conversation, the drama's line and
 *   sting, read-aloud's rep, and the places kept: leetype's term spent,
 *   topik's open drill and its read-aloud sitting.
 * - Proof: in two halves. This file drives a stand-in activity over the
 *   real host through every SS1 sequence, the viewport mounting one per
 *   scene as the scene changes: it is held whenever the drawer is open,
 *   the time it counted equals the time the person played after every
 *   resume, its place survives each reopening, and none survives a close
 *   at a stop or a fresh start. Each activity's own test holds that it
 *   follows the host: `Term` and `Leetype` (leetype's term and its place),
 *   `IncidentPlayRuntime` (`stands the declared length still`), topik's
 *   `sessionReducer` (`SS2: the desktop conversation`, every sequence of
 *   five holds, releases and chat controls) and `useKoreanStudyPageVM`,
 *   `DramaRuntime` (`while its session waits`), `useReadAloud` (the
 *   sitting kept) and `set-machine`, and `HandheldLesson` (the open drill
 *   kept), with `useHostHold`'s own test for the wiring.
 * - Tolerance: a place keeps the activity's position, not everything on its
 *   screen: leetype's chosen exercise or session file is picked again (the
 *   term left is kept), the drama goes on from its kept point and says the
 *   line on screen again, and the conversation plays its current message
 *   again from the start. A session file's choice timing (Def. 9.4) still
 *   counts held time; only its declared length waits.
 */

import type { ActivityHost } from "@some-ui/react-hooks"
import { followHost } from "@some-ui/react-hooks"
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
import type { ActivityHosts } from "@/lib/session-stop/activity-host"
import {
  createActivityHosts,
  orchestratorWatch,
  storedPlaces,
} from "@/lib/session-stop/activity-host"
import type { Release } from "@/lib/session-stop/playback"
import { holdable, orchestratorPlayback } from "@/lib/session-stop/playback"
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
  mount: {
    stops: StopRuntime
    disconnect: () => void
    hold: () => Release
    /** The reflection drawer, open: its hold's release. */
    drawer: Release | null
    activities: ActivityHosts
    /** The activity in the scene playing, as the viewport mounts it. */
    activity: Activity | null
  } | null
}

/**
 * A stand-in for an activity inside a scene (SS2): it follows its scene's
 * host as `useHostHold` does, counts the time it plays as leetype's term
 * does, and keeps it with the host as it is held and as it unmounts.
 */
type Activity = {
  scene: string
  host: ActivityHost
  spentBefore: number
  since: number | null
  unfollow: () => void
}

const CLOCK = "clock"

let world: World

function emit(): void {
  useOrchestratorStore
    .getState()
    ._setState(buildOrchestratorState(world.engine))
  syncActivity()
}

const sceneId = (): string | null =>
  primaryOf(useOrchestratorStore.getState().lifetimes.scene_lifetimes)?.kind
    .Scene.scene_id ?? null

const spent = (activity: Activity): number =>
  activity.spentBefore +
  (activity.since === null ? 0 : world.t - activity.since)

function holdActivity(activity: Activity): void {
  activity.spentBefore = spent(activity)
  activity.since = null
  activity.host.keep(CLOCK, activity.spentBefore)
}

function mountActivity(scene: string, hosts: ActivityHosts): Activity {
  const host = hosts.forScene(scene)
  const kept = host.recall(CLOCK)
  const activity: Activity = {
    scene,
    host,
    spentBefore: typeof kept === "number" ? kept : 0,
    since: null,
    unfollow: () => undefined,
  }
  activity.unfollow = followHost(host, {
    hold: () => {
      if (activity.since !== null) holdActivity(activity)
    },
    release: () => {
      activity.since ??= world.t
    },
  })
  return activity
}

function unmountActivity(): void {
  const activity = world.mount?.activity
  if (!activity || world.mount === null) return
  activity.unfollow()
  holdActivity(activity)
  world.mount.activity = null
}

/** The viewport: the scene playing's activity mounted, any other not. */
function syncActivity(): void {
  const mount = world.mount
  if (mount === null) return
  const scene = sceneId()
  if (mount.activity?.scene === scene) return
  unmountActivity()
  if (scene !== null) mount.activity = mountActivity(scene, mount.activities)
}

const SCENE_IDS = SCENES.map((one, index) => `${one.scene_name}#${index}`)

/** What every activity counted, kept or still counting. */
function activityTime(): number {
  const live = world.mount?.activity ?? null
  return SCENE_IDS.reduce((total, scene) => {
    if (live?.scene === scene) return total + spent(live)
    const kept = storedPlaces.recall(SESSION, scene, CLOCK)
    return total + (typeof kept === "number" ? kept : 0)
  }, 0)
}

function placesKept(): boolean {
  return SCENE_IDS.some(
    (scene) => storedPlaces.recall(SESSION, scene, CLOCK) !== undefined
  )
}

function activityHeld(): boolean | null {
  return world.mount?.activity?.host.held() ?? null
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
  const held = holdable(orchestratorPlayback)
  const activities = createActivityHosts(
    SESSION,
    orchestratorPlayback,
    orchestratorWatch
  )
  const stops = createStopRuntime(
    SESSION,
    activities.forgetting(held.playback),
    () => new Date(BASE + world.t)
  )
  // On the phone the drawer lives in `SessionChrome`, which `LivePlayer`
  // remounts whenever the stop's kind changes: the drawer goes with it.
  let kind = stops.getState().kind
  stops.subscribe(() => {
    const next = stops.getState().kind
    if (next !== kind && world.surface === "phone") closeDrawer()
    kind = next
  })
  const disconnect = stops.connect(world.surface)
  void useOrchestratorStore.getState().configure(SCENES)
  stops.begin()
  world.mount = {
    stops,
    disconnect,
    hold: held.hold,
    drawer: null,
    activities,
    activity: null,
  }
  syncActivity()
}

/**
 * The player unmounting. Its drawer goes too, after the stop runtime
 * disconnects or, `drawerFirst`, before it: either way nothing plays on.
 */
function close(drawerFirst = false): void {
  if (drawerFirst) closeDrawer()
  world.mount?.disconnect()
  closeDrawer()
  // The viewport's panels unmount after the player's own effects.
  unmountActivity()
  world.mount = null
  expect(playing(), "playing behind a closed player").toBe(false)
}

function openDrawer(): void {
  if (world.mount === null) throw new Error("no player mounted")
  world.mount.drawer = world.mount.hold()
}

function closeDrawer(): void {
  const release = world.mount?.drawer
  if (!release || world.mount === null) return
  world.mount.drawer = null
  release()
}

function drawerOpen(): boolean {
  return Boolean(world.mount?.drawer)
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
  {
    name: "the drawer opened and closed",
    surfaces: BOTH,
    run: (): void => reflect(() => away(AWHILE)),
  },
  {
    name: "the drawer open, the tab hidden awhile",
    surfaces: ["desktop"],
    run: (): void =>
      reflect(() => {
        setVisibility("hidden")
        away(AWHILE)
        setVisibility("visible")
      }),
  },
  {
    name: "the drawer open, the app hidden for a glance",
    surfaces: BOTH,
    run: (): void =>
      reflect(() => {
        setVisibility("hidden")
        away(GLANCE)
        setVisibility("visible")
      }),
  },
  {
    name: "the drawer open, the app hidden awhile, then picked up",
    surfaces: PHONE,
    run: (): void =>
      reflect(() => {
        setVisibility("hidden")
        away(AWHILE)
        setVisibility("visible")
        stops().pickUp()
      }, true),
  },
  {
    name: "the drawer open, the page cached for a glance",
    surfaces: BOTH,
    run: (): void =>
      reflect(() => {
        pageTransition("pagehide", true)
        away(GLANCE)
        pageTransition("pageshow", true)
      }),
  },
  {
    name: "the drawer open, the page cached awhile, then picked up",
    surfaces: BOTH,
    run: (): void =>
      reflect(() => {
        pageTransition("pagehide", true)
        away(AWHILE)
        pageTransition("pageshow", true)
        stops().pickUp()
      }, true),
  },
  {
    name: "the drawer open, the screen closed for a glance",
    surfaces: BOTH,
    run: (): void => {
      openDrawer()
      close()
      away(GLANCE)
      open()
    },
  },
  {
    name: "the drawer open, the screen closed awhile, the drawer first",
    surfaces: BOTH,
    run: (): void => {
      openDrawer()
      close(true)
      away(AWHILE)
      open()
      stops().pickUp()
    },
  },
]

/**
 * The drawer open across `during`, then closed if it is still there. While
 * it is open nothing plays, and once it is closed the session plays again if
 * it was playing when the drawer opened, and stays paused if the person had
 * paused it; `after` instead when `during` decides (a pick-up plays).
 */
function reflect(during: () => void, after?: boolean): void {
  const was = after ?? playing()
  openDrawer()
  expect(playing(), "playing behind the drawer").toBe(false)
  expect(activityHeld(), "an activity playing behind the drawer").toBe(true)
  during()
  if (drawerOpen()) {
    expect(playing(), "playing behind the drawer").toBe(false)
    expect(activityHeld(), "an activity playing behind the drawer").toBe(true)
    closeDrawer()
  }
  expect(playing(), "the drawer closed on another state").toBe(was)
}

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
  {
    name: "lapsed behind the drawer",
    run: (): number => {
      openDrawer()
      pageTransition("pagehide", true)
      away(PICK_UP_MS + MIN)
      pageTransition("pageshow", true)
      closeDrawer()
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
    expect(activityTime(), `${route.name}: an activity off it`).toBe(
      world.played
    )
    expect(planned()).toBe(extended ? 25 * MIN : 20 * MIN)
    // Back in it: a resume that left it paused is played on by hand.
    if (!playing()) void useOrchestratorStore.getState().resume()
    expect(playing()).toBe(true)
  }

  expect(ending.run(), `closed off what was played`).toBe(
    Math.min(world.played, planned())
  )
  // A session closed at a stop forgets its activities' places; one played
  // to its end keeps them until the next start.
  if (ending.name === "played to its end") {
    expect(activityTime(), "an activity off what was played").toBe(
      Math.min(world.played, planned())
    )
  } else {
    expect(placesKept(), "places kept past the session's end").toBe(false)
  }
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

  it("SS2: a session started from its beginning recalls no activity's place", () => {
    world = {
      surface: "desktop",
      t: 0,
      engine: createEngineState(),
      played: 0,
      mount: null,
    }
    storedPlaces.keep(SESSION, SCENE_IDS[0] ?? "", CLOCK, 3 * MIN)
    storedPlaces.keep("another", SCENE_IDS[0] ?? "", CLOCK, MIN)
    open()
    pass(MIN, true)
    expect(activityTime()).toBe(MIN)
    expect(storedPlaces.recall("another", SCENE_IDS[0] ?? "", CLOCK)).toBe(MIN)
  })

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
