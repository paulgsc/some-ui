import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  resolveDifficultyConfig,
} from "@honeycomb/lib/hangul/difficulty-presets"
import { describe, expect, it } from "vitest"

describe("resolveDifficultyConfig", () => {
  it("resolves 'standard' to no overrides - the engine's own defaults", () => {
    expect(resolveDifficultyConfig("standard")).toEqual({})
  })

  it("defaults to 'standard' when no preset is given", () => {
    expect(resolveDifficultyConfig(undefined)).toEqual(
      DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY]
    )
  })

  it("'relaxed' gives more time and a more forgiving correctness threshold than 'standard'", () => {
    const relaxed = resolveDifficultyConfig("relaxed")
    expect(relaxed.maxTimeWindowMs).toBeGreaterThan(0)
    expect(relaxed.correctnessThresholdMs).toBeGreaterThan(0)
  })

  it("'challenging' gives less time and a stricter correctness threshold than 'relaxed'", () => {
    const relaxed = resolveDifficultyConfig("relaxed")
    const challenging = resolveDifficultyConfig("challenging")

    expect(challenging.maxTimeWindowMs).toBeLessThan(relaxed.maxTimeWindowMs!)
    expect(challenging.minTimeWindowMs).toBeLessThan(relaxed.minTimeWindowMs!)
    expect(challenging.correctnessThresholdMs).toBeLessThan(
      relaxed.correctnessThresholdMs!
    )
    expect(challenging.hideRomanizationStreak).toBeLessThan(
      relaxed.hideRomanizationStreak!
    )
  })

  it("every preset's minTimeWindowMs stays below its own maxTimeWindowMs", () => {
    for (const preset of Object.values(DIFFICULTY_PRESETS)) {
      if (
        preset.minTimeWindowMs === undefined ||
        preset.maxTimeWindowMs === undefined
      ) {
        continue
      }
      expect(preset.minTimeWindowMs).toBeLessThan(preset.maxTimeWindowMs)
    }
  })
})
