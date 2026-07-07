import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { usePlayerProgress } from "./use-player-progress"

// ═══════════════════════════════════════════════════════════════════════════
// S6 — use-player-progress.ts has no effects of its own; it's a thin
// `useState` wrapper around player-store.ts (already unit-tested in S2).
// What's worth pinning at the hook layer specifically is the derived-value
// wiring (`algorithmUnlocked`, `xpToNextLevel`) and the persist-on-record
// trigger (`saveProgress` via localStorage) that S6's issue calls out as
// "derived progress + persist trigger" — the seam a lint-driven refactor of
// this hook could silently break even though player-store.ts's own tests
// stay green.
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "leetyping_progress"

beforeEach(() => {
  localStorage.clear()
})

function baseSolveInput(): Parameters<
  ReturnType<typeof usePlayerProgress>["recordSolve"]
>[0] {
  return {
    challengeId: "c1",
    wpm: 80,
    accuracy: 95,
    elapsedTime: 30,
    errors: 1,
    n: null,
    displayMode: "shown",
    difficulty: "easy",
  }
}

describe("initial load", () => {
  it("starts from a fresh progress when localStorage is empty", () => {
    const { result } = renderHook(() => usePlayerProgress())

    expect(result.current.progress).toEqual({ xp: 0, level: 1, solves: [] })
    expect(result.current.algorithmUnlocked).toBe(false)
  })

  it("hydrates from a previously persisted progress", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ xp: 60, level: 2, solves: [] })
    )

    const { result } = renderHook(() => usePlayerProgress())

    expect(result.current.progress.xp).toBe(60)
    expect(result.current.progress.level).toBe(2)
    expect(result.current.xpToNextLevel).toBe(100 - 60)
  })
})

describe("recordSolve", () => {
  it("updates progress, persists it, and returns the xp earned", () => {
    const { result } = renderHook(() => usePlayerProgress())

    let earned = -1
    act(() => {
      earned = result.current.recordSolve(baseSolveInput())
    })

    expect(earned).toBeGreaterThan(0)
    expect(result.current.progress.xp).toBe(earned)
    expect(result.current.progress.solves).toHaveLength(1)

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    expect(persisted.xp).toBe(earned)
    expect(persisted.solves).toHaveLength(1)
  })

  it("flips algorithmUnlocked once the level threshold is crossed", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ xp: 99, level: 2, solves: [] })
    )
    const { result } = renderHook(() => usePlayerProgress())
    expect(result.current.algorithmUnlocked).toBe(false)

    act(() => {
      result.current.recordSolve(
        baseSolveInput() // easy solve is enough to cross the level-3 (xp>=100) threshold from xp=99
      )
    })

    expect(result.current.progress.level).toBeGreaterThanOrEqual(3)
    expect(result.current.algorithmUnlocked).toBe(true)
  })
})

describe("resetProgress", () => {
  it("clears solves/xp back to a fresh progress and persists the reset", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        xp: 500,
        level: 4,
        solves: [{ challengeId: "c1", xpEarned: 500 }],
      })
    )
    const { result } = renderHook(() => usePlayerProgress())
    expect(result.current.progress.xp).toBe(500)

    act(() => {
      result.current.resetProgress()
    })

    expect(result.current.progress).toEqual({ xp: 0, level: 1, solves: [] })
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    expect(persisted).toEqual({ xp: 0, level: 1, solves: [] })
  })
})
