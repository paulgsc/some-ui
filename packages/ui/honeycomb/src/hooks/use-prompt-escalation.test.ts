import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePromptEscalation } from "./use-prompt-escalation"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("usePromptEscalation", () => {
  it("is idle when no challenge is active", () => {
    const { result } = renderHook(() =>
      usePromptEscalation({ active: false, spawnedAt: undefined, missCount: 0 })
    )

    expect(result.current).toBe("idle")
  })

  it("starts at the icon tier for a freshly spawned challenge", () => {
    const { result } = renderHook(() =>
      usePromptEscalation({
        active: true,
        spawnedAt: Date.now(),
        missCount: 0,
      })
    )

    expect(result.current).toBe("icon")
  })

  it("escalates to icon-tts after one miss, even with no time elapsed", () => {
    const { result } = renderHook(() =>
      usePromptEscalation({
        active: true,
        spawnedAt: Date.now(),
        missCount: 1,
      })
    )

    expect(result.current).toBe("icon-tts")
  })

  it("escalates to icon-tts-hangul after two misses", () => {
    const { result } = renderHook(() =>
      usePromptEscalation({
        active: true,
        spawnedAt: Date.now(),
        missCount: 2,
      })
    )

    expect(result.current).toBe("icon-tts-hangul")
  })

  it("escalates purely from elapsed time, with no misses at all", () => {
    const spawnedAt = Date.now()
    const { result, rerender } = renderHook(
      (props: { missCount: number }) =>
        usePromptEscalation({ active: true, spawnedAt, ...props }),
      { initialProps: { missCount: 0 } }
    )

    expect(result.current).toBe("icon")

    vi.advanceTimersByTime(3250)
    rerender({ missCount: 0 })
    expect(result.current).toBe("icon-tts")

    vi.advanceTimersByTime(3000)
    rerender({ missCount: 0 })
    expect(result.current).toBe("icon-tts-hangul")
  })

  it("resets to idle once the tracked challenge is no longer active", () => {
    const initialProps: { active: boolean; spawnedAt: number | undefined } = {
      active: true,
      spawnedAt: Date.now(),
    }
    const { result, rerender } = renderHook(
      (props: { active: boolean; spawnedAt: number | undefined }) =>
        usePromptEscalation({ ...props, missCount: 2 }),
      { initialProps }
    )

    expect(result.current).toBe("icon-tts-hangul")

    rerender({ active: false, spawnedAt: undefined })
    expect(result.current).toBe("idle")
  })
})
