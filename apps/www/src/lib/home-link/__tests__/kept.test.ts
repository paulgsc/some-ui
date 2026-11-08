/**
 * A record this phone drains to home (LA15): one exchange at a time through
 * the link's `keep`, and how each ended; a lane's run goes under the pairing
 * the phone holds, and home being busy anywhere in a run is said as busy.
 * What an exchange sends is the record's own, tested with it
 * (`@some-ui/aph`'s `lib/__tests__/sync.test.ts`, www's
 * `lib/jobs/__tests__/home.test.ts`, `drain.test.ts`).
 */
import { noAnswer } from "@/test-support/no-answer"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { addFailureSink } from "@some-ui/intent-kit"
import { describe, expect, it, vi } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { FileHostUnreachableError } from "@/lib/file-host-config"
import type { KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT, stepKept } from "@/lib/home-link/kept-model"
import type { Kept, KeptPorts } from "@/lib/home-link/kept-runtime"
import {
  createKept,
  createPace,
  laneExchange,
} from "@/lib/home-link/kept-runtime"
import type { Lane, LaneCounts } from "@/lib/home-link/lanes"
import { laneReading } from "@/lib/home-link/lanes"
import { INITIAL, step } from "@/lib/home-link/model"
import type { HomeLink } from "@/lib/home-link/runtime"
import { HomeUnansweredError } from "@/lib/home-link/shelf"
import { ForeignCallError } from "@/lib/intent/foreign"

const send: HomeCall = () => Promise.resolve({ status: 200, body: "" })

/** The link's `keep`: runs `run` at once, or turns it away. */
function keep(busy = false): HomeLink["keep"] {
  return async (run) => {
    if (busy) return null
    try {
      return { kind: "done", value: await run(send) }
    } catch (error) {
      if (error instanceof SyncStoppedError) return { kind: "stopped" }
      throw error
    }
  }
}

function homeWith(over: Partial<KeptPorts>): Kept {
  return createKept({
    exchange: () => Promise.resolve<HomeExchanged>({ kind: "synced" }),
    keep: keep(),
    paired: () => true,
    homeBusy: () => false,
    now: () => 7,
    ...over,
  })
}

function settled(home: Kept): Promise<KeptState> {
  return new Promise((resolve) => {
    const check = (): void => {
      if (home.getSnapshot().running) return
      unsubscribe()
      resolve(home.getSnapshot())
    }
    const unsubscribe = home.subscribe(check)
    check()
  })
}

async function lastOf(over: Partial<KeptPorts>): Promise<unknown> {
  const home = homeWith(over)
  home.want()
  return (await settled(home)).last
}

describe("a record kept on home", () => {
  it("says when it synced, and how an exchange that got answers ended", async () => {
    expect(await lastOf({})).toEqual({ kind: "synced", at: 7 })
    expect(
      await lastOf({
        exchange: () => Promise.resolve<HomeExchanged>({ kind: "forgotten" }),
      })
    ).toEqual({ kind: "forgotten" })
    expect(
      await lastOf({
        exchange: () =>
          Promise.resolve<HomeExchanged>({ kind: "failed", why: "no" }),
      })
    ).toEqual({ kind: "failed", why: "no" })
  })

  it("says home was unreachable, or the run stopped, when the exchange throws", async () => {
    const timedOut = new FileHostUnreachableError(
      "/sessions",
      new DOMException("", "TimeoutError")
    )
    for (const silence of [
      noAnswer(),
      new FileHostUnreachableError("/sessions", noAnswer()),
      timedOut,
      new HomeUnansweredError(),
    ]) {
      expect(await lastOf({ exchange: () => Promise.reject(silence) })).toEqual(
        { kind: "unreachable", at: 7 }
      )
    }
    expect(
      await lastOf({
        exchange: () => Promise.reject(new SyncStoppedError()),
      })
    ).toEqual({ kind: "stopped" })
  })

  it("says a fault on this phone as one, and reports it, not as home's silence", async () => {
    const reported: Array<string> = []
    const stop = addFailureSink((failure) => reported.push(failure.port))
    const keystore = new ForeignCallError({
      kind: "unknown",
      retryable: false,
      summary: "The phone couldn't read or keep its pairing.",
      cause: null,
    })
    try {
      for (const fault of [new TypeError("x.y"), keystore]) {
        expect(await lastOf({ exchange: () => Promise.reject(fault) })).toEqual(
          { kind: "failed", why: "fault" }
        )
      }
    } finally {
      stop()
    }
    // The Keystore's own port reported its failure; this reports the rest.
    expect(reported).toEqual(["home server (kept)"])
  })

  it("says why the link turned it away", async () => {
    expect(await lastOf({ keep: keep(true) })).toEqual({ kind: "busy" })
    expect(await lastOf({ keep: keep(true), paired: () => false })).toEqual({
      kind: "unpaired",
    })
    // While home waits out a busy, it was home's to turn away too (AD3).
    expect(await lastOf({ keep: keep(true), homeBusy: () => true })).toEqual({
      kind: "failed",
      why: "busy",
    })
  })

  it("runs once more for asks made while it ran, and not again after", async () => {
    let runs = 0
    let home: Kept | null = null
    home = homeWith({
      exchange: () => {
        runs += 1
        if (runs === 1) {
          home?.want()
          home?.want()
        }
        return Promise.resolve<HomeExchanged>({ kind: "synced" })
      },
    })
    home.want()
    await settled(home)
    expect(runs).toBe(2)
  })
})

