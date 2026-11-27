import type { HeardAnswer } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import type { FastTracked } from "@/lib/home-link/fast-track"
import { hearOnHome } from "@/lib/shop-home/hear"

const TIMING = { everyMs: 5, forMs: 20 }
const LIVE = new AbortController().signal

function ports(
  tracks: Array<FastTracked>,
  heards: Array<HeardAnswer>
): { ports: Parameters<typeof hearOnHome>[1]; tracked: () => number } {
  let clock = 0
  let tracked = 0
  return {
    ports: {
      fastTrack: (): Promise<FastTracked> => {
        tracked += 1
        return Promise.resolve(tracks.shift() ?? "asked")
      },
      heard: () => Promise.resolve(heards.shift() ?? { kind: "notYet" }),
      wait: (ms): Promise<void> => {
        clock += ms
        return Promise.resolve()
      },
      now: () => clock,
    },
    tracked: () => tracked,
  }
}

describe("a spoken hunch heard on home", () => {
  it("asks home to hear the take next until it holds it, then reads its words", async () => {
    const { ports: p, tracked } = ports(
      ["notHeld", "asked"],
      [
        { kind: "notHeld" },
        { kind: "notYet" },
        { kind: "heard", text: "where's my phone" },
      ]
    )
    expect(await hearOnHome("n1", p, LIVE, TIMING)).toEqual({
      kind: "heard",
      words: "where's my phone",
    })
    expect(tracked()).toBe(2)
  })

  it("says home has the take but hasn't heard it, once its time is up", async () => {
    const { ports: p } = ports(["asked"], [])
    expect(await hearOnHome("n1", p, LIVE, TIMING)).toEqual({ kind: "held" })
  })

  it("says a take home never said it holds is still on its way", async () => {
    const { ports: p } = ports(
      Array.from({ length: 9 }, () => "notHeld" as const),
      Array.from({ length: 9 }, () => ({ kind: "notHeld" }) as const)
    )
    expect(await hearOnHome("n1", p, LIVE, TIMING)).toEqual({ kind: "going" })
  })

  it("stops once the screen is gone", async () => {
    const gone = new AbortController()
    gone.abort()
    const { ports: p } = ports([], [])
    await expect(hearOnHome("n1", p, gone.signal, TIMING)).rejects.toThrow()
  })

  it("rejects when home can't give the take's words", async () => {
    const away = ports(["asked"], [{ kind: "unreachable" }])
    await expect(hearOnHome("n1", away.ports, LIVE, TIMING)).rejects.toThrow()
  })
})
