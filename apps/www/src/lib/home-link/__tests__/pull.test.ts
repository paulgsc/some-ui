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
import type { HomePullPorts } from "@/lib/home-link/pull"
import { homeRefresher } from "@/lib/home-link/pull"

const link = vi.hoisted(() => ({
  /** Whether a run holds the link, which turns any other away (`keep`). */
  held: false,
}))
vi.mock("@/lib/home-link/index", () => ({
  paired: (): boolean => true,
}))

afterEach(() => {
  link.held = false
})

type Lane = Kept & { runs: number }

/** A lane's runtime over the one link, whose runs end as `ends` says. */
function lane(ends: () => Promise<HomeExchanged>): Lane {
  const counted = {
    runs: 0,
    ...createKept({
      exchange: () => ends(),
      keep: async (run) => {
        if (link.held) return null
        link.held = true
        counted.runs += 1
        try {
          return { kind: "done", value: await run(() => Promise.reject()) }
        } finally {
          link.held = false
        }
      },
      paired: () => true,
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
    }).checkAgain()
    expect([first.runs, gone.runs]).toEqual([1, 0])
  })
})