describe("a pull's run (PULL3)", () => {
  it("asked while a run is under way, is answered by the run after it", async () => {
    const ends: Array<HomeExchanged> = [
      { kind: "synced" },
      { kind: "failed", why: "full" },
    ]
    let pulled: Promise<unknown> | null = null
    let home: Kept | null = null
    home = homeWith({
      exchange: () => {
        pulled ??= home?.pull() ?? null
        return Promise.resolve(ends.shift() ?? { kind: "synced" })
      },
    })
    home.want()
    await settled(home)
    await expect(pulled).resolves.toEqual({ kind: "failed", why: "full" })
  })

  it("asked while a run is under way that none follows, is answered by that run", async () => {
    let runs = 0
    let pulled: Promise<unknown> | null = null
    let home: Kept | null = null
    home = homeWith({
      exchange: () => {
        runs += 1
        pulled ??= home?.pull() ?? null
        return Promise.reject(noAnswer())
      },
    })
    home.want()
    await expect(pulled).resolves.toEqual({ kind: "unreachable", at: 7 })
    expect(runs).toBe(1)
  })
})

describe("stepKept", () => {
  it("asks for one more run at most, after one that reached home or was turned away", () => {
    const running = stepKept(INITIAL_KEPT, { type: "wanted" })
    const again = stepKept(running, { type: "wanted" })
    expect(stepKept(again, { type: "wanted" })).toBe(again)
    expect(
      stepKept(again, { type: "ran", run: { kind: "synced", at: 1 } })
    ).toEqual({ running: true, again: false, last: { kind: "synced", at: 1 } })
    expect(
      stepKept(again, { type: "ran", run: { kind: "unreachable", at: 1 } })
    ).toMatchObject({ running: false, again: false })
    for (const kind of ["unpaired", "busy"] as const) {
      expect(stepKept(again, { type: "ran", run: { kind } })).toEqual({
        running: true,
        again: false,
        last: { kind },
      })
      expect(stepKept(running, { type: "ran", run: { kind } })).toMatchObject({
        running: false,
      })
    }
  })
})

describe("the link's keep lane", () => {
  it("starts only when paired and idle", () => {
    const paired = step(INITIAL, {
      type: "read",
      found: { base: "https://home.example/api/v1", id: "pairing-1" },
    })
    const keeping = step(paired, { type: "keepStarted" })
    expect(keeping.activity).toEqual({ kind: "keeping", stopping: false })
    expect(step(keeping, { type: "sendPressed" })).toBe(keeping)
    expect(step(keeping, { type: "keepStarted" })).toBe(keeping)
    const unpaired = step(INITIAL, { type: "read", found: null })
    expect(step(unpaired, { type: "keepStarted" })).toBe(unpaired)
  })
})

/** A lane whose exchange makes `requests` requests, then ends as `ends`. */
function lane(requests: number, ends: HomeExchanged): Lane {
  const declared: Lane = {
    id: "jobs",
    exchange: async (send) => {
      for (let i = 0; i < requests; i += 1) await send("PUT", `/jobs/${i}`)
      return ends
    },
    revision: () => 0,
    subscribe: () => () => undefined,
    useCounts: () => {
      throw new Error("unused")
    },
  }
  return declared
}

/** Home answering each request with the next of `statuses`, then 200. */
function home(statuses: Array<number> = []): {
  send: HomeCall
  sent: Array<string>
} {
  const sent: Array<string> = []
  const send: HomeCall = (_, path) => {
    sent.push(path)
    return Promise.resolve({ status: statuses.shift() ?? 200, body: "" })
  }
  return {
    sent,
    send,
  }
}

const SYNCED: HomeExchanged = { kind: "synced" }

/** A pace with a turn always free. */
const FREE = (): Promise<void> => Promise.resolve()

