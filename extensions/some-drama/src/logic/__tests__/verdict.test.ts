import { applyVerdict, isVerdictChange } from "@drama/logic/verdict"
import { describe, expect, it } from "vitest"

describe("applyVerdict", () => {
  it("steps the rating half a point, within 0..10", () => {
    expect(applyVerdict(7.5, "rating", { step: 1 })).toBe(8)
    expect(applyVerdict(7.5, "rating", { step: -1 })).toBe(7)
    expect(applyVerdict(10, "rating", { step: 1 })).toBe(10)
    expect(applyVerdict(0, "rating", { step: -1 })).toBe(0)
  })

  it("steps an off-grid value to the next grid point, never past it", () => {
    // 7.3 was typed into the popup.
    expect(applyVerdict(7.3, "rating", { step: 1 })).toBe(7.5)
    expect(applyVerdict(7.3, "rating", { step: -1 })).toBe(7)
  })

  it("steps the likelihood to finish by tenths, without float noise", () => {
    let p = 0
    for (let i = 0; i < 7; i++) {
      p = applyVerdict(p, "completionLikelihood", { step: 1 })
    }
    expect(p).toBe(0.7)
    expect(applyVerdict(0.95, "completionLikelihood", { step: 1 })).toBe(1)
  })

  it("sets a value, clamped to the field's range", () => {
    expect(applyVerdict(3, "rating", { set: 8 })).toBe(8)
    expect(applyVerdict(3, "rating", { set: 14 })).toBe(10)
    expect(applyVerdict(0.5, "completionLikelihood", { set: -1 })).toBe(0)
  })
})

describe("isVerdictChange", () => {
  it("accepts a finite set or a unit step, and nothing else", () => {
    expect(isVerdictChange({ set: 4 })).toBe(true)
    expect(isVerdictChange({ step: -1 })).toBe(true)
    expect(isVerdictChange({ step: 2 })).toBe(false)
    expect(isVerdictChange({ set: Number.NaN })).toBe(false)
    expect(isVerdictChange({})).toBe(false)
    expect(isVerdictChange(null)).toBe(false)
  })
})
