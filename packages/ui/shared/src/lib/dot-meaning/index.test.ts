/**
 * @vitest-environment node
 *
 * A dot's colour means one thing on every phone screen (#3030): no two
 * meanings share a hue or a fill.
 */
import { describe, expect, it } from "vitest"

import { DOTS } from "./index"

describe("DOTS", () => {
  it("gives each meaning its own hue and its own fill", () => {
    const dots = Object.values(DOTS)
    expect(new Set(dots.map((dot) => dot.hue)).size).toBe(dots.length)
    expect(new Set(dots.map((dot) => dot.className)).size).toBe(dots.length)
  })

  it("keeps sky for on home, as the owner chose", () => {
    expect(DOTS.onHome.hue).toBe("sky")
  })
})