describe("a lane's run", () => {
  it("sends nothing unpaired", async () => {
    const { send, sent } = home()
    await expect(
      laneExchange(lane(2, SYNCED), () => null, FREE)(send)
    ).resolves.toEqual(SYNCED)
    expect(sent).toEqual([])
  })

  it("sends the record under the pairing the phone holds", async () => {
    const under: Array<string> = []
    const { send, sent } = home()
    const declared: Lane = {
      ...lane(1, SYNCED),
      exchange: async (through, at) => {
        under.push(at.pairing)
        await through("PUT", "/jobs/0")
        return SYNCED
      },
    }
    await expect(
      laneExchange(declared, () => "p", FREE)(send)
    ).resolves.toEqual(SYNCED)
    expect(sent).toEqual(["/jobs/0"])
    expect(under).toEqual(["p"])
  })

  it("says home was busy, however the exchange ended after it", async () => {
    const busy = { kind: "failed", why: "busy" }
    const failed: HomeExchanged = { kind: "failed", why: "home answered 429" }
    for (const ends of [SYNCED, failed]) {
      const { send } = home([429])
      await expect(
        laneExchange(lane(2, ends), () => "p", FREE)(send)
      ).resolves.toEqual(busy)
    }
    const throwing: Lane = {
      ...lane(0, SYNCED),
      exchange: async (send) => {
        await send("PUT", "/jobs/0")
        throw new Error("home did not answer")
      },
    }
    await expect(
      laneExchange(throwing, () => "p", FREE)(home([429]).send)
    ).resolves.toEqual(busy)
  })

  it("sends each request only once the pace gives it a turn, refusing none", async () => {
    const { send, sent } = home()
    const turns: Array<() => void> = []
    const pace = (): Promise<void> =>
      new Promise((resolve) => turns.push(resolve))
    const run = laneExchange(lane(3, SYNCED), () => "p", pace)(send)
    for (let i = 1; i <= 3; i += 1) {
      await vi.waitFor(() => expect(turns).toHaveLength(i))
      expect(sent).toHaveLength(i - 1)
      turns[i - 1]?.()
    }
    await expect(run).resolves.toEqual(SYNCED)
    expect(sent).toHaveLength(3)
  })

  it("paces the drain inside home's 60 requests a minute: 49 at once, then one each 2 s (AD3)", async () => {
    let now = 0
    let timers: Array<{ at: number; run: () => void }> = []
    const pace = createPace({
      now: () => now,
      after: (ms, run) => {
        timers.push({ at: now + ms, run })
        return (): void => undefined
      },
    })
    let went = 0
    const turns = Array.from({ length: 52 }, () =>
      pace().then(() => {
        went += 1
      })
    )
    const settle = (): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, 0))
    await settle()
    expect(went).toBe(49)
    const pass = async (ms: number): Promise<void> => {
      now += ms
      const due = timers.filter((timer) => timer.at <= now)
      timers = timers.filter((timer) => timer.at > now)
      for (const timer of due) timer.run()
      await settle()
    }
    await pass(1_999)
    expect(went).toBe(49)
    await pass(1)
    expect(went).toBe(50)
    await pass(2_000)
    await pass(2_000)
    expect(went).toBe(52)
    await Promise.all(turns)
    // Left alone, it refills to the burst and no further.
    await pass(600_000)
    const again = Array.from({ length: 50 }, () =>
      pace().then(() => {
        went += 1
      })
    )
    await settle()
    expect(went).toBe(52 + 49)
    await pass(2_000)
    await Promise.all(again)
  })

  it("says forgotten, a stop, or no answer as they were when home was not busy", async () => {
    const forgotten: HomeExchanged = { kind: "forgotten" }
    await expect(
      laneExchange(lane(1, forgotten), () => "p", FREE)(home([429]).send)
    ).resolves.toEqual(forgotten)
    const throwing: Lane = {
      ...lane(0, SYNCED),
      exchange: () => Promise.reject(new Error("home did not answer")),
    }
    await expect(
      laneExchange(throwing, () => "p", FREE)(home().send)
    ).rejects.toThrow("home did not answer")
    const stopping: Lane = {
      ...lane(0, SYNCED),
      exchange: () => Promise.reject(new SyncStoppedError()),
    }
    await expect(
      laneExchange(stopping, () => "p", FREE)(home([429]).send)
    ).rejects.toBeInstanceOf(SyncStoppedError)
  })
})

describe("Send now", () => {
  const PAIRED = step(INITIAL, {
    type: "read",
    found: { base: "https://home.lan", id: "p" },
  })
  const NOTHING_WAITS: LaneCounts = {
    held: { sessions: 2 },
    refused: {},
    waiting: 0,
    hidden: 0,
    pulled: false,
  }
  const after = (last: KeptState["last"]): KeptState => ({
    ...INITIAL_KEPT,
    last,
  })
  const offered = (run: KeptState): boolean =>
    laneReading("practice", NOTHING_WAITS, run, PAIRED).sendNow

  it("is offered with nothing counted waiting after a run that didn't get everything home", () => {
    for (const why of ["full", "refused", "busy", "fault"]) {
      expect(offered(after({ kind: "failed", why }))).toBe(true)
    }
    expect(offered(after({ kind: "unreachable", at: 1 }))).toBe(true)
  })

  it("is not offered after a clean run, while sending, or unpaired", () => {
    expect(offered(after({ kind: "synced", at: 1 }))).toBe(false)
    expect(offered(INITIAL_KEPT)).toBe(false)
    expect(
      offered({ ...after({ kind: "failed", why: "full" }), running: true })
    ).toBe(false)
    expect(
      laneReading(
        "practice",
        NOTHING_WAITS,
        after({ kind: "failed", why: "full" }),
        INITIAL
      ).sendNow
    ).toBe(false)
  })
})
