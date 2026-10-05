import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useTypingEffect } from "."

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Advances by each step's ms, checking what is shown after it. */
function expectReveal(
  result: { current: string },
  steps: Array<[number, string]>
): void {
  for (const [ms, shown] of steps) {
    advance(ms)
    expect(result.current).toBe(shown)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe("useTypingEffect - character reveal", () => {
  it("reveals one more character per tick and stops after content.length + 1 ticks", () => {
    const { result } = renderHook(() =>
      useTypingEffect({ content: "abc", speed: 20 })
    )

    expect(result.current).toBe("")

    // Tick 1 shows slice(0, 0); tick 4 (content.length + 1) clears the
    // interval, so the last step is a no-op.
    expectReveal(result, [
      [20, ""],
      [20, "a"],
      [20, "ab"],
      [20, "abc"],
      [100, "abc"],
    ])
  })
})

describe("useTypingEffect - restarts on prop change", () => {
  it("restarts the reveal from scratch when content changes mid-animation", () => {
    const { result, rerender } = renderHook(
      (props: { content: string; speed?: number }) => useTypingEffect(props),
      { initialProps: { content: "abc", speed: 20 } }
    )

    advance(20) // tick -> ""
    advance(20) // tick -> "a"
    expect(result.current).toBe("a")

    rerender({ content: "xyz", speed: 20 })

    // The effect's cleanup clears the old interval; the new one starts a
    // fresh reveal for "xyz" rather than continuing from the old index.
    expectReveal(result, [
      [20, ""],
      [20, "x"],
      [20, "xy"],
      [20, "xyz"],
    ])
  })

  it("restarts the interval cadence when speed changes", () => {
    const { result, rerender } = renderHook(
      (props: { content: string; speed?: number }) => useTypingEffect(props),
      { initialProps: { content: "ab", speed: 20 } }
    )

    advance(20)
    expect(result.current).toBe("")

    rerender({ content: "ab", speed: 50 })

    // A further 20ms (which would have ticked under the old 20ms cadence)
    // must not trigger a tick under the new, slower one.
    advance(20)
    expect(result.current).toBe("")

    // Completing the new 50ms interval fires the (reset) first tick, still "".
    advance(30)
    expect(result.current).toBe("")

    // The next 50ms tick reveals the first character.
    advance(50)
    expect(result.current).toBe("a")
  })
})
