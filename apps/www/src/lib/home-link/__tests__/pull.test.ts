/**
 * A pull resyncs with home (PULL3, LA15): each lane the shell watches is
 * asked for a run, one at a time, while the app is in front, and the pull
 * is in step only once every lane's run was (the unpaired case is the
 * shell's test, `components/__tests__/device-home-glyph.test.tsx`); each
 * lane's own end stays in its runtime, which its marks read.
 */
import { noAnswer } from "@/test-support/no-answer"
import type { HomeExchanged } from "@some-ui/core-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Kept } from "@/lib/home-link/kept-runtime"
import { createKept } from "@/lib/home-link/kept-runtime"
import type { Pairing } from "@/lib/home-link/model"
import type { HomePullPorts } from "@/lib/home-link/pull"
import { homeRefresher } from "@/lib/home-link/pull"
import { CHECK_MS } from "@/lib/pull-refresh/model"

const link = vi.hoisted(() => ({
  /** Whether a run holds the link, which turns any other away (`keep`). */
  held: false,
  /** The link's clock, epoch ms. */
  now: 0,
}))
vi.mock("@/lib/home-link/index", () => ({
  pairing: (): Pairing => ({ kind: "paired", id: "p" }),
  LINK_CLOCK: { now: (): number => link.now },
}))

afterEach(() => {
  link.held = false
  link.now = 0
})

type Lane = Kept & { runs: number }

/** A lane's runtime over the one link, whose runs end as `ends` says. */
function lane(ends: () => Promise<HomeExchanged>): Lane {
  const counted = {
    runs: 0,
    ...createKept({
      exchange: () => ends(),
      keep: async (run) => {
        if (link.held) return { kind: "refused", why: "busy" }
        link.held = true
        counted.runs += 1
        try {
          return { kind: "done", value: await run(() => Promise.reject()) }
        } finally {
          link.held = false
        }
      },
      pairing: (): Pairing => ({ kind: "paired", id: "p" }),
      homeBusy: () => false,
      now: () => 7,
    }),
  }
  return counted
}

const synced = (): Promise<HomeExchanged> => Promise.resolve({ kind: "synced" })
const silent = (): Promise<HomeExchanged> => Promise.reject(noAnswer())

/** A pull over `lanes`, with the app in front unless said. */
const pullOver = (
  lanes: ReadonlyArray<Kept>,
  over: Partial<HomePullPorts> = {}
): Promise<void> =>
  homeRefresher({
    watched: () => new Set(lanes),
    doc: { visibilityState: "visible" },
    free: () => Promise.resolve(),
    lookAgain: () => undefined,
    ...over,
  }).checkAgain()

describe("a pull's ask of home", () => {
  it("is in step once every lane's run reached home, one run each, one at a time", async () => {
    const lanes = [lane(synced), lane(synced), lane(synced)]
    await expect(pullOver(lanes)).resolves.toBeUndefined()
    expect(lanes.map((l) => l.runs)).toEqual([1, 1, 1])
    expect(lanes.map((l) => l.getSnapshot().last?.kind)).toEqual([
      "synced",
      "synced",
      "synced",
    ])
  })

  it("falls short when home doesn't answer, and each lane says so", async () => {
    const lanes = [lane(silent), lane(silent)]
    await expect(pullOver(lanes)).rejects.toThrow()
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
    await expect(pullOver(lanes)).rejects.toThrow()
    expect(lanes.map((l) => l.getSnapshot().last)).toEqual([
      { kind: "synced", at: 7 },
      { kind: "failed", why: "full" },
      { kind: "unreachable", at: 7 },
    ])
  })

  it("asks a lane the link turned away once more when the link frees up", async () => {
    const turned = lane(synced)
    let freeing: () => void = () => undefined
    link.held = true
    const pulled = pullOver([turned], {
      free: () =>
        new Promise((resolve) => {
          freeing = resolve
        }),
    })
    await vi.waitFor(() => expect(turned.getSnapshot().last?.kind).toBe("busy"))
    link.held = false
    freeing()
    await expect(pulled).resolves.toBeUndefined()
    expect(turned.runs).toBe(1)
  })

  it("asks nothing, and has nothing to say, with the app not in front", async () => {
    const lanes = [lane(silent)]
    await expect(
      pullOver(lanes, { doc: { visibilityState: "hidden" } })
    ).resolves.toBeUndefined()
    expect(lanes[0]?.runs).toBe(0)
  })

  it("tells a screen its lane's end in the pull under way, one run a lane between them (PULL2)", async () => {
    const [shown, other] = [lane(silent), lane(synced)]
    const home = homeRefresher({
      watched: () => new Set([other, shown]),
      doc: { visibilityState: "visible" },
      free: () => Promise.resolve(),
      lookAgain: () => undefined,
      // The lanes' clock: a run that ended before a pull answers none of it.
      now: () => 7,
    })
    const heard = home.ended(shown)
    const all = home.checkAgain()
    expect(await heard).toEqual({ kind: "unreachable", at: 7 })
    await expect(all).rejects.toThrow()
    expect([other.runs, shown.runs]).toEqual([1, 1])
    // That pull is over: the next one asks again, and a lane not watched
    // hears nothing.
    expect(await home.ended(other)).toEqual({ kind: "synced", at: 7 })
    expect(other.runs).toBe(2)
    expect(await home.ended(lane(synced))).toBeNull()
  })

  it("asks only the lanes still watched when their turn comes", async () => {
    const lanes = new Set<Lane>()
    const gone = lane(synced)
    const first = lane(() => {
      lanes.delete(gone)
      return synced()
    })
    lanes.add(first)
    lanes.add(gone)
    await homeRefresher({
      watched: () => lanes,
      doc: { visibilityState: "visible" },
      lookAgain: () => undefined,
    }).checkAgain()
    expect([first.runs, gone.runs]).toEqual([1, 0])
  })

  it("lets the link's hold away from home go before it asks (AW1)", async () => {
    const order: Array<string> = []
    const one = lane(() => {
      order.push("ran")
      return synced()
    })
    await pullOver([one], { lookAgain: () => order.push("look again") })
    expect(order).toEqual(["look again", "ran"])
  })

  it("no longer holds the pulls after it once out longer than a pull may take: the next asks afresh (HERD2)", async () => {
    // A lane whose first run never ends (a request that never settles).
    let first = true
    const hung = lane(() => {
      if (!first) return synced()
      first = false
      return new Promise<HomeExchanged>(() => undefined)
    })
    let asked = 0
    const refresher = homeRefresher({
      watched: () => new Set([hung]),
      doc: { visibilityState: "visible" },
      free: () => Promise.resolve(),
      lookAgain: () => {
        asked += 1
      },
    })
    void refresher.checkAgain()
    await Promise.resolve()
    // Within a pull's time, the next pull joins the one out.
    link.now = CHECK_MS - 1
    void refresher.checkAgain()
    expect(asked).toBe(1)
    // Past it, the next is a pull of its own.
    link.now = CHECK_MS
    void refresher.checkAgain()
    expect(asked).toBe(2)
  })
})
