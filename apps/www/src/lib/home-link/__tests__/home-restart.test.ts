/**
 * @vitest-environment jsdom
 *
 * **HR1: a paired phone reads and sends again once home is back from a
 * restart, with nothing asked of the person** (#3197's S21 report:
 * after the new APK asked home to update, aph showed none of home's history
 * until the app was brought back).
 *
 * - _Claim:_ in `lib/home-link`, a request other than a pairing's or an
 *   Unpair's that home's door answers for a server that is down or slow
 *   (`502`, `504`; paulgsc/server's file host sends neither) is held as
 *   home's silence (AW1) and said as itself, never as away (NA1's `door`);
 *   a read the person opened says home didn't answer, once, and Studio's
 *   heard poll keeps asking; so, with the app left in front and nothing
 *   tapped, edited or pulled, every lane whose run met home restarting runs
 *   again and is synced, and what home says of this build is asked again
 *   once home answers, at most one hold (AW1's, ten minutes at most) after
 *   home is back.
 * - _Family:_ how home's restart answers (`502`, `504`, no answer at all);
 *   how long it lasts (under the first hold, one hold, several, past the
 *   longest), against the holds' doubling; whether home had said it is
 *   updating (the on-demand deploy, #2843) or said nothing; how many lanes
 *   are asked as it starts (one, three); who meets it (a lane's run, a
 *   screen's read on its own polled through the hold, a read the person
 *   opened (`askWhileBusy`'s, My data's), a pairing or Unpair,
 *   which AW1 leaves out of the hold and which ends no stretch on it).
 * - _Proof:_ this file, over the real link, lanes' runtimes and watches, and
 *   the compat ask's runtime and watch, against a fake home on a fake clock;
 *   `./blocked.test.ts` for NA1's other reasons; `./words.test.ts` for the
 *   lines.
 * - _Tolerance:_ the phone learns home is back only by a try, so a lane
 *   catches up as much as one hold (10 minutes at most) after home is back;
 *   a restart that no request of the phone's met leaves what home said of
 *   this build ("Home updating") until the next moment `./serves` names
 *   (the app back in front, a pull), since nothing sends on a timer; a
 *   `504` for a slow request home is still working on reads the same as a
 *   restart, and what it carried goes again with the hold's next try, which
 *   home's keyed writes answer unchanged.
 *
 * **HR2: home starting up slows the phone only while it says so.**
 *
 * - _Claim:_ in `lib/home-link`, home's overload (`503 service_overloaded`
 *   with a `Retry-After`, HERD2) holds requests until its `Retry-After` and
 *   teaches the pace nothing; only a `429`, home's limiter, teaches the pace
 *   the phone keeps across page loads (HERD1).
 * - _Family:_ the answer (`429`, an overload `503`), its `Retry-After`
 *   (under the pace, at it, past the slowest), and one or several in a row.
 * - _Proof:_ this file, "HR2", over the real link and the pace's own
 *   record; `./pace.test.ts` for what a `429` teaches.
 * - _Tolerance:_ none.
 */
import type { FakeClock } from "@/test-support/fake-clock"
import { fakeClock } from "@/test-support/fake-clock"
import { noAnswer } from "@/test-support/no-answer"
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import { LONGEST_HOLD_MS } from "@/lib/home-link/away"
import { askCompat } from "@/lib/home-link/compat-read"
import { askHeard } from "@/lib/home-link/heard"
import type { Kept } from "@/lib/home-link/kept-runtime"
import { createKept, laneExchange } from "@/lib/home-link/kept-runtime"
import { watchKept } from "@/lib/home-link/kept-watch"
import type { Lane, LaneId } from "@/lib/home-link/lanes"
import { busyNow } from "@/lib/home-link/lanes"
import type { HomeLinkState, Pairing } from "@/lib/home-link/model"
import type { PaceMemory } from "@/lib/home-link/pace"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink, fromHomesDoor } from "@/lib/home-link/runtime"
import type { ServesRun } from "@/lib/home-link/serves"
import { createServes, watchServes } from "@/lib/home-link/serves"
import { signInView } from "@/lib/home-link/sign-in-words"
import { asked, askWhileBusy } from "@/lib/home-link/while-busy"

