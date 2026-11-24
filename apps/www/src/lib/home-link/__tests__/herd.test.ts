/**
 * @vitest-environment jsdom
 *
 * **HERD1: a pull and everything beside it stay within home's limiter**
 * (#3101, epic #3100).
 *
 * - _Claim:_ in `lib/home-link`, no ordering of pulls, the app coming
 *   back, the network coming back, a lane's watch mounted again and edits
 *   on the phone, on a fast or a slow phone, sends home anything while a
 *   `429`'s `Retry-After` lasts, or more than one request each pace after
 *   it; against a limiter the pace fits, none is refused; a moment that
 *   changed nothing on the phone and lands while a lane's run is under way
 *   joins that run rather than asking another; and once left alone, no lane
 *   is still running and the link is idle, so the next pull starts afresh;
 *   and whatever the page's wall clock does (stand still, go back, jump
 *   forward), the pace grants a turn each pace on the page's own clock, so
 *   no wait for a turn lasts for good (#3491).
 * - _Family:_ every ordering of three of pull, app back in front, network
 *   back, watch remounted, edit and five seconds passing (two against
 *   home's smallest two-digit limiter); each answer at once or 3 s after its
 *   request (device and WebView speed: the S21 Ultra against the S26, as a
 *   delay the test sets, never the machine's); home's limiter at
 *   `RATE_LIMIT` 10, 60, and one the pace fits; moves 500 ms apart, quicker
 *   than a slow phone's runs; the page reopened before home's bucket
 *   refilled (`pace.test.ts`); the wall clock frozen, set back or jumped
 *   forward, within a page (`link-clock.test.ts`) and between page loads
 *   (`pace.test.ts`); the page's own clock stopped while the wall clock
 *   moves on (a phone asleep, `link-clock.test.ts`).
 * - _Proof:_ this file, over the real link, lanes, watches, pull and pace
 *   against home's GCRA limiter on a fake clock; `pace.test.ts` for the
 *   burst, the `429`'s spend and the pace kept across page loads, on any
 *   wall clock; `link-clock.test.ts` for the real link's requests while its
 *   wall clock stands still, goes back or jumps;
 *   `kept.test.ts` for a pull joining a run; `away.test.ts` for a pull
 *   keeping AW1's tries; `pull-refresh/__tests__/refreshers.test.ts` for
 *   one refresher asked once a pull however many screens hold it.
 * - _Tolerance:_ the pace learns home's limit only from its `429`, so the
 *   first burst against a home whose limit is under `BURST` is refused in
 *   part, once a day at most; a store that refuses the pace's record starts
 *   it whole on the next page load; a wall clock that jumped forward, in a
 *   page or between page loads, refills the pace as if that time had
 *   passed, at most `BURST`, which home's `429` then paces; requests outside this phone's
 *   app (its Chrome on home's pages) share home's bucket and are not paced
 *   here.
 */
import type { FakeClock } from "@/test-support/fake-clock"
import { fakeClock } from "@/test-support/fake-clock"
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { Kept } from "@/lib/home-link/kept-runtime"
import { createKept, laneExchange } from "@/lib/home-link/kept-runtime"
import { watchKept } from "@/lib/home-link/kept-watch"
import type { Lane, LaneId } from "@/lib/home-link/lanes"
import { busyNow } from "@/lib/home-link/lanes"
import type { HomeLinkState, Pairing } from "@/lib/home-link/model"
import { drainStopping } from "@/lib/home-link/model"
import { BURST, MS_PER_REQUEST } from "@/lib/home-link/pace"
import { homeRefresher } from "@/lib/home-link/pull"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"
import { onHidden } from "@/lib/home-link/visibility"

const BASE = "https://home.example/api/v1"

const held = vi.hoisted(
  (): { link: HomeLink | null; clock: FakeClock | null } => ({
    link: null,
    clock: null,
  })
)

function theLink(): HomeLink {
  if (held.link === null) throw new Error("no link made yet")
  return held.link
}

vi.mock("@/lib/home-link/index", async () => {
  const { pairingIn } = await import("@/lib/home-link/model")
  return {
    homeLink: theLink,
    pairing: (state?: HomeLinkState): Pairing =>
      pairingIn(state ?? theLink().getSnapshot()),
    LINK_CLOCK: {
      now: (): number => held.clock?.now() ?? 0,
      after: (ms: number, run: () => void): (() => void) =>
        held.clock?.after(ms, run) ?? ((): void => undefined),
    },
  }
})

/** Whether the app is in front: a trip home sets it hidden (HERD4). */
let front: DocumentVisibilityState = "visible"

beforeAll(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => front,
  })
})

