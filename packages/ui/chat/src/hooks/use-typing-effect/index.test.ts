import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useTypingEffect } from "."

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

// ═══════════════════════════════════════════════════════════════════════════
// reveals full content after content.length + 1 ticks
// ═══════════════════════════════════════════════════════════════════════════

describe("useTypingEffect - character reveal", () => {
  it("reveals one more character per tick and stops after content.length + 1 ticks", () => {
    const { result } = renderHook(() =>
      useTypingEffect({ content: "abc", speed: 20 })
    )

    expect(result.current).toBe("")

    advance(20)
    expect(result.current).toBe("") // tick 1: i=0 -> slice(0,0)
    advance(20)
    expect(result.current).toBe("a") // tick 2
    advance(20)
    expect(result.current).toBe("ab") // tick 3
    advance(20)
    expect(result.current).toBe("abc") // tick 4 (content.length + 1) - clears

    advance(100)
    expect(result.current).toBe("abc") // interval already cleared, no-op
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// restarts on content/speed change
// ═══════════════════════════════════════════════════════════════════════════

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
    advance(20)
    expect(result.current).toBe("")
    advance(20)
    expect(result.current).toBe("x")
    advance(20)
    expect(result.current).toBe("xy")
    advance(20)
    expect(result.current).toBe("xyz")
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
