/**
 * @vitest-environment jsdom
 *
 * AW1 (#2928): away from home is a state the phone knows, said once and
 * waited out, not a failure per request. Held two ways:
 *
 * - over `./away`'s pure `stepAway`, every ordering up to six long of a
 *   request finding no answer, an answer, the hold's end, a network change
 *   or a pull, and time passing;
 * - over the real link, the lanes' runtimes and their watches, against a
 *   home that answers nothing (as off the home network) until it does:
 *   every moment that would ask while the hold lasts sends nothing, an
 *   evening away sends a bounded handful and reports once, a network change
 *   or a pull lets the next ask go at once, a tap still goes, and a request
 *   already in flight when the stretch began neither tells it again nor
 *   holds longer.
 */
import type { FakeClock } from "@/test-support/fake-clock"
import { fakeClock } from "@/test-support/fake-clock"
import { noAnswer } from "@/test-support/no-answer"
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import type { ForeignFailure } from "@some-ui/intent-kit"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { Away, AwayEvent } from "@/lib/home-link/away"
import {
  FIRST_HOLD_MS,
  held,
  holdMs,
  LONGEST_HOLD_MS,
  stepAway,
} from "@/lib/home-link/away"
import type { Kept } from "@/lib/home-link/kept-runtime"
import { createKept, laneExchange } from "@/lib/home-link/kept-runtime"
import { watchKept } from "@/lib/home-link/kept-watch"
import type { Lane, LaneId } from "@/lib/home-link/lanes"
import { busyNow } from "@/lib/home-link/lanes"
import type { HomeLinkState } from "@/lib/home-link/model"
import { awayHeld } from "@/lib/home-link/model"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"

const BASE = "https://home.example/api/v1"

/** The link this test made, and its clock, as `./index` hands them out. */
const made = vi.hoisted(
  (): { link: HomeLink | null; clock: FakeClock | null } => ({
    link: null,
    clock: null,
  })
)

function theLink(): HomeLink {
  if (made.link === null) throw new Error("no link made yet")
  return made.link
}

vi.mock("@/lib/home-link/index", () => {
  const pairingOf = (state?: HomeLinkState): string | null => {
    const now = state ?? theLink().getSnapshot()
    return now.link.kind === "paired" ? now.link.id : null
  }
  return {
    homeLink: theLink,
    pairingOf,
    paired: (): boolean => pairingOf() !== null,
    LINK_CLOCK: {
      now: (): number => made.clock?.now() ?? 0,
      after: (ms: number, run: () => void): (() => void) =>
        made.clock?.after(ms, run) ?? ((): void => undefined),
    },
  }
})

beforeAll(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
})

const stops: Array<() => void> = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  made.link = null
})

describe("stepAway over every ordering (AW1)", () => {
  type Move = AwayEvent | { readonly type: "pass"; readonly ms: number }
  const MOVES: ReadonlyArray<(now: number) => Move> = [
    (now): Move => ({ type: "unanswered", now }),
    (): Move => ({ type: "answered" }),
    (): Move => ({ type: "lapsed" }),
    (): Move => ({ type: "lookAgain" }),
    (): Move => ({ type: "pass", ms: FIRST_HOLD_MS }),
    (): Move => ({ type: "pass", ms: LONGEST_HOLD_MS }),
  ]

  function* orderings(n: number): Generator<ReadonlyArray<number>> {
    if (n === 0) {
      yield []
      return
    }
    for (const rest of orderings(n - 1)) {
      for (let i = 0; i < MOVES.length; i += 1) yield [...rest, i]
    }
  }

  it("is away only after a silence no answer followed, since its first, and holds at most ten minutes", () => {
    for (const order of orderings(6)) {
      let away: Away | null = null
      let now = 0
      // What the stretch should say: since its first silence, none once answered.
      let since: number | null = null
      for (const index of order) {
        const move = MOVES[index](now)
        if (move.type === "pass") {
          now += move.ms
          continue
        }
        const before = away
        away = stepAway(away, move)
        if (move.type === "answered") since = null
        if (move.type === "unanswered") {
          since ??= now
          // A silence while held is from a request sent before the hold.
          if (held(before, now)) expect(away).toBe(before)
          else expect(away?.heldUntil).toBe(now + holdMs(before?.tries ?? 0))
        }
        if (move.type === "lapsed" || move.type === "lookAgain") {
          expect(away?.heldUntil ?? null).toBeNull()
        }
        expect(away?.since ?? null).toBe(since)
      }
    }
  })

  it("holds 30 s, doubling to ten minutes, and no longer", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(holdMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000, 600_000,
    ])
  })
})

type Home = {
  /** What reached home (or would have, off the home network), by path. */
  readonly sent: Array<string>
  /** What the link told of home, once a stretch. */
  readonly told: Array<ForeignFailure>
  readonly clock: FakeClock
  /** Whether home answers: false is off the home network. */
  reachable: boolean
  /** Hold every request until `release`, to order it against others. */
  hold: boolean
  /** Lets every held request go, in the order sent, or the other way. */
  readonly release: (reversed?: boolean) => void
}

