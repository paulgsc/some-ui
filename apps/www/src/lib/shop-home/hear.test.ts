import type { HeardAnswer } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import type { FastTracked } from "@/lib/home-link/fast-track"
import { hearOnHome } from "@/lib/shop-home/hear"

const TIMING = { everyMs: 5, forMs: 20 }

function ports(
  tracks: Array<FastTracked>,
  heards: Array<HeardAnswer>
): { ports: Parameters<typeof hearOnHome>[1]; tracked: () => number } {
  let clock = 0
  let tracked = 0
  return {
    ports: {
      fastTrack: () => {
        tracked += 1
        return Promise.resolve(tracks.shift() ?? "asked")
      },
      heard: () => Promise.resolve(heards.shift() ?? { kind: "notYet" }),
      wait: (ms) => {
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
    expect(await hearOnHome("n1", p, TIMING)).toBe("where's my phone")
    expect(tracked()).toBe(2)
  })

  it("says home has the take but hasn't heard it, once its time is up", async () => {
    const { ports: p } = ports(["asked"], [])
    expect(await hearOnHome("n1", p, TIMING)).toBeNull()
  })

  it("rejects when home never said it holds the take, or can't give its words", async () => {
    const never = ports(
      ["notHeld", "notHeld", "notHeld", "notHeld", "notHeld", "notHeld"],
      [
        { kind: "notHeld" },
        { kind: "notHeld" },
        { kind: "notHeld" },
        { kind: "notHeld" },
        { kind: "notHeld" },
        { kind: "notHeld" },
      ]
    )
    await expect(hearOnHome("n1", never.ports, TIMING)).rejects.toThrow()
    const away = ports(["asked"], [{ kind: "unreachable" }])
    await expect(hearOnHome("n1", away.ports, TIMING)).rejects.toThrow()
  })
})
