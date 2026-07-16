import type { GameRef, GameStats, TypedTypingGame } from "@leetype/types/leetype"
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useTypingGameStats } from "."

function makeStats(overrides: Partial<GameStats> = {}): GameStats {
  return {
    progress: 0,
    accuracy: 0,
    wpm: 0,
    elapsed_time: 0,
    total_errors: 0,
    consecutive_errors: 0,
    show_error_alert: false,
    cursor: 0,
    is_complete: false,
    ...overrides,
  }
}

// Full TypedTypingGame double built via a return-type-annotated factory
// (rather than an `as` cast, which this project's lint config forbids
// outright) so every test double is a real structural match for the
// interface `useTypingGameStats` depends on.
function makeGame(overrides: Partial<TypedTypingGame> = {}): TypedTypingGame {
  // getStats defaults to a fixed reference: useSyncExternalStore requires a
  // referentially stable snapshot (the real TypedTypingGame caches it until
  // invalidated) and treats a fresh object on every call as a changed
  // snapshot, looping until React bails out with "Maximum update depth".
  const defaultStats = makeStats()

  return {
    start: vi.fn(),
    reset: vi.fn(),
    handleInput: vi.fn(),
    getStats: vi.fn(() => defaultStats),
    getUserInput: vi.fn(() => ""),
    getTargetUnits: vi.fn(() => []),
    getUserUnits: vi.fn(() => []),
    getCursor: vi.fn(() => []),
    dismissError: vi.fn(),
    free: vi.fn(),
    getTargetLength: vi.fn(() => 0),
    subscribeStats: vi.fn(() => () => {}),
    completeChunk: vi.fn(),
    startNextChunk: vi.fn(),
    resetGame: vi.fn(),
    getCumulativeStats: vi.fn((): [number, number] => [0, 0]),
    ...overrides,
  }
}

describe("useTypingGameStats", () => {
  it("returns null when gameRef.current is null", () => {
    const gameRef: GameRef = { current: null }

    const { result } = renderHook(() => useTypingGameStats(gameRef))

    expect(result.current).toBeNull()
  })

  it("returns the game's stats snapshot and unmounts cleanly", () => {
    // getStats must return a referentially stable snapshot (the real
    // TypedTypingGame caches it until invalidated) — useSyncExternalStore
    // treats a fresh object on every call as a changed snapshot and
    // re-renders in a loop.
    const stats = makeStats({ wpm: 42 })
    const gameRef: GameRef = { current: makeGame({ getStats: () => stats }) }

    const { result, unmount } = renderHook(() => useTypingGameStats(gameRef))

    expect(result.current).toEqual(stats)
    expect(() => unmount()).not.toThrow()
  })

  it("subscribes via subscribeStats and unsubscribes on cleanup", () => {
    const unsubscribe = vi.fn()
    const subscribeStats = vi.fn(() => unsubscribe)
    const gameRef: GameRef = { current: makeGame({ subscribeStats }) }

    const { unmount } = renderHook(() => useTypingGameStats(gameRef))
    expect(subscribeStats).toHaveBeenCalledTimes(1)

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
