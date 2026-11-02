/**
 * A pull resyncs with home (PULL3, LA15): each lane the shell watches is
 * asked for one run while the phone is paired and the app is in front, and
 * the pull is in step only once every lane's run was; each lane's own end
 * stays in its runtime, which its marks read.
 */
import { noAnswer } from "@/test-support/no-answer"
import type { HomeExchanged } from "@some-ui/core-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Kept } from "@/lib/home-link/kept-runtime"
import { createKept } from "@/lib/home-link/kept-runtime"
import { homeRefresher } from "@/lib/home-link/pull"
import { PULL_HOME } from "@/lib/home-link/words"

const link = vi.hoisted(() => ({ paired: true }))
vi.mock("@/lib/home-link/index", () => ({
  paired: (): boolean => link.paired,
}))

afterEach(() => {
  link.paired = true
})

/** A lane's runtime whose runs end as `ends` says, counting them. */
function lane(ends: () => Promise<HomeExchanged>): Kept & { runs: number } {
  const counted = {
    runs: 0,
    ...createKept({
      exchange: () => ends(),
      keep: async (run) => {
        counted.runs += 1
        return { kind: "done", value: await run(() => Promise.reject()) }
      },
      paired: () => true,
      now: () => 7,
    }),
  }
  return counted
}

const synced = (): Promise<HomeExchanged> => Promise.resolve({ kind: "synced" })
const silent = (): Promise<HomeExchanged> => Promise.reject(noAnswer())

/** A document in front, or not. */
const doc = (
  visibilityState: DocumentVisibilityState
): Pick<Document, "visibilityState"> => ({ visibilityState })

describe("a pull's ask of home", () => {
  it("is in step once every lane's run reached home, one run each", async () => {
    const lanes = [lane(synced), lane(synced)]
    const home = homeRefresher(() => lanes, doc("visible"))
    expect(home.what).toBe(PULL_HOME.what)
    await expect(home.checkAgain()).resolves.toBeUndefined()
    expect(lanes.map((l) => l.runs)).toEqual([1, 1])
  })

  it("falls short when home doesn't answer, and each lane says so", async () => {
    const lanes = [lane(silent), lane(silent)]
    await expect(
      homeRefresher(() => lanes, doc("visible")).checkAgain()
    ).rejects.toThrow()
    expect(lanes.map((l) => l.getSnapshot().last?.kind)).toEqual([
      "unreachable",
      "unreachable",
    ])
  })

  it("falls short when one lane's run did, while the others say they reached home", async () => {
    const lanes = [
      lane(synced),
      lane(() => Promise.resolve({ kind: "failed", why: "full" })),
      lane(silent),
    ]
    await expect(
      homeRefresher(() => lanes, doc("visible")).checkAgain()
    ).rejects.toThrow()
    expect(lanes.map((l) => l.getSnapshot().last)).toEqual([
      { kind: "synced", at: 7 },
      { kind: "failed", why: "full" },
      { kind: "unreachable", at: 7 },
    ])
  })

  it("asks nothing, and has nothing to say, unpaired or with the app not in front", async () => {
    const lanes = [lane(silent)]
    link.paired = false
    await expect(
      homeRefresher(() => lanes, doc("visible")).checkAgain()
    ).resolves.toBeUndefined()
    link.paired = true
    await expect(
      homeRefresher(() => lanes, doc("hidden")).checkAgain()
    ).resolves.toBeUndefined()
    expect(lanes[0]?.runs).toBe(0)
  })

  it("asks the lanes watched when it is pulled, not when it was made", async () => {
    const lanes: Array<Kept & { runs: number }> = []
    const home = homeRefresher(() => lanes, doc("visible"))
    lanes.push(lane(synced))
    await home.checkAgain()
    expect(lanes[0]?.runs).toBe(1)
  })
})
