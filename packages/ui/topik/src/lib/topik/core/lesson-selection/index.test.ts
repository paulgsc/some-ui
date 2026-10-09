import { describe, expect, it } from "vitest"

import { topikLevelOf } from "."

describe("topikLevelOf", () => {
  it("reads a level tag and nothing else", () => {
    expect(topikLevelOf(["makjang", "topik-5"])).toBe(5)
    expect(topikLevelOf(["topik-7", "topik-"])).toBeUndefined()
  })
})
