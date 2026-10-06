import { describe, expect, it } from "vitest"

import { formatRemaining, isWindingDown, leadMs } from "@/lib/wind-down"

const MIN = 60_000

describe("wind-down", () => {
  it("leads by two minutes, or a quarter of a short session", () => {
    expect(leadMs(15 * MIN)).toBe(2 * MIN)
    expect(leadMs(4 * MIN)).toBe(MIN)
  })

  it("winds down only inside the lead, and never with no session", () => {
    expect(isWindingDown(3 * MIN, 15 * MIN)).toBe(false)
    expect(isWindingDown(2 * MIN, 15 * MIN)).toBe(true)
    expect(isWindingDown(0, 15 * MIN)).toBe(true)
    expect(isWindingDown(0, 0)).toBe(false)
  })

  it("counts down in m:ss, rounding up so 0:00 means done", () => {
    expect(formatRemaining(119_001)).toBe("2:00")
    expect(formatRemaining(61_000)).toBe("1:01")
    expect(formatRemaining(400)).toBe("0:01")
    expect(formatRemaining(-5)).toBe("0:00")
  })
})
