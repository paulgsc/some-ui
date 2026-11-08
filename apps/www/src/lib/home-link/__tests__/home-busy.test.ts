/**
 * @vitest-environment jsdom
 *
 * AD3: after home says busy (`429`), the phone sends it nothing until home's
 * `Retry-After` has passed, then asks once. Held over the real link, the
 * lanes' runtimes, their watches and the pull, against a home that answers
 * busy once: every moment that would ask while home is busy (the app coming
 * back, the network, an edit, a pull) sends nothing and says busy, and the
 * end of the wait asks each lane it turned away once.
 */
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { Kept } from "@/lib/home-link/kept-runtime"
import { createKept, laneExchange } from "@/lib/home-link/kept-runtime"
import type { Refill } from "@/lib/home-link/kept-watch"
import { createRefill, watchKept } from "@/lib/home-link/kept-watch"
import type { Lane, LaneId } from "@/lib/home-link/lanes"
import type { HomeLinkState } from "@/lib/home-link/model"
import { homeRefresher } from "@/lib/home-link/pull"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"

const BASE = "https://home.example/api/v1"

const held = vi.hoisted((): { link: HomeLink | null } => ({ link: null }))

/** The link this test made, as `./index` hands it out. */
function theLink(): HomeLink {
  if (held.link === null) throw new Error("no link made yet")
  return held.link
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
  held.link = null
})

type Home = {
  /** What reached home, by path. */
  readonly sent: Array<string>
  /** Moves the clock on by `ms`, running each timer that falls due. */
  readonly pass: (ms: number) => void
  /** Has home answer the next request busy, asking for `retryAfter`. */
  readonly refuse: (retryAfter: string) => void
  /** The watches' refill schedule, on this home's clock. */
  readonly refill: Refill
}

/**
 * A paired link to a home that answers 200, but its first request busy
 * when `retryAfter` is given.
 */
async function pairedHome(retryAfter: string | null): Promise<Home> {
  const sent: Array<string> = []
  let now = 0
  let timers: Array<{ at: number; run: () => void }> = []
  let busy = retryAfter
  const after = (ms: number, run: () => void): (() => void) => {
    const timer = { at: now + ms, run }
    timers.push(timer)
    return (): void => {
      timers = timers.filter((each) => each !== timer)
    }
  }
  held.link = createHomeLink({
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
      sent.push(call.url.slice(BASE.length))
      const asked = busy
      if (asked === null) return Promise.resolve({ status: 200, body: "{}" })
      busy = null
      return Promise.resolve({ status: 429, body: "", retryAfter: asked })
    },
    onHidden: () => (): void => undefined,
    now: () => now,
    after,
  })
  await held.link.load()
  return {
    sent,
    pass: (ms): void => {
      now += ms
      const due = timers.filter((timer) => timer.at <= now)
      timers = timers.filter((timer) => timer.at > now)
      for (const timer of due) timer.run()
    },
    refuse: (asked): void => {
      busy = asked
    },
    refill: createRefill(() => now, after),
  }
}

type Watched = {
  readonly kept: Kept
  /** Changes what the lane would send, as an edit on the phone does. */
  readonly edit: () => void
}

type LaneOptions = {
  /** Start its watch (on `refill`, when given). */
  readonly watch?: boolean
  readonly refill?: Refill
  /** Items waiting: each run reads `/<id>` once per item until none is left. */
  readonly items?: number
  /** Its share of requests per run. */
  readonly share?: number
}

/**
 * A lane whose run reads `/<id>` over the link, once, or once per item
 * still waiting; its watch started unless `watch` is false.
 */
function watchedLane(id: LaneId, options: LaneOptions = {}): Watched {
  const { watch = true, refill, items, share = 8 } = options
  let left = items ?? 1
  let revision = 0
  const listeners = new Set<() => void>()
  const lane: Lane = {
    id,
    exchange: async (send): Promise<HomeExchanged> => {
      if (items === undefined) left = 1
      while (left > 0) {
        const answer = await send("GET", `/${id}`)
        if (answer.status !== 200) return { kind: "failed", why: "other" }
        left -= 1
      }
      return { kind: "synced" }
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
    exchange: laneExchange(lane, () => "p", share),
    keep: (run) => theLink().keep(run),
    paired: () => true,
    homeBusy: () => theLink().getSnapshot().homeBusyUntil !== null,
    now: () => 0,
  })
  if (watch) {
    stops.push(
      refill === undefined
        ? watchKept(lane, kept)
        : watchKept(lane, kept, document, window, refill)
    )
  }
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
  })
  // A run asked for as the last one ended starts on a later turn.
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(lanes.some(({ kept }) => kept.getSnapshot().running)).toBe(false)
}

const lastOf = (lanes: ReadonlyArray<Watched>): Array<unknown> =>
  lanes.map(({ kept }) => kept.getSnapshot().last)

const BUSY = { kind: "failed", why: "busy" }

