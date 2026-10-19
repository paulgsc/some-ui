/**
 * A record kept on home (LA9, LA10): one exchange at a time through the
 * link's `keep`, and how each ended. What an exchange sends is the record's
 * own, tested with it (`@some-ui/aph`'s `lib/__tests__/sync.test.ts`, www's
 * `lib/jobs/__tests__/home.test.ts`).
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT, stepKept } from "@/lib/home-link/kept-model"
import type { Kept, KeptPorts } from "@/lib/home-link/kept-runtime"
import { createKept } from "@/lib/home-link/kept-runtime"
import { INITIAL, step } from "@/lib/home-link/model"
import type { HomeLink, HomeSend } from "@/lib/home-link/runtime"

const send: HomeSend = () => Promise.resolve({ status: 200, body: "" })

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
    expect(
      await lastOf({ exchange: () => Promise.reject(new Error("no route")) })
    ).toEqual({ kind: "unreachable", at: 7 })
    expect(
      await lastOf({
        exchange: () => Promise.reject(new SyncStoppedError()),
      })
    ).toEqual({ kind: "stopped" })
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