/** A paired link to a home that answers 200 when `reachable`, nothing when not. */
async function pairedHome(): Promise<Home> {
  const clock = fakeClock(1_000_000)
  made.clock = clock
  const waiting: Array<() => void> = []
  const home: Home = {
    sent: [],
    told: [],
    clock,
    reachable: false,
    hold: false,
    release: (reversed = false) => {
      const all = waiting.splice(0)
      for (const go of reversed ? all.reverse() : all) go()
    },
  }
  made.link = createHomeLink({
    credential: {
      read: () =>
        Promise.resolve({
          record: JSON.stringify({ base: BASE, token: "t", id: "p" }),
          lost: false,
        }),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    request: (call: HomeRequest): Promise<HomeAnswer> => {
      home.sent.push(call.url.slice(BASE.length))
      const answer = (): Promise<HomeAnswer> =>
        home.reachable
          ? Promise.resolve({ status: 200, body: "{}" })
          : Promise.reject(noAnswer())
      if (!home.hold) return answer()
      // Decided when released, as a request in flight is.
      return new Promise((resolve, reject) => {
        waiting.push(() => {
          answer().then(resolve, reject)
        })
      })
    },
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
    report: (failure) => home.told.push(failure),
    onNetwork: (listener) => {
      window.addEventListener("online", listener)
      return (): void => {
        window.removeEventListener("online", listener)
      }
    },
  })
  await made.link.load()
  return home
}

type Watched = {
  readonly kept: Kept
  /** Changes what the lane would send, as an edit on the phone does. */
  readonly edit: () => void
}

/** A lane whose run reads `/<id>` once, over the link, watched unless `watch` is false. */
function watchedLane(id: LaneId, watch = true): Watched {
  let revision = 0
  const listeners = new Set<() => void>()
  const lane: Lane = {
    id,
    exchange: async (send): Promise<HomeExchanged> => {
      const answer = await send("GET", `/${id}`)
      return answer.status === 200
        ? { kind: "synced" }
        : { kind: "failed", why: "other" }
    },
    revision: () => revision,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    useCounts: () => {
      throw new Error("not shown here")
    },
  }
  const kept = createKept({
    exchange: laneExchange(lane, () => "p"),
    keep: (run) => theLink().drain(run),
    paired: () => true,
    homeBusy: busyNow,
    now: () => 0,
  })
  if (watch) stops.push(watchKept(lane, kept))
  return {
    kept,
    edit: (): void => {
      revision += 1
      for (const listener of listeners) listener()
    },
  }
}

/** Resolves once no lane runs and the link does nothing. */
async function settled(lanes: ReadonlyArray<Watched>): Promise<void> {
  await vi.waitFor(() => {
    expect(lanes.some(({ kept }) => kept.getSnapshot().running)).toBe(false)
    expect(theLink().getSnapshot().activity.kind).toBe("idle")
    expect(theLink().getSnapshot().drain.kind).toBe("idle")
  })
  // A run asked for as the last one ended starts on a later turn.
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(lanes.some(({ kept }) => kept.getSnapshot().running)).toBe(false)
}

const kinds = (lanes: ReadonlyArray<Watched>): Array<unknown> =>
  lanes.map(({ kept }) => kept.getSnapshot().last?.kind)

const threeLanes = (): Array<Watched> => [
  watchedLane("practice"),
  watchedLane("jobs"),
  watchedLane("voice"),
]

describe("away from home over the real link (AW1)", () => {
  it("one silence starts the stretch, told once; while held, every moment sends nothing and says no answer", async () => {
    const home = await pairedHome()
    const lanes = threeLanes()
    await settled(lanes)
    expect(home.sent).toEqual(["/practice"])
    expect(kinds(lanes)).toEqual(["unreachable", "unreachable", "unreachable"])
    expect(theLink().getSnapshot().away?.since).toBe(1_000_000)

    for (let n = 0; n < 3; n += 1) {
      document.dispatchEvent(new Event("visibilitychange"))
      lanes[n]?.edit()
      await settled(lanes)
    }
    home.clock.pass(FIRST_HOLD_MS - 1)
    await settled(lanes)
    expect(home.sent).toEqual(["/practice"])
    expect(home.told).toHaveLength(1)
    expect(home.told[0]?.error.kind).toBe("unreachable")
  })

  it("an evening away sends a bounded handful, one each hold, and is told once", async () => {
    const home = await pairedHome()
    const lanes = threeLanes()
    await settled(lanes)
    // Four hours, with the app brought back to the front every 5 minutes.
    for (let minutes = 0; minutes < 240; minutes += 5) {
      home.clock.pass(300_000)
      document.dispatchEvent(new Event("visibilitychange"))
      await settled(lanes)
    }
    // 30 s, 1, 2, 4, 8 minutes, then one each 10 minutes: under 30, where
    // one try each 10 s would be about 1,440.
    expect(home.sent.length).toBeGreaterThan(5)
    expect(home.sent.length).toBeLessThan(30)
    expect(home.told).toHaveLength(1)
    expect(theLink().getSnapshot().away?.since).toBe(1_000_000)
  })

  it("the hold's end asks again; home answering ends the stretch and every lane goes", async () => {
    const home = await pairedHome()
    const lanes = threeLanes()
    await settled(lanes)
    home.reachable = true
    home.clock.pass(FIRST_HOLD_MS)
    await settled(lanes)
    expect(theLink().getSnapshot().away).toBeNull()
    expect(home.sent.slice(1).sort()).toEqual(["/jobs", "/practice", "/voice"])
    expect(kinds(lanes)).toEqual(["synced", "synced", "synced"])
  })

  it("a network change lets the next ask go at once, and shortens the next hold again", async () => {
    const home = await pairedHome()
    const lanes = threeLanes()
    await settled(lanes)
    home.clock.pass(FIRST_HOLD_MS)
    await settled(lanes)
    expect(theLink().getSnapshot().away?.tries).toBe(2)
    expect(home.sent).toHaveLength(2)

    window.dispatchEvent(new Event("online"))
    await settled(lanes)
    expect(home.sent).toHaveLength(3)
    // Still away: held the first hold's length again, not the third's.
    expect(theLink().getSnapshot().away?.heldUntil).toBe(
      home.clock.now() + FIRST_HOLD_MS
    )

    home.reachable = true
    window.dispatchEvent(new Event("online"))
    await settled(lanes)
    expect(theLink().getSnapshot().away).toBeNull()
    expect(kinds(lanes)).toEqual(["synced", "synced", "synced"])
  })

  it("a tap still goes while held, and its answer ends the stretch", async () => {
    const home = await pairedHome()
    const lanes = threeLanes()
    await settled(lanes)
    home.reachable = true
    const sent = await theLink().send((send) => send("GET", "/tapped"))
    expect(sent?.kind).toBe("done")
    expect(home.sent).toContain("/tapped")
    expect(theLink().getSnapshot().away).toBeNull()
  })

  it("requests in flight as the stretch begins tell it once and hold no longer, in either order", async () => {
    for (const tapFirst of [true, false]) {
      const home = await pairedHome()
      home.hold = true
      const lanes = [watchedLane("practice")]
      const tap = theLink().sync((get) => get(`${BASE}/sync`))
      await vi.waitFor(() => expect(home.sent).toHaveLength(2))
      home.release(!tapFirst)
      await expect(tap).rejects.toThrow()
      await settled(lanes)
      expect(home.told).toHaveLength(1)
      expect(theLink().getSnapshot().away?.tries).toBe(1)
      expect(
        awayHeld(theLink().getSnapshot(), home.clock.now() + FIRST_HOLD_MS - 1)
      ).toBe(true)
      expect(
        awayHeld(theLink().getSnapshot(), home.clock.now() + FIRST_HOLD_MS)
      ).toBe(false)
      for (const stop of stops.splice(0)) stop()
    }
  })

  it("an answer that lands after the stretch began, from a request sent before it, ends the stretch", async () => {
    const home = await pairedHome()
    home.reachable = true
    home.hold = true
    const tap = theLink().sync((get) => get(`${BASE}/sync`))
    await vi.waitFor(() => expect(home.sent).toEqual(["/sync"]))
    home.reachable = false
    home.hold = false
    watchedLane("practice")
    await vi.waitFor(() => expect(theLink().getSnapshot().away).not.toBeNull())
    home.reachable = true
    home.release()
    await tap
    expect(theLink().getSnapshot().away).toBeNull()
  })

  it("a screen's read the person asked for goes while held; one on its own does not", async () => {
    const home = await pairedHome()
    const lanes = threeLanes()
    await settled(lanes)
    const before = home.sent.length
    await expect(
      theLink().keep((send) => send("GET", "/on-its-own"), { onItsOwn: true })
    ).rejects.toThrow()
    expect(home.sent).toHaveLength(before)
    home.reachable = true
    const read = await theLink().keep((send) => send("GET", "/asked"))
    expect(read?.kind).toBe("done")
    expect(home.sent[before]).toBe("/asked")
    expect(theLink().getSnapshot().away).toBeNull()
  })

  it("a pairing or Unpair that finds no answer starts no stretch, and is not told as one", async () => {
    const home = await pairedHome()
    await theLink().unpair()
    expect(theLink().getSnapshot().link.kind).toBe("unpaired")
    expect(theLink().getSnapshot().away).toBeNull()
    expect(home.told).toEqual([])
  })
})
