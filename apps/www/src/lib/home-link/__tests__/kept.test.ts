/**
 * A record kept on home (LA9 to LA11): one exchange at a time through the
 * link's `keep`, and how each ended; every request a lane's run makes first
 * finds one of its scopes still kept, and home being busy anywhere in a run
 * is said as busy. What an exchange sends is the record's own, tested with it
 * (`@some-ui/aph`'s `lib/__tests__/sync.test.ts`, www's
 * `lib/jobs/__tests__/home.test.ts`, `standing.test.ts`).
 */
import { noAnswer } from "@/test-support/no-answer"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { addFailureSink } from "@some-ui/intent-kit"
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { FileHostUnreachableError } from "@/lib/file-host-config"
import type { Scope } from "@/lib/home-link/consent-model"
import type { KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT, stepKept } from "@/lib/home-link/kept-model"
import type { Kept, KeptPorts } from "@/lib/home-link/kept-runtime"
import { createKept, laneExchange } from "@/lib/home-link/kept-runtime"
import type { Lane } from "@/lib/home-link/lanes"
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
      found: {
        base: "https://home.example/api/v1",
        id: "pairing-1",
        earlier: false,
      },
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
    scopes: ["jobs"],
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
const kept = (): ReadonlySet<Scope> => new Set(["jobs"])

describe("a lane's run", () => {
  it("sends nothing unpaired, or with nothing kept", async () => {
    const { send, sent } = home()
    const run = (
      pairing: string | null,
      shared: ReadonlySet<Scope>
    ): Promise<HomeExchanged> =>
      laneExchange(
        lane(2, SYNCED),
        () => pairing,
        () => shared
      )(send)
    await expect(run(null, kept())).resolves.toEqual(SYNCED)
    await expect(run("p", new Set())).resolves.toEqual(SYNCED)
    expect(sent).toEqual([])
  })

  it("tells home its choices first, and ends there when home forgot the phone", async () => {
    const { send, sent } = home()
    const told: Array<string> = []
    const tell =
      (ends: HomeExchanged) =>
      async (through: HomeCall, pairing: string): Promise<HomeExchanged> => {
        told.push(pairing)
        await through("PUT", "/sharing/jobs")
        return ends
      }
    const run = (ends: HomeExchanged): Promise<HomeExchanged> =>
      laneExchange(lane(1, SYNCED), () => "p", kept, tell(ends))(send)
    await expect(run({ kind: "failed", why: "x" })).resolves.toEqual(SYNCED)
    expect(sent).toEqual(["/sharing/jobs", "/jobs/0"])
    sent.length = 0
    await expect(run({ kind: "forgotten" })).resolves.toEqual({
      kind: "forgotten",
    })
    expect(sent).toEqual(["/sharing/jobs"])
    expect(told).toEqual(["p", "p"])
  })

  it("sends nothing more once its person stops, before the next request", async () => {
    const { send, sent } = home()
    let stopped = false
    const run = laneExchange(
      lane(3, SYNCED),
      () => "p",
      () => (stopped ? new Set() : kept())
    )
    const gated: HomeCall = async (method, path, body) => {
      const answer = await send(method, path, body)
      stopped = true
      return answer
    }
    await expect(run(gated)).rejects.toBeInstanceOf(SyncStoppedError)
    expect(sent).toEqual(["/jobs/0"])
  })

  it("says home was busy, however the exchange ended after it", async () => {
    const busy = { kind: "failed", why: "busy" }
    const failed: HomeExchanged = { kind: "failed", why: "home answered 429" }
    for (const ends of [SYNCED, failed]) {
      const { send } = home([429])
      await expect(
        laneExchange(lane(2, ends), () => "p", kept)(send)
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
      laneExchange(throwing, () => "p", kept)(home([429]).send)
    ).resolves.toEqual(busy)
  })

  it("says forgotten, a stop, or no answer as they were when home was not busy", async () => {
    const forgotten: HomeExchanged = { kind: "forgotten" }
    await expect(
      laneExchange(lane(1, forgotten), () => "p", kept)(home([429]).send)
    ).resolves.toEqual(forgotten)
    const throwing: Lane = {
      ...lane(0, SYNCED),
      exchange: () => Promise.reject(new Error("home did not answer")),
    }
    await expect(
      laneExchange(throwing, () => "p", kept)(home().send)
    ).rejects.toThrow("home did not answer")
  })
})
