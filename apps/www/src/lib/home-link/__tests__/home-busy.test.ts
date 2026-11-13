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
import type { FakeClock } from "@/test-support/fake-clock"
import { fakeClock } from "@/test-support/fake-clock"
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { Kept } from "@/lib/home-link/kept-runtime"
import { createKept, laneExchange } from "@/lib/home-link/kept-runtime"
import { watchKept } from "@/lib/home-link/kept-watch"
import type { Lane, LaneId } from "@/lib/home-link/lanes"
import { busyNow } from "@/lib/home-link/lanes"
import type { HomeLinkState } from "@/lib/home-link/model"
import { homeRefresher } from "@/lib/home-link/pull"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"

const BASE = "https://home.example/api/v1"

/** The link this test made, and its clock, as `./index` hands them out. */
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
      now: (): number => held.clock?.now() ?? 0,
      after: (ms: number, run: () => void): (() => void) =>
        held.clock?.after(ms, run) ?? ((): void => undefined),
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
  held.link = null
})

type Home = {
  /** What reached home, by path. */
  readonly sent: Array<string>
  /** Moves the clock on by `ms`, running each timer that falls due. */
  readonly pass: (ms: number) => void
}

/** A paired link to a home that answers its first request busy, then 200. */
async function pairedHome(retryAfter: string): Promise<Home> {
  const sent: Array<string> = []
  const clock = fakeClock()
  held.clock = clock
  let busy = true
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
      if (!busy) return Promise.resolve({ status: 200, body: "{}" })
      busy = false
      return Promise.resolve({ status: 429, body: "", retryAfter })
    },
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
  })
  await held.link.load()
  return { sent, pass: clock.pass }
}

type Watched = {
  readonly kept: Kept
  /** Changes what the lane would send, as an edit on the phone does. */
  readonly edit: () => void
}

/**
 * A lane whose run reads `/<id>` once, over the link, its watch started
 * unless `watch` is false.
 */
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
      watchedLane("practice", false),
      watchedLane("jobs", false),
      watchedLane("voice", false),
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
})