const stops: Array<() => void> = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  held.link = null
  held.clock = null
  front = "visible"
})

/** Home's limiter: `size` at once, one back each `refillMs`. */
type Limiter = { readonly size: number; readonly refillMs: number }

/** The default, `RATE_LIMIT=60`, and the smallest two-digit one, `10`. */
const AT_60: Limiter = { size: 60, refillMs: 1_000 }
const AT_10: Limiter = { size: 10, refillMs: 6_000 }
/** One the pace fits exactly: no burst or refill of the phone's outruns it. */
const AT_PACE: Limiter = { size: BURST, refillMs: MS_PER_REQUEST }

type Sent = { readonly at: number; readonly status: number; retryAfter: number }

type Home = {
  readonly sent: Array<Sent>
  readonly clock: FakeClock
}

/** A paired link to home behind `limiter`, answering each request `latencyMs` after it went. */
async function pairedHome(limiter: Limiter, latencyMs: number): Promise<Home> {
  const sent: Array<Sent> = []
  const clock = fakeClock()
  held.clock = clock
  let tokens = limiter.size
  let filled = 0
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
    request: (_call: HomeRequest): Promise<HomeAnswer> => {
      const now = clock.now()
      tokens = Math.min(
        limiter.size,
        tokens + (now - filled) / limiter.refillMs
      )
      filled = now
      let answer: HomeAnswer
      if (tokens >= 1) {
        tokens -= 1
        answer = { status: 200, body: "{}" }
      } else {
        const wait = Math.max(
          1,
          Math.ceil(((1 - tokens) * limiter.refillMs) / 1_000)
        )
        answer = { status: 429, body: "", retryAfter: String(wait) }
      }
      sent.push({
        at: now,
        status: answer.status,
        retryAfter: answer.status === 429 ? Number(answer.retryAfter) : 0,
      })
      if (latencyMs === 0) return Promise.resolve(answer)
      return new Promise((resolve) =>
        clock.after(latencyMs, () => resolve(answer))
      )
    },
    onHidden: (listener) => onHidden(listener),
    now: clock.now,
    after: clock.after,
  })
  await held.link.load()
  return { sent, clock }
}

type Watched = {
  readonly id: LaneId
  readonly kept: Kept
  /** How many runs this lane has made. */
  readonly runs: () => number
  /** Changes what the lane would send, as an edit on the phone does. */
  readonly edit: () => void
  /** Its watch unmounted and mounted again, as aph's screens are. */
  readonly remount: () => void
}