import { MACHINERY } from "./machinery"

const BASE = "https://home.example/api/v1"

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

vi.mock("@/lib/home-link/index", async () => {
  const { pairingIn } = await import("@/lib/home-link/model")
  return {
    homeLink: theLink,
    pairing: (state?: HomeLinkState): Pairing =>
      pairingIn(state ?? theLink().getSnapshot()),
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

/** How home's restart answers a request. */
type Down = "502" | "504" | "silent"

type Home = {
  readonly clock: FakeClock
  readonly sent: Array<string>
  /** Until when home restarts, on the clock; answers normally after. */
  upAt: number
  readonly down: Down
  /** What `/compat` says while home has not yet restarted. */
  updating: boolean
}

/** Caddy's own page for an upstream it couldn't reach: not home's JSON. */
const doorAnswer = (status: 502 | 504): HomeAnswer => ({
  status,
  body: "<html>Bad Gateway</html>",
})

async function pairedHome(down: Down, upAt: number): Promise<Home> {
  const clock = fakeClock()
  made.clock = clock
  const home: Home = {
    clock,
    sent: [],
    upAt,
    down,
    updating: true,
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
      const path = call.url.replace("https://home.example", "")
      home.sent.push(path)
      if (clock.now() < home.upAt) {
        if (home.down === "silent") return Promise.reject(noAnswer())
        return Promise.resolve(doorAnswer(home.down === "502" ? 502 : 504))
      }
      if (path.startsWith("/compat")) {
        return Promise.resolve({
          status: 200,
          body: JSON.stringify(
            home.updating
              ? { supported: false, deploy: "wanted" }
              : { supported: true, deploy: "none" }
          ),
        })
      }
      return Promise.resolve({ status: 200, body: "{}" })
    },
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
  })
  await made.link.load()
  return home
}

/** A lane whose run reads `/<id>` once, over the link, watched. */
function watchedLane(id: LaneId): Kept {
  const lane: Lane = {
    id,
    exchange: async (send): Promise<HomeExchanged> => {
      const answer = await send("GET", `/${id}`)
      return answer.status === 200
        ? { kind: "synced" }
        : { kind: "failed", why: `home answered ${String(answer.status)}` }
    },
    revision: () => 0,
    subscribe: () => (): void => undefined,
    useCounts: () => {
      throw new Error("not shown here")
    },
  }
  const kept = createKept({
    exchange: laneExchange(lane, (): Pairing => ({ kind: "paired", id: "p" })),
    keep: (run) => theLink().drain(run),
    pairing: (): Pairing => ({ kind: "paired", id: "p" }),
    homeBusy: busyNow,
    now: () => 0,
  })
  stops.push(watchKept(lane, kept))
  return kept
}

function watchedServes(): ServesRun {
  const run = createServes({
    read: () => askCompat(22),
    now: () => made.clock?.now() ?? 0,
  })
  stops.push(watchServes(run, { link: theLink(), doc: document }))
  return run
}

/** Resolves once no lane or ask runs and the link does nothing. */
async function settled(
  lanes: ReadonlyArray<Kept>,
  serves: ServesRun
): Promise<void> {
  await vi.waitFor(() => {
    expect(lanes.some((kept) => kept.getSnapshot().running)).toBe(false)
    expect(serves.getSnapshot().asking).toBe(false)
    expect(theLink().getSnapshot().drain.kind).toBe("idle")
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(lanes.some((kept) => kept.getSnapshot().running)).toBe(false)
}

/** Lets `ms` pass in steps, each settled, with the app left in front. */
async function wait(
  home: Home,
  ms: number,
  lanes: ReadonlyArray<Kept>,
  serves: ServesRun
): Promise<void> {
  const step = 5_000
  for (let gone = 0; gone < ms; gone += step) {
    home.clock.pass(Math.min(step, ms - gone))
    await settled(lanes, serves)
  }
}

const RESTARTS = [10_000, 30_000, 240_000, 900_000] as const
const DOWN: ReadonlyArray<Down> = ["502", "504", "silent"]
const LANES: ReadonlyArray<ReadonlyArray<LaneId>> = [
  ["aph"],
  ["aph", "rust-rounds", "voice"],
]

describe("HR1: back from a restart, with the app left in front", () => {
  it("reads home's door, not home, in 502 and 504 alone", () => {
    expect(fromHomesDoor({ status: 502 })).toBe(true)
    expect(fromHomesDoor({ status: 504 })).toBe(true)
    for (const status of [200, 404, 429, 500, 503]) {
      expect(fromHomesDoor({ status })).toBe(false)
    }
  })

  for (const down of DOWN) {
    it(`with nothing said of this build, every lane still catches up (${down})`, async () => {
      const home = await pairedHome(down, 0)
      home.upAt = home.clock.now() + 240_000
      const serves = createServes({
        read: () => askCompat(22),
        now: () => made.clock?.now() ?? 0,
      })
      const lanes = [watchedLane("aph"), watchedLane("jobs")]
      await settled(lanes, serves)
      await wait(home, 240_000 + LONGEST_HOLD_MS, lanes, serves)
      expect(lanes.map((kept) => kept.getSnapshot().last?.kind)).toEqual([
        "synced",
        "synced",
      ])
      // Nothing asked what home says of this build: there was no watch.
      expect(serves.getSnapshot().serves).toBeNull()
    })
    for (const lasts of RESTARTS) {
      for (const ids of LANES) {
        it(`every lane and what home says of this build catch up (${down}, ${String(lasts / 1000)} s, ${String(ids.length)} lane(s))`, async () => {
          // Home says it is updating, then goes down to restart.
          const home = await pairedHome(down, 0)
          const serves = watchedServes()
          await vi.waitFor(() =>
            expect(serves.getSnapshot().serves).toBe("updating")
          )
          home.upAt = home.clock.now() + lasts
          home.updating = false
          const lanes = ids.map((id) => watchedLane(id))
          await settled(lanes, serves)
          expect(lanes.map((kept) => kept.getSnapshot().last?.kind)).toEqual(
            ids.map(() => "unreachable")
          )
          // Said as home not answering, not as away, unless it was silence.
          expect(theLink().getSnapshot().blocked?.reason ?? null).toBe(
            down === "silent" ? null : "door"
          )

          await wait(home, lasts + LONGEST_HOLD_MS, lanes, serves)

          expect(lanes.map((kept) => kept.getSnapshot().last?.kind)).toEqual(
            ids.map(() => "synced")
          )
          expect(serves.getSnapshot().serves).toBe("fits")
          expect(theLink().getSnapshot().away).toBeNull()
          expect(theLink().getSnapshot().blocked).toBeNull()
          // One try each hold, never a herd: AW1's bound, per lane and ask.
          const holds = Math.ceil(Math.log2(lasts / 30_000 + 1)) + 2
          expect(home.sent.length).toBeLessThanOrEqual(
            (ids.length + 1) * (holds + 2)
          )
        })
      }
    }
  }

  it("a restart no request met leaves home's last word until the next moment (tolerance)", async () => {
    const home = await pairedHome("502", 0)
    const serves = watchedServes()
    await vi.waitFor(() => expect(serves.getSnapshot().serves).toBe("updating"))
    home.updating = false
    await wait(home, 60_000, [], serves)
    expect(serves.getSnapshot().serves).toBe("updating")
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.waitFor(() => expect(serves.getSnapshot().serves).toBe("fits"))
  })

  it("a screen's read polled through the restart asks again each time, never away (heard)", async () => {
    for (const down of ["502", "504"] as const) {
      const home = await pairedHome(down, Number.MAX_SAFE_INTEGER)
      // Studio's idea screen polls every 5 s: inside the hold, and after it.
      for (let poll = 0; poll < 8; poll += 1) {
        expect(await askHeard("note-1")).toEqual({ kind: "busy" })
        home.clock.pass(5_000)
      }
      home.upAt = 0
      home.clock.pass(LONGEST_HOLD_MS)
      expect(await askHeard("note-1")).not.toEqual({ kind: "busy" })
    }
  })

  it("a read the person opened says home didn't answer, once, never that the phone was busy", async () => {
    for (const down of ["502", "504"] as const) {
      const home = await pairedHome(down, Number.MAX_SAFE_INTEGER)
      const before = home.sent.length
      const said = await askWhileBusy(() =>
        asked(() => theLink().keep((send) => send("GET", "/voice-notes/kept")))
      )
      expect(said).toEqual({ kind: "unreachable" })
      expect(home.sent.length - before).toBe(1)
    }
  })

  it("a pairing's request that meets home's door ends no stretch and releases nothing (AW1's carve-out)", async () => {
    const home = await pairedHome("502", Number.MAX_SAFE_INTEGER)
    await theLink()
      .drain((send) => send("GET", "/aph"))
      .catch(() => undefined)
    const before = theLink().getSnapshot()
    expect(before.away).not.toBeNull()
    await theLink().unpair()
    expect(home.sent.at(-1)).toBe("/api/v1/auth/sign-out")
    expect(theLink().getSnapshot().awayReleases).toBe(before.awayReleases)
  })

  it("says home not answering on the sign-in sheet as itself: never away, in the person's terms", async () => {
    await pairedHome("502", Number.MAX_SAFE_INTEGER)
    await theLink()
      .drain((send) => send("GET", "/aph"))
      .catch(() => undefined)
    const view = signInView(theLink().getSnapshot())
    const words = [view.label, view.line, ...view.notes].join(" ")
    expect(words).toMatch(/isn't answering/)
    expect(words).not.toMatch(/away/i)
    expect(words).not.toMatch(MACHINERY)
  })
})

describe("HR2: an overload teaches the pace nothing; a 429 does", () => {
  const OVERLOAD = JSON.stringify({ error: { code: "service_overloaded" } })

  /** What the pace kept after the link heard `answers` in turn, waiting each out. */
  async function learnedAfter(
    answers: ReadonlyArray<HomeAnswer>
  ): Promise<unknown> {
    const clock = fakeClock()
    made.clock = clock
    let learned: unknown = null
    const memory: PaceMemory = {
      read: () => null,
      write: (record) => {
        learned = record.learned ?? null
      },
    }
    let n = 0
    const sent = (): number => n
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
      request: () =>
        Promise.resolve(answers[n++] ?? { status: 200, body: "{}" }),
      onHidden: () => (): void => undefined,
      now: clock.now,
      after: clock.after,
      paceMemory: memory,
    })
    await made.link.load()
    for (let i = 0; i < answers.length; i += 1) {
      await theLink()
        .drain((send) => send("GET", "/aph"))
        .catch(() => undefined)
      // Past the longest Retry-After, so each answer is home's, not the
      // link's own busy.
      clock.pass(700_000)
    }
    // Every answer was sent for, none answered by the link itself.
    expect(sent()).toBe(answers.length)
    return learned
  }

  // Under 2 s an overload would teach nothing anyway (`pace.spend`), so
  // the rows start at the pace.
  for (const after of ["2", "30", "600"]) {
    it(`an overload with Retry-After ${after}, once and three times, leaves the pace at its own`, async () => {
      const overload: HomeAnswer = {
        status: 503,
        body: OVERLOAD,
        retryAfter: after,
      }
      expect(await learnedAfter([overload])).toBeNull()
      expect(await learnedAfter([overload, overload, overload])).toBeNull()
    })
  }

  it("a 429 still teaches it, as HERD1 asks", async () => {
    const limited: HomeAnswer = { status: 429, body: "", retryAfter: "30" }
    expect(await learnedAfter([limited])).not.toBeNull()
  })
})
