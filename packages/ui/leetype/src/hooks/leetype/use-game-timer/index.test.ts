import type { GameState } from "@leetype/types/leetype"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useGameTimer } from "."

// ═══════════════════════════════════════════════════════════════════════════
// S6 — use-game-timer.ts (leetype) drives its countdown off
// requestAnimationFrame + performance.now rather than setInterval, and
// tracks pause/resume via `pausedTimeRef`/`startTimeRef`. These tests pin
// the tick/pause/resume/reset invariants and the "always call the latest
// onTimeout" ref pattern (the same `onTimeoutRef` shape #555 flags as an
// exhaustive-deps risk) before any dep-array fix touches this hook.
//
// Vitest's fake timers (v3) drive `requestAnimationFrame` and advance
// `performance.now()` in lockstep — confirmed empirically for this
// workspace (jsdom + vitest 3.2.6) — so `vi.advanceTimersByTime` is used
// throughout instead of manually invoking rAF callbacks.
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const playingProps: { gameState: GameState } = { gameState: "playing" }

describe("countdown while playing", () => {
  it("starts at the full duration and does not tick before a frame elapses", () => {
    const { result } = renderHook(() =>
      useGameTimer({ gameState: "playing", duration: 10, onTimeout: vi.fn() })
    )

    expect(result.current.timeLeft).toBe(10)
  })

  it("counts down toward zero as frames advance", () => {
    const { result } = renderHook(() =>
      useGameTimer({ gameState: "playing", duration: 10, onTimeout: vi.fn() })
    )

    advance(3000)

    expect(result.current.timeLeft).toBeLessThanOrEqual(8)
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(6)
  })

  it("calls onTimeout exactly once when the duration elapses, then stops ticking", () => {
    const onTimeout = vi.fn()
    const { result } = renderHook(() =>
      useGameTimer({ gameState: "playing", duration: 1, onTimeout })
    )

    advance(1100)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(result.current.timeLeft).toBe(0)

    advance(5000)
    // No more rAF is scheduled once remaining hits 0 (the tick function
    // returns before requesting another frame).
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it("always calls the latest onTimeout callback without restarting the clock", () => {
    const firstOnTimeout = vi.fn()
    const secondOnTimeout = vi.fn()
    const { rerender } = renderHook(
      (props: { onTimeout: () => void }) =>
        useGameTimer({ gameState: "playing", duration: 1, ...props }),
      { initialProps: { onTimeout: firstOnTimeout } }
    )

    advance(500)
    rerender({ onTimeout: secondOnTimeout })
    advance(600)

    // onTimeoutRef is kept fresh by its own effect without being a dep of
    // the tick effect, so swapping the callback mid-countdown must not
    // reset startTimeRef/pausedTimeRef (a restart would mean neither
    // callback fires within 1100ms total).
    expect(firstOnTimeout).not.toHaveBeenCalled()
    expect(secondOnTimeout).toHaveBeenCalledTimes(1)
  })
})

describe("pause / resume", () => {
  it("stops ticking while gameState is not 'playing'", () => {
    const { result, rerender } = renderHook(
      (props: { gameState: GameState }) =>
        useGameTimer({ duration: 10, onTimeout: vi.fn(), ...props }),
      { initialProps: playingProps }
    )

    advance(2000)
    const pausedAt = result.current.timeLeft

    rerender({ gameState: "idle" })
    advance(5000)

    expect(result.current.timeLeft).toBe(pausedAt)
  })

  it("preserves remaining time across pause and resume", () => {
    const { result, rerender } = renderHook(
      (props: { gameState: GameState }) =>
        useGameTimer({ duration: 10, onTimeout: vi.fn(), ...props }),
      { initialProps: playingProps }
    )

    advance(3000)
    const beforePause = result.current.timeLeft
    expect(beforePause).toBeGreaterThanOrEqual(6)

    rerender({ gameState: "idle" })
    advance(3000) // wall-clock passes while paused; frozen while idle
    expect(result.current.timeLeft).toBe(beforePause)

    rerender({ gameState: "playing" })
    advance(50) // a couple of resumed frames

    expect(result.current.timeLeft).toBeGreaterThanOrEqual(beforePause - 1)
  })
})

describe("duration changes", () => {
  it("resets the clock to the new duration and restarts counting from it", () => {
    const { result, rerender } = renderHook(
      (props: { duration: number }) =>
        useGameTimer({ gameState: "playing", onTimeout: vi.fn(), ...props }),
      { initialProps: { duration: 10 } }
    )

    advance(5000)
    expect(result.current.timeLeft).toBeLessThan(10)

    rerender({ duration: 20 })
    expect(result.current.timeLeft).toBe(20)

    advance(1000)
    expect(result.current.timeLeft).toBeLessThanOrEqual(19)
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(18)
  })
})

describe("restart", () => {
  const playingRun: { gameState: GameState; runId: number } = {
    gameState: "playing",
    runId: 0,
  }

  // The bug this pins: leaving `playing` banks the elapsed time so a resume
  // continues where it stopped, and a run that timed out banked a *full*
  // duration. Pressing Reset returned the state machine to "idle" but left
  // that banked time in place, so the next Start resumed an already-spent
  // clock and timed out on its first frame — the session could never be
  // played again. `runId` is what tells the two apart.
  it("starts the clock over after a timeout when the run id changes", () => {
    const onTimeout = vi.fn()
    const { result, rerender } = renderHook(
      (props: { gameState: GameState; runId: number }) =>
        useGameTimer({ duration: 10, onTimeout, ...props }),
      { initialProps: playingRun }
    )

    advance(11_000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(result.current.timeLeft).toBe(0)

    // What pressing Reset does: back to idle, on a new run.
    rerender({ gameState: "idle", runId: 1 })
    expect(result.current.timeLeft).toBe(10)

    // ...and what pressing Start then does.
    rerender({ gameState: "playing", runId: 1 })
    advance(1000)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(8)
  })

  it("discards banked pause time on restart rather than resuming it", () => {
    const { result, rerender } = renderHook(
      (props: { gameState: GameState; runId: number }) =>
        useGameTimer({ duration: 10, onTimeout: vi.fn(), ...props }),
      { initialProps: playingRun }
    )

    advance(4000)
    expect(result.current.timeLeft).toBeLessThanOrEqual(7)

    rerender({ gameState: "playing", runId: 1 })
    expect(result.current.timeLeft).toBe(10)

    // Advancing is the part that matters: the displayed value resets during
    // render, but the *clock* only does if the banked elapsed time was
    // dropped too. Leave this out and the assertion above passes over a hook
    // that snaps straight back to 6 on its next frame.
    advance(1000)

    expect(result.current.timeLeft).toBeGreaterThanOrEqual(8)
  })

  it("still resumes rather than restarts when the run id is unchanged", () => {
    // The other half of the distinction: a plain pause must keep its banked
    // time, or this fix would have traded one bug for its mirror image.
    const { result, rerender } = renderHook(
      (props: { gameState: GameState }) =>
        useGameTimer({ duration: 10, onTimeout: vi.fn(), runId: 3, ...props }),
      { initialProps: playingProps }
    )

    advance(3000)
    const beforePause = result.current.timeLeft

    rerender({ gameState: "idle" })
    advance(3000)
    rerender({ gameState: "playing" })
    advance(50)

    expect(result.current.timeLeft).toBeLessThanOrEqual(beforePause)
    expect(result.current.timeLeft).toBeGreaterThanOrEqual(beforePause - 1)
  })
})

describe("unmount", () => {
  it("cancels the animation frame loop on unmount without throwing", () => {
    const onTimeout = vi.fn()
    const { unmount } = renderHook(() =>
      useGameTimer({ gameState: "playing", duration: 10, onTimeout })
    )

    advance(500)
    expect(() => unmount()).not.toThrow()

    advance(20_000)
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
