/**
 * The one wiring of a record kept on home (LA9 to LA11): every request a run
 * makes first finds one of its lane's scopes still kept, and home being busy
 * anywhere in a run is said as busy, whatever else the run found. When a run
 * is asked for is `kept-watch`'s; what each lane's exchange sends is its own,
 * tested with it.
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { describe, expect, it, vi } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { Scope } from "@/lib/home-link/consent-model"
import { laneExchange } from "@/lib/home-link/kept-runtime"
import type { Lane } from "@/lib/home-link/lanes"
import type { HomeSend } from "@/lib/home-link/runtime"

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (): Promise<never> => Promise.reject(new Error("unused")),
}))

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
  send: HomeSend
  sent: Array<string>
} {
  const sent: Array<string> = []
  const send: HomeSend = (_, path) => {
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

  it("sends nothing more once its person stops, before the next request", async () => {
    const { send, sent } = home()
    let stopped = false
    const run = laneExchange(
      lane(3, SYNCED),
      () => "p",
      () => (stopped ? new Set() : kept())
    )
    const gated: HomeSend = async (method, path, body) => {
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
