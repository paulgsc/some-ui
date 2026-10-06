import { describe, expect, it } from "vitest"

import { finishedNaturally, isWindingDown, leadMs } from "@/lib/wind-down"

const MIN = 60_000

describe("wind-down", () => {
  it("leads by two minutes, or a quarter of a short session", () => {
    expect(leadMs(15 * MIN)).toBe(2 * MIN)
    expect(leadMs(4 * MIN)).toBe(MIN)
  })

  it("winds down only inside the lead, and never with no session", () => {
    expect(isWindingDown(3 * MIN, 15 * MIN)).toBe(false)
    expect(isWindingDown(2 * MIN, 15 * MIN)).toBe(true)
    expect(isWindingDown(0, 0)).toBe(false)
  })

  it("counts an end inside the lead as finished", () => {
    expect(finishedNaturally(13 * MIN, 15 * MIN)).toBe(true)
    expect(finishedNaturally(12 * MIN, 15 * MIN)).toBe(false)
  })
})
