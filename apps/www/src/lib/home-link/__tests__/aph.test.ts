/**
 * aph kept on home (LA9): one exchange at a time through the link's `keep`,
 * and how each ended. What an exchange sends and lets go of is
 * `@some-ui/aph`'s, tested there (`lib/__tests__/sync.test.ts`).
 */
import type { Exchanged } from "@some-ui/aph"
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { AphHomeState } from "@/lib/home-link/aph-model"
import { INITIAL_APH, stepAph } from "@/lib/home-link/aph-model"
import type { AphHome, AphHomePorts } from "@/lib/home-link/aph-runtime"
import { createAphHome } from "@/lib/home-link/aph-runtime"
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

function homeWith(over: Partial<AphHomePorts>): AphHome {
  return createAphHome({
    exchange: () => Promise.resolve<Exchanged>({ kind: "synced" }),
    keep: keep(),
    paired: () => true,
    now: () => 7,
    ...over,
  })
}

function settled(home: AphHome): Promise<AphHomeState> {
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

async function lastOf(over: Partial<AphHomePorts>): Promise<unknown> {
  const home = homeWith(over)
  home.want()
  return (await settled(home)).last
}

describe("aph kept on home", () => {
  it("says when it synced, and how an exchange that got answers ended", async () => {
    expect(await lastOf({})).toEqual({ kind: "synced", at: 7 })
    expect(
      await lastOf({
        exchange: () => Promise.resolve<Exchanged>({ kind: "forgotten" }),
      })
    ).toEqual({ kind: "forgotten" })
    expect(
      await lastOf({
        exchange: () =>
          Promise.resolve<Exchanged>({ kind: "failed", why: "no" }),
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
    let home: AphHome | null = null
    home = homeWith({
      exchange: () => {
        runs += 1
        if (runs === 1) {
          home?.want()
          home?.want()
        }
        return Promise.resolve<Exchanged>({ kind: "synced" })
      },
    })
    home.want()
    await settled(home)
    expect(runs).toBe(2)
  })
})

describe("stepAph", () => {
  it("asks for one more run at most, and only after one that reached home", () => {
    const running = stepAph(INITIAL_APH, { type: "wanted" })
    const again = stepAph(running, { type: "wanted" })
    expect(stepAph(again, { type: "wanted" })).toBe(again)
    expect(
      stepAph(again, { type: "ran", run: { kind: "synced", at: 1 } })
    ).toEqual({ running: true, again: false, last: { kind: "synced", at: 1 } })
    expect(
      stepAph(again, { type: "ran", run: { kind: "unreachable", at: 1 } })
    ).toMatchObject({ running: false, again: false })
  })
})
