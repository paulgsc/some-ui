import {
  burstFor,
  petalCount,
  petalPeak,
  petalsFor,
} from "@drama/logic/content/petals"
import { describe, expect, it } from "vitest"

const mid = (): number => 0.5

describe("petals follow the rating", () => {
  it("are sparser and fainter the lower the rating", () => {
    expect(petalCount(0)).toBe(3)
    expect(petalCount(10)).toBe(10)
    expect(petalPeak(2)).toBeLessThan(petalPeak(9))
    expect(petalsFor({ mood: null, rating: 4 }, mid)).toHaveLength(
      petalCount(4)
    )
  })
})

describe("petals follow the mood", () => {
  it("fall for sadness and rise for joy", () => {
    const sad = petalsFor({ mood: "sadness", rating: 8 }, mid)
    const joy = petalsFor({ mood: "joy", rating: 8 }, mid)
    expect(sad.every((p) => p.ty > 0)).toBe(true)
    expect(joy.every((p) => p.ty < 0)).toBe(true)
  })

  it("wear the mood's glyphs", () => {
    const sad = petalsFor({ mood: "sadness", rating: 8 }, mid)
    expect(sad.map((p) => p.glyph)).toContain("💧")
  })
})

describe("bursts", () => {
  it("are bigger for a harder beat", () => {
    const soft = burstFor({ kind: "mood", mood: "love", intensity: 1 }, mid)
    const hard = burstFor({ kind: "mood", mood: "love", intensity: 3 }, mid)
    expect(hard.length).toBeGreaterThan(soft.length)
  })

  it("rise for a better verdict and fall for a worse one", () => {
    const up = burstFor({ kind: "rating", rising: true }, mid)
    const down = burstFor({ kind: "finish", rising: false }, mid)
    expect(up.every((p) => p.ty < 0)).toBe(true)
    expect(down.every((p) => p.ty > 0)).toBe(true)
    expect(up.map((p) => p.glyph)).toContain("⭐")
  })
})
