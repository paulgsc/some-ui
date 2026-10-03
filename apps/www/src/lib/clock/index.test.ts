/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useMinuteClock } from "@/lib/clock"

afterEach(() => {
  vi.useRealTimers()
})

describe("useMinuteClock", () => {
  it("moves on the minute, and not in between", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 3, 11, 59, 30))
    const { result } = renderHook(() => useMinuteClock())
    expect(result.current.getHours()).toBe(11)
    expect(result.current.getMinutes()).toBe(59)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.getHours()).toBe(12)
    expect(result.current.getMinutes()).toBe(0)
  })

  it("moves on the wall clock's minute, however late in it it subscribed", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 2, 23, 59, 59))
    const { result } = renderHook(() => useMinuteClock())
    expect(result.current.getDate()).toBe(2)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.getDate()).toBe(3)
    expect(result.current.getMinutes()).toBe(0)

    // And keeps to the boundary after that.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.getMinutes()).toBe(1)
  })

  it("catches up as soon as the page is seen again", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 3, 6, 0))
    const { result } = renderHook(() => useMinuteClock())
    // Backgrounded for hours with the timer stalled: no tick fired.
    vi.setSystemTime(new Date(2026, 9, 3, 13, 5))
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(result.current.getHours()).toBe(13)
    expect(result.current.getMinutes()).toBe(5)
  })
})