describe("home busy (AD3)", () => {
  it("after home says busy, the phone sends nothing until home's Retry-After has passed, then asks once", async () => {
    const home = await pairedHome("30")
    const lanes = [
      watchedLane("practice"),
      watchedLane("jobs"),
      watchedLane("voice"),
    ]
    await settled(lanes)
    // The first lane's one read was turned away; the others never reached home.
    expect(home.sent).toEqual(["/practice"])

    // Every moment that would ask while home is busy: each lane says so,
    // and nothing is sent.
    for (let n = 0; n < 3; n += 1) {
      document.dispatchEvent(new Event("visibilitychange"))
      await settled(lanes)
    }
    window.dispatchEvent(new Event("online"))
    await settled(lanes)
    lanes[1]?.edit()
    lanes[1]?.edit()
    await settled(lanes)
    home.pass(29_999)
    document.dispatchEvent(new Event("visibilitychange"))
    await settled(lanes)
    expect(home.sent).toEqual(["/practice"])
    expect(lastOf(lanes)).toEqual([BUSY, BUSY, BUSY])

    // The wait over, each lane is asked once, one after another.
    home.pass(1)
    await settled(lanes)
    expect(home.sent.slice(1).sort()).toEqual(["/jobs", "/practice", "/voice"])
    expect(lastOf(lanes)).toEqual([
      { kind: "synced", at: 0 },
      { kind: "synced", at: 0 },
      { kind: "synced", at: 0 },
    ])
  })

  it("a pull stops at home's busy: the lanes after it say busy, and nothing more is sent", async () => {
    const home = await pairedHome("60")
    const lanes = [
      watchedLane("practice", { watch: false }),
      watchedLane("jobs", { watch: false }),
      watchedLane("voice", { watch: false }),
    ]
    const pull = homeRefresher({
      watched: () => new Set(lanes.map(({ kept }) => kept)),
      doc: document,
      free: () => Promise.resolve(),
    })
    await expect(pull.checkAgain()).rejects.toThrow()
    expect(home.sent).toEqual(["/practice"])
    expect(lastOf(lanes)).toEqual([BUSY, BUSY, BUSY])
  })

  it("a lane that stopped at its share drains by itself, a turn at a time, until a run ends uncapped", async () => {
    const home = await pairedHome(null)
    const lanes = [
      watchedLane("app-events", { refill: home.refill, items: 5, share: 2 }),
    ]
    await settled(lanes)
    expect(home.sent).toHaveLength(2)
    expect(lastOf(lanes)).toEqual([{ kind: "capped", at: 0, sent: 2 }])

    // Twice home's refill time of what it sent: 2 requests, 4 s.
    home.pass(3_999)
    await settled(lanes)
    expect(home.sent).toHaveLength(2)
    home.pass(1)
    await settled(lanes)
    expect(home.sent).toHaveLength(4)
    home.pass(4_000)
    await settled(lanes)
    expect(home.sent).toHaveLength(5)
    expect(lastOf(lanes)).toEqual([{ kind: "synced", at: 0 }])
    // In step: nothing more asks on its own.
    home.pass(600_000)
    await settled(lanes)
    expect(home.sent).toHaveLength(5)
  })

  it("lanes capped together take turns, sending at most one request per 2 s between them", async () => {
    const home = await pairedHome(null)
    const lanes = [
      watchedLane("practice", { refill: home.refill, items: 6, share: 2 }),
      watchedLane("voice", { refill: home.refill, items: 6, share: 2 }),
    ]
    await settled(lanes)
    expect(home.sent).toHaveLength(4)
    // Their turns: the first at 4 s, the second at 8 s, then 12 s, 16 s.
    const counts: Array<number> = []
    for (let s = 1; s <= 16; s += 1) {
      home.pass(1_000)
      await settled(lanes)
      counts.push(home.sent.length)
    }
    expect(counts).toEqual([
      4, 4, 4, 6, 6, 6, 6, 8, 8, 8, 8, 10, 10, 10, 10, 12,
    ])
  })

  it("a capped lane's turn while home is busy waits for the busy's one ask", async () => {
    const home = await pairedHome(null)
    const capped = watchedLane("app-events", {
      refill: home.refill,
      items: 5,
      share: 2,
    })
    const other = watchedLane("jobs", { refill: home.refill })
    const lanes = [capped, other]
    await settled(lanes)
    home.sent.splice(0)
    // Home turns the other lane away for 30 s; the capped lane's turn (4 s)
    // falls inside it.
    home.refuse("30")
    other.edit()
    await settled(lanes)
    expect(home.sent).toEqual(["/jobs"])
    home.pass(29_999)
    await settled(lanes)
    expect(home.sent).toEqual(["/jobs"])
    home.pass(1)
    await settled(lanes)
    expect(home.sent.slice(1).sort()).toEqual([
      "/app-events",
      "/app-events",
      "/jobs",
    ])
  })
})
