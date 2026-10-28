import raw from "@playoff-delta/fixtures/season-2025.json"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { parseStorySeason } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

describe("the contract", () => {
  it("reads version 4, and refuses any other", () => {
    expect(SAMPLE_SEASON.version).toBe(4)
    expect(() => parseStorySeason({ ...raw, version: 3 })).toThrow()
  })

  it("holds the week's ways together: a road per game, never rising, from best to actual", () => {
    for (const w of SAMPLE_SEASON.weeks) {
      const { ways } = w
      expect(ways.road).toHaveLength(ways.games.length + 1)
      expect(ways.mean).toHaveLength(ways.games.length + 1)
      expect(ways.strip).toHaveLength(ways.games.length + 1)
      expect(ways.road[0]).toBe(ways.best)
      expect(ways.road.at(-1)).toBe(ways.actual)
      for (let i = 1; i < ways.road.length; i++)
        expect(ways.road[i]).toBeLessThanOrEqual(ways.road[i - 1] ?? 1)
      expect(ways.strip[0]?.reduce((a, b) => a + b, 0)).toBe(
        2 ** ways.games.length
      )
      if (ways.given) expect(ways.given.pieces).toHaveLength(ways.games.length)
    }
  })
})