/** A lane whose run reads home `reads` times, its watch started. */
function watchedLane(id: LaneId, reads: number): Watched {
  let revision = 0
  let runs = 0
  const listeners = new Set<() => void>()
  const lane: Lane = {
    id,
    exchange: async (send): Promise<HomeExchanged> => {
      runs += 1
      for (let n = 0; n < reads; n += 1) {
        const answer = await send("GET", `/${id}/${String(n)}`)
        if (answer.status !== 200) return { kind: "failed", why: "other" }
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
    exchange: laneExchange(lane, (): Pairing => ({ kind: "paired", id: "p" })),
    keep: (run) => theLink().drain(run),
    pairing: (): Pairing => ({ kind: "paired", id: "p" }),
    homeBusy: busyNow,
    stopping: () => drainStopping(theLink().getSnapshot()),
    inFront: () => document.visibilityState === "visible",
    now: () => held.clock?.now() ?? 0,
  })
  let unwatch = watchKept(lane, kept)
  stops.push(() => unwatch())
  return {
    id,
    kept,
    runs: () => runs,
    edit: (): void => {
      revision += 1
      for (const listener of listeners) listener()
    },
    remount: (): void => {
      unwatch()
      unwatch = watchKept(lane, kept)
    },
  }
}

/** The six lanes, practice reading home most to plan (`./drain`). */
function sixLanes(): Array<Watched> {
  return [
    watchedLane("practice", 9),
    watchedLane("aph", 2),
    watchedLane("jobs", 2),
    watchedLane("voice", 2),
    watchedLane("rust-rounds", 2),
    watchedLane("app-events", 1),
  ]
}

/**
 * Lets every answer and continuation due now run: a macrotask turn runs only
 * once every microtask queued before it has (nothing here waits on a real
 * timer; every one is the fake clock's).
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Moves the clock on by `ms`, running what falls due on the way and nothing after. */
async function pass(clock: FakeClock, ms: number): Promise<void> {
  const until = clock.now() + ms
  await flush()
  for (
    let due = clock.nextAt();
    due !== null && due <= until;
    due = clock.nextAt()
  ) {
    clock.next()
    await flush()
  }
  clock.pass(until - clock.now())
  await flush()
}

/**
 * Runs every timer until nothing waits: the page left alone, for at most
 * `QUIET_MS`, past which whatever still runs is a herd that never ends
 * (`expectSettled` then says so).
 */
async function quiet(clock: FakeClock): Promise<void> {
  const end = clock.now() + QUIET_MS
  await flush()
  while (clock.now() < end && clock.next()) await flush()
}

/** Long enough for six lanes' reads at one each minute, the slowest pace. */
const QUIET_MS = 30 * 60 * 1_000

/**
 * Home's limiter was respected as the pace promises: after each `429`,
 * nothing until its `Retry-After` has passed, and the `n`th request after
 * it no sooner than `n` paces on (the burst emptied, HERD1).
 */
function expectPaced(sent: ReadonlyArray<Sent>): void {
  sent.forEach((busy, i) => {
    if (busy.status !== 429) return
    const after = sent.slice(i + 1).filter(({ at }) => at > busy.at)
    for (const [n, request] of after.entries()) {
      expect(request.at).toBeGreaterThanOrEqual(
        busy.at + busy.retryAfter * 1_000
      )
      expect(request.at).toBeGreaterThanOrEqual(
        busy.at + (n + 1) * MS_PER_REQUEST
      )
    }
  })
}

/** Nothing is left running or held: the next pull starts afresh. */
function expectSettled(lanes: ReadonlyArray<Watched>): void {
  expect(lanes.filter(({ kept }) => kept.getSnapshot().running)).toEqual([])
  expect(theLink().getSnapshot().activity.kind).toBe("idle")
  expect(theLink().getSnapshot().drain.kind).toBe("idle")
}

type Move = "pull" | "front" | "online" | "remount" | "edit" | "wait"
const MOVES: ReadonlyArray<Move> = [
  "pull",
  "front",
  "online",
  "remount",
  "edit",
  "wait",
]

function* orderings(n: number): Generator<ReadonlyArray<Move>> {
  if (n === 0) {
    yield []
    return
  }
  for (const rest of orderings(n - 1)) {
    for (const move of MOVES) yield [...rest, move]
  }
}

/** A slow phone (the S21 Ultra) or home: each answer comes this long after its request. */
const SLOW_MS = 3_000
/** How long apart the moves come: the finger is quicker than a slow phone. */
const MOVE_MS = 500

async function play(
  order: ReadonlyArray<Move>,
  limiter: Limiter,
  latencyMs: number
): Promise<{ home: Home; lanes: Array<Watched> }> {
  const home = await pairedHome(limiter, latencyMs)
  const lanes = sixLanes()
  const pull = homeRefresher({
    watched: () => new Set(lanes.map(({ kept }) => kept)),
    doc: document,
  })
  for (const move of order) {
    switch (move) {
      case "pull": {
        void pull.checkAgain().catch(() => undefined)
        break
      }
      case "front": {
        document.dispatchEvent(new Event("visibilitychange"))
        break
      }
      case "online": {
        window.dispatchEvent(new Event("online"))
        break
      }
      case "remount": {
        lanes[1]?.remount()
        break
      }
      case "edit": {
        lanes[0]?.edit()
        break
      }
      case "wait": {
        await pass(home.clock, 5_000)
        break
      }
      default: {
        assertNever(move)
      }
    }
    await pass(home.clock, MOVE_MS)
  }
  await quiet(home.clock)
  return { home, lanes }
}

describe("a pull and everything beside it, against home's limiter (HERD1)", () => {
  // Every ordering of three moves (6^3 = 216) on a fast and a slow phone
  // against a limiter the pace fits, and of two (36) against home's
  // smallest two-digit one, whose 429s make each a long stretch of time.
  it(
    "never sends home anything while its Retry-After lasts, paces what follows, and leaves nothing running",
    { timeout: 120_000 },
    async () => {
      for (const [limiter, depth] of [
        [AT_PACE, 3],
        [AT_10, 2],
      ] as const) {
        for (const latencyMs of [0, SLOW_MS]) {
          for (const order of orderings(depth)) {
            const { home, lanes } = await play(order, limiter, latencyMs)
            expectPaced(home.sent)
            if (limiter === AT_PACE) {
              expect(home.sent.filter(({ status }) => status === 429)).toEqual(
                []
              )
            } else {
              // Some were refused, and every lane still got through.
              expect(
                lanes.every(
                  ({ kept }) => kept.getSnapshot().last?.kind === "synced"
                )
              ).toBe(true)
            }
            expectSettled(lanes)
            for (const stop of stops.splice(0)) stop()
          }
        }
      }
    }
  )

  it("sends no 429's worth at home's default, however many pulls come", async () => {
    const { home } = await play(
      ["pull", "pull", "front", "pull", "online", "pull"],
      AT_60,
      SLOW_MS
    )
    expect(home.sent.filter(({ status }) => status === 429)).toEqual([])
  })
})

describe("a moment that lands while a lane's run is under way joins it (HERD1)", () => {
  /** Reads per lane, all six. */
  const READS = 9 + 2 + 2 + 2 + 2 + 1

  for (const [move, act] of [
    [
      "the app coming back",
      (): void => {
        document.dispatchEvent(new Event("visibilitychange"))
      },
    ],
    [
      "the network coming back",
      (): void => {
        window.dispatchEvent(new Event("online"))
      },
    ],
  ] as const) {
    it(`${move}, on a slow phone: each lane runs once`, async () => {
      const home = await pairedHome(AT_60, SLOW_MS)
      const lanes = sixLanes()
      await pass(home.clock, MOVE_MS)
      act()
      await quiet(home.clock)
      expect(lanes.map((lane) => lane.runs())).toEqual([1, 1, 1, 1, 1, 1])
      expect(home.sent).toHaveLength(READS)
    })
  }

  it("a watch mounted again, on a slow phone: its lane runs once", async () => {
    const home = await pairedHome(AT_60, SLOW_MS)
    const lanes = sixLanes()
    await pass(home.clock, MOVE_MS)
    lanes[1]?.remount()
    await quiet(home.clock)
    expect(lanes.map((lane) => lane.runs())).toEqual([1, 1, 1, 1, 1, 1])
  })

  it("the app coming back and a pull right after, on a slow phone: each lane runs once, and the pull hears those runs", async () => {
    const home = await pairedHome(AT_60, SLOW_MS)
    const lanes = sixLanes()
    const pull = homeRefresher({
      watched: () => new Set(lanes.map(({ kept }) => kept)),
      doc: document,
    })
    document.dispatchEvent(new Event("visibilitychange"))
    await pass(home.clock, MOVE_MS)
    const checked = pull.checkAgain()
    await quiet(home.clock)
    await expect(checked).resolves.toBeUndefined()
    expect(lanes.map((lane) => lane.runs())).toEqual([1, 1, 1, 1, 1, 1])
    expect(home.sent).toHaveLength(READS)
  })

  it("an edit while its lane runs still asks one run after it: the change may have been missed", async () => {
    const home = await pairedHome(AT_60, SLOW_MS)
    const lanes = sixLanes()
    await pass(home.clock, MOVE_MS)
    lanes[0]?.edit()
    lanes[0]?.edit()
    await quiet(home.clock)
    expect(lanes.map((lane) => lane.runs())).toEqual([2, 1, 1, 1, 1, 1])
  })

  it("a trip home while a pull's runs are out, on a slow home: each lane is read through once the app is back, and none twice (HERD4)", async () => {
    const home = await pairedHome(AT_60, 6_000)
    const lanes = sixLanes()
    await quiet(home.clock)
    const before = lanes.map((lane) => lane.runs())
    const sentBefore = home.sent.length
    const pull = homeRefresher({
      watched: () => new Set(lanes.map(({ kept }) => kept)),
      doc: document,
    })
    void pull.checkAgain().catch(() => undefined)
    await pass(home.clock, 1_000)
    front = "hidden"
    document.dispatchEvent(new Event("visibilitychange"))
    await pass(home.clock, 1_000)
    front = "visible"
    document.dispatchEvent(new Event("visibilitychange"))
    await quiet(home.clock)
    // The lane the trip stopped runs again; every other lane runs once.
    expect(lanes.map((lane, i) => lane.runs() - (before[i] ?? 0))).toEqual([
      2, 1, 1, 1, 1, 1,
    ])
    // One read-through, and the one request the stopped run had out.
    expect(home.sent.length - sentBefore).toBe(READS + 1)
    expect(
      lanes.every(({ kept }) => kept.getSnapshot().last?.kind === "synced")
    ).toBe(true)
    expectSettled(lanes)
  })

  it("a pull with nothing running asks each lane once, one after another", async () => {
    const home = await pairedHome(AT_60, 0)
    const lanes = sixLanes()
    await quiet(home.clock)
    const pull = homeRefresher({
      watched: () => new Set(lanes.map(({ kept }) => kept)),
      doc: document,
    })
    const checked = pull.checkAgain()
    await quiet(home.clock)
    await expect(checked).resolves.toBeUndefined()
    expect(lanes.map((lane) => lane.runs())).toEqual([2, 2, 2, 2, 2, 2])
  })
})
