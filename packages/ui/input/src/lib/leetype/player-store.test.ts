import type { PlayerProgress, SolveRecord } from "@input/types/leetype"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  ADAPTIVE_WPM_THRESHOLD,
  addSolve,
  ALGORITHM_UNLOCK_LEVEL,
  computeLevel,
  computeXP,
  loadProgress,
  saveProgress,
  xpForNextLevel,
} from "./player-store"

const STORAGE_KEY = "leetyping_progress"

function baseSolve(
  overrides: Partial<Omit<SolveRecord, "xpEarned">> = {}
): Omit<SolveRecord, "xpEarned"> {
  return {
    challengeId: "c1",
    solvedAt: 0,
    wpm: 0,
    accuracy: 0,
    elapsedTime: 0,
    errors: 0,
    n: null,
    displayMode: "shown",
    ...overrides,
  }
}

describe("computeLevel", () => {
  it.each([
    [0, 1],
    [49, 1],
    [50, 2],
    [99, 2],
    [100, 3],
    [199, 3],
    [200, 4],
    [399, 4],
    [400, 5],
    [799, 5],
    [800, 6],
    [10_000, 6], // past the max threshold clamps to the highest level
  ])("computeLevel(%i) === %i", (xp, expected) => {
    expect(computeLevel(xp)).toBe(expected)
  })
})

describe("xpForNextLevel", () => {
  it.each([
    [1, 50],
    [2, 100],
    [3, 200],
    [4, 400],
    [5, 800],
    [6, 800], // level >= thresholds.length clamps to 800
    [7, 800],
  ])("xpForNextLevel(%i) === %i", (level, expected) => {
    expect(xpForNextLevel(level)).toBe(expected)
  })
})

describe("computeXP", () => {
  it("scales with difficulty base XP", () => {
    expect(computeXP("easy", 0, 0, null, "shown")).toBe(
      Math.round(10 * 1 * 0.6 * 1 * 1)
    )
    expect(computeXP("medium", 0, 0, null, "shown")).toBe(
      Math.round(25 * 1 * 0.6 * 1 * 1)
    )
    expect(computeXP("hard", 0, 0, null, "shown")).toBe(
      Math.round(50 * 1 * 0.6 * 1 * 1)
    )
  })

  it.each([
    [0, 1],
    [39, 1],
    [40, 1.2], // ADAPTIVE_WPM_THRESHOLD boundary
    [59, 1.2],
    [60, 1.5],
    [79, 1.5],
    [80, 2],
    [200, 2],
  ])("applies the wpm speed multiplier at wpm=%i", (wpm, speedMult) => {
    expect(computeXP("easy", wpm, 0, null, "shown")).toBe(
      Math.round(10 * speedMult * 0.6 * 1 * 1)
    )
  })

  it.each([
    [0, 0.6],
    [79, 0.6],
    [80, 0.8],
    [94, 0.8],
    [95, 1],
    [100, 1],
  ])("applies the accuracy multiplier at accuracy=%i", (accuracy, accMult) => {
    expect(computeXP("easy", 0, accuracy, null, "shown")).toBe(
      Math.round(10 * 1 * accMult * 1 * 1)
    )
  })

  it.each([
    [null, 1],
    ["tiny", 1],
    ["small", 1.5],
    ["medium", 2],
    ["large", 3],
  ] as const)("applies the n-context multiplier for n=%s", (n, nMult) => {
    expect(computeXP("easy", 0, 0, n, "shown")).toBe(
      Math.round(10 * 1 * 0.6 * nMult * 1)
    )
  })

  it("applies the hidden-mode bonus", () => {
    expect(computeXP("easy", 0, 0, null, "hidden")).toBe(
      Math.round(10 * 1 * 0.6 * 1 * 1.5)
    )
  })

  it("combines all multipliers", () => {
    // hard(50) * 80wpm(2) * 96%(1) * large(3) * hidden(1.5) = 450
    expect(computeXP("hard", 80, 96, "large", "hidden")).toBe(450)
  })
})

