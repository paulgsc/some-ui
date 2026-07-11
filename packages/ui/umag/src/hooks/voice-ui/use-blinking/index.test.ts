import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useBlinking } from "."

describe("useBlinking", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_000)
  })

  it("initializes blink state relative to mount time", () => {
    const { result } = renderHook(() => useBlinking())

    expect(result.current.blinkState.current).toEqual({
      isBlinking: false,
      blinkProgress: 0,
      nextBlink: 1_000 + 3_000,
      blinkDuration: 0.12,
    })
  })

  it("does nothing before nextBlink and while already blinking is false", () => {
    const { result } = renderHook(() => useBlinking())

    result.current.updateBlinking(1_000 + 2_999)

    expect(result.current.blinkState.current).toEqual({
      isBlinking: false,
      blinkProgress: 0,
      nextBlink: 4_000,
      blinkDuration: 0.12,
    })
  })

  it("starts a blink once now passes nextBlink", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    const { result } = renderHook(() => useBlinking())

    result.current.updateBlinking(4_001)

    // blinkDuration = 0.08 + 0.5 * 0.08 = 0.12, then immediately advanced
    // once by that same duration in the same tick.
    expect(result.current.blinkState.current).toEqual({
      isBlinking: true,
      blinkProgress: 0.12,
      nextBlink: 4_000,
      blinkDuration: 0.12,
    })
  })

  it("ends the blink once blinkProgress reaches 1 and schedules the next one", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const { result } = renderHook(() => useBlinking())

    // Trigger the blink (blinkDuration = 0.08 with random() = 0).
    result.current.updateBlinking(4_001)
    expect(result.current.blinkState.current.isBlinking).toBe(true)

    // Advance past the finish line: 0.08 * 13 = 1.04 >= 1.
    for (let i = 0; i < 12; i += 1) {
      result.current.updateBlinking(4_001)
    }

    expect(result.current.blinkState.current).toEqual({
      isBlinking: false,
      blinkProgress: 0,
      nextBlink: 4_001 + 1_500,
      blinkDuration: 0.08,
    })
  })
})
