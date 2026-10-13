import { describe, expect, it } from "vitest"

import { seasonOf } from "./feed"

describe("the Playoff Delta feed", () => {
  it("reads January to May as the season that started the autumn before", () => {
    expect(seasonOf(new Date("2027-01-04T12:00:00Z"))).toBe(2026)
    expect(seasonOf(new Date("2027-05-31T12:00:00Z"))).toBe(2026)
    expect(seasonOf(new Date("2026-06-01T00:00:00Z"))).toBe(2026)
    expect(seasonOf(new Date("2026-10-13T00:00:00Z"))).toBe(2026)
  })
})