describe("ALGORITHM_UNLOCK_LEVEL / ADAPTIVE_WPM_THRESHOLD gating", () => {
  it("exposes the documented threshold values", () => {
    expect(ALGORITHM_UNLOCK_LEVEL).toBe(3)
    expect(ADAPTIVE_WPM_THRESHOLD).toBe(40)
  })

  it("locks algorithm mode below the unlock level and unlocks at/above it", () => {
    const xpForLevel2 = xpForNextLevel(1) - 1 // 49 -> level 2
    const xpForLevel3 = xpForNextLevel(2) // 100 -> level 3

    expect(computeLevel(xpForLevel2)).toBeLessThan(ALGORITHM_UNLOCK_LEVEL)
    expect(computeLevel(xpForLevel3)).toBeGreaterThanOrEqual(
      ALGORITHM_UNLOCK_LEVEL
    )
  })
})

describe("addSolve", () => {
  it("awards XP, advances level, and appends the solve record", () => {
    const progress: PlayerProgress = { xp: 0, level: 1, solves: [] }
    const solve = baseSolve({ wpm: 80, accuracy: 96, n: "large" })

    const { next, xpEarned } = addSolve(progress, solve, "hard")

    const expectedXP = computeXP("hard", 80, 96, "large", "shown")
    expect(xpEarned).toBe(expectedXP)
    expect(next.xp).toBe(expectedXP)
    expect(next.level).toBe(computeLevel(expectedXP))
    expect(next.solves).toEqual([{ ...solve, xpEarned: expectedXP }])
  })

  it("accumulates XP and preserves prior solves across multiple calls", () => {
    const start: PlayerProgress = { xp: 0, level: 1, solves: [] }
    const first = addSolve(start, baseSolve({ challengeId: "a" }), "easy")
    const second = addSolve(
      first.next,
      baseSolve({ challengeId: "b" }),
      "easy"
    )

    expect(second.next.xp).toBe(first.xpEarned + second.xpEarned)
    expect(second.next.solves).toHaveLength(2)
    expect(second.next.solves[0]?.challengeId).toBe("a")
    expect(second.next.solves[1]?.challengeId).toBe("b")
  })

  it("rolls over to a higher level once enough XP accumulates", () => {
    // easy/0wpm/0acc solve earns computeXP("easy", 0, 0, null, "shown") = 6 XP each time.
    // 50 XP crosses the level-2 threshold.
    let progress: PlayerProgress = { xp: 0, level: 1, solves: [] }
    for (let i = 0; i < 10; i++) {
      progress = addSolve(progress, baseSolve(), "easy").next
    }

    expect(progress.xp).toBeGreaterThanOrEqual(50)
    expect(progress.level).toBe(computeLevel(progress.xp))
    expect(progress.level).toBeGreaterThan(1)
  })
})

describe("loadProgress / saveProgress", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("returns the default progress when nothing is stored", () => {
    expect(loadProgress()).toEqual({ xp: 0, level: 1, solves: [] })
  })

  it("round-trips a saved progress object", () => {
    const progress: PlayerProgress = {
      xp: 120,
      level: 3,
      solves: [{ ...baseSolve({ challengeId: "x" }), xpEarned: 12 }],
    }

    saveProgress(progress)
    expect(loadProgress()).toEqual(progress)
  })

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json")
    expect(loadProgress()).toEqual({ xp: 0, level: 1, solves: [] })
  })

  it("coerces a malformed stored shape field-by-field", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ xp: "oops", level: null, solves: "not-an-array" })
    )
    expect(loadProgress()).toEqual({ xp: 0, level: 1, solves: [] })
  })

  it("falls back to defaults when storage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    expect(loadProgress()).toEqual({ xp: 0, level: 1, solves: [] })
  })

  it("swallows a quota-exceeded write instead of throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })
    expect(() =>
      saveProgress({ xp: 0, level: 1, solves: [] })
    ).not.toThrow()
  })
})
