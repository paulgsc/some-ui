import { useAutoDismiss } from "@honeycomb/hooks/use-auto-dismiss"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Props = { active: boolean; paused: boolean }

function setup(
  onElapsed: () => void,
  initialProps: Props = { active: true, paused: false },
  durationMs = 1000
): ReturnType<typeof renderHook<ReturnType<typeof useAutoDismiss>, Props>> {
  return renderHook(
    (props: Props) => useAutoDismiss({ ...props, durationMs, onElapsed }),
    { initialProps }
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useAutoDismiss", () => {
  it("fires once the duration elapses", () => {
    const onElapsed = vi.fn()
    setup(onElapsed)

    act(() => vi.advanceTimersByTime(1000))

    expect(onElapsed).toHaveBeenCalledTimes(1)
  })

  it("does not fire before the duration elapses", () => {
    const onElapsed = vi.fn()
    const { result } = setup(onElapsed)

    act(() => vi.advanceTimersByTime(400))

    expect(onElapsed).not.toHaveBeenCalled()
    expect(result.current.remainingMs).toBe(600)
    expect(result.current.progress).toBeCloseTo(0.4, 5)
  })

  it("fires exactly once even as time keeps running past the duration", () => {
    const onElapsed = vi.fn()
    setup(onElapsed)

    act(() => vi.advanceTimersByTime(5000))

    expect(onElapsed).toHaveBeenCalledTimes(1)
  })

  it("never fires while inactive", () => {
    const onElapsed = vi.fn()
    setup(onElapsed, { active: false, paused: false })

    act(() => vi.advanceTimersByTime(5000))

    expect(onElapsed).not.toHaveBeenCalled()
  })

  it("freezes where it stands while paused, then resumes from there", () => {
    const onElapsed = vi.fn()
    const { rerender, result } = setup(onElapsed)

    act(() => vi.advanceTimersByTime(400))
    rerender({ active: true, paused: true })

    // Long enough that a wall-clock implementation would have fired twice over.
    act(() => vi.advanceTimersByTime(10_000))
    expect(onElapsed).not.toHaveBeenCalled()
    expect(result.current.remainingMs).toBe(600)

    rerender({ active: true, paused: false })
    act(() => vi.advanceTimersByTime(500))
    expect(onElapsed).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(100))
    expect(onElapsed).toHaveBeenCalledTimes(1)
  })

  it("starts over when it goes inactive and comes back", () => {
    const onElapsed = vi.fn()
    const { rerender, result } = setup(onElapsed)

    act(() => vi.advanceTimersByTime(700))
    rerender({ active: false, paused: false })
    act(() => vi.advanceTimersByTime(1000))
    expect(onElapsed).not.toHaveBeenCalled()

    rerender({ active: true, paused: false })
    expect(result.current.remainingMs).toBe(1000)

    act(() => vi.advanceTimersByTime(900))
    expect(onElapsed).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(100))
    expect(onElapsed).toHaveBeenCalledTimes(1)
  })
})
