import { act, renderHook } from "@testing-library/react"
import type { Mock } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useTypewriterAnimation } from "./use-typewriter-animation"

// ═══════════════════════════════════════════════════════════════════════════
// S6 — use-typewriter-animation.ts:169-174 is a `set-state-in-effect` +
// timer/Web-Animations-API hook: `useEffect(() => { if (solved)
// startAnimation() ...}, [solved])` drives a chained setTimeout/
// Element.animate() sequence (invalid-attempt shake -> valid-letter pop),
// and its cleanup cancels whatever animation/timeout is in flight. These
// tests characterize the reveal cadence, the re-arm-on-`solved`-change
// guard, and the cleanup-cancels-in-flight-work invariant before any
// exhaustive-deps/set-state-in-effect fix touches it (#555).
//
// jsdom does not implement `Element.animate` (Web Animations API), so a
// plain object standing in for the SVG element is used, with a controllable
// fake `Animation` whose `onfinish` this test triggers manually instead of
// waiting on a real animation frame.
// ═══════════════════════════════════════════════════════════════════════════

type FakeAnimation = {
  onfinish: (() => void) | null
  cancel: Mock
}

function makeFakeElement(): {
  element: SVGSVGElement
  animateMock: Mock<(keyframes: unknown, options: unknown) => FakeAnimation>
  animations: Array<FakeAnimation>
} {
  const animations: Array<FakeAnimation> = []
  const animateMock = vi.fn((_keyframes: unknown, _options: unknown) => {
    const anim: FakeAnimation = { onfinish: null, cancel: vi.fn() }
    animations.push(anim)
    return anim
  })
  const fake = { animate: animateMock }
  // A plain object with only `animate()` can never structurally satisfy
  // `SVGSVGElement` — jsdom doesn't implement the Web Animations API this
  // hook depends on, so a fake stand-in is the only option.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  const element = fake as unknown as SVGSVGElement
  return { element, animateMock, animations }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("startAnimation guards", () => {
  it("does nothing without a ref set on the SVG element", () => {
    const { result } = renderHook(() =>
      useTypewriterAnimation({ validLetter: "a", solved: false })
    )

    act(() => {
      result.current.startAnimation()
    })

    expect(result.current.isAnimating).toBe(false)
  })

  it("does not restart the sequence if already animating", () => {
    const { element, animateMock } = makeFakeElement()
    const { result } = renderHook(() =>
      useTypewriterAnimation({
        validLetter: "a",
        solved: false,
        typingSpeed: 10,
      })
    )

    act(() => {
      result.current.setRef(element)
      result.current.startAnimation()
    })
    expect(result.current.isAnimating).toBe(true)

    act(() => {
      result.current.startAnimation()
    })

    // A second call while already animating is a no-op guard
    // (`if (isAnimating || !elementRef.current) return`) — advancing past
    // the first tick should only ever have scheduled one shake animation.
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(animateMock).toHaveBeenCalledTimes(1)
  })
})

describe("triggers automatically on solved: false -> true", () => {
  it("enters the animating/highlighted state as soon as solved flips true", () => {
    const { element } = makeFakeElement()
    const { result, rerender } = renderHook(
      (props: { solved: boolean }) =>
        useTypewriterAnimation({ validLetter: "a", ...props }),
      { initialProps: { solved: false } }
    )

    act(() => {
      result.current.setRef(element)
    })
    expect(result.current.isAnimating).toBe(false)

    rerender({ solved: true })

    expect(result.current.isAnimating).toBe(true)
    expect(result.current.isHighlighted).toBe(true)
    expect(result.current.isValid).toBe(false)
  })

  it("does not re-trigger the sequence on a re-render where solved stays true", () => {
    const { element, animateMock } = makeFakeElement()
    const { rerender } = renderHook(
      (props: { solved: boolean }) =>
        useTypewriterAnimation({
          validLetter: "a",
          typingSpeed: 10,
          ...props,
        }),
      { initialProps: { solved: true } }
    )

    // setRef only takes effect from the next `solved` transition since the
    // effect already ran on mount with a null ref — re-render with the same
    // `solved` value to confirm the effect (keyed only on `solved`) doesn't
    // fire again and schedule a second shake.
    rerender({ solved: true })
    rerender({ solved: true })

    act(() => {
      vi.advanceTimersByTime(10)
    })

    void element
    expect(animateMock).not.toHaveBeenCalled()
  })
})

describe("cleanup cancels in-flight work", () => {
  it("cancels the running vibration animation and clears pending timeouts when solved flips back to false", () => {
    const { element, animateMock, animations } = makeFakeElement()
    const { result, rerender } = renderHook(
      (props: { solved: boolean }) =>
        useTypewriterAnimation({
          validLetter: "a",
          typingSpeed: 10,
          ...props,
        }),
      { initialProps: { solved: false } }
    )

    act(() => {
      result.current.setRef(element)
    })
    rerender({ solved: true })

    act(() => {
      vi.advanceTimersByTime(10) // fires the first animateInvalidAttempt()
    })
    expect(animateMock).toHaveBeenCalledTimes(1)
    const shake = animations[0]
    expect(shake).toBeDefined()

    rerender({ solved: false })

    expect(shake?.cancel).toHaveBeenCalledTimes(1)

    // No further timeouts should fire post-cleanup: advancing well past
    // every remaining stage of the sequence must not schedule another
    // animation.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(animateMock).toHaveBeenCalledTimes(1)
  })

  it("cancels in-flight work on unmount", () => {
    const { element, animateMock, animations } = makeFakeElement()
    const { result, rerender, unmount } = renderHook(
      (props: { solved: boolean }) =>
        useTypewriterAnimation({
          validLetter: "a",
          typingSpeed: 10,
          ...props,
        }),
      { initialProps: { solved: false } }
    )

    act(() => {
      result.current.setRef(element)
    })
    rerender({ solved: true })
    act(() => {
      vi.advanceTimersByTime(10)
    })
    const shake = animations[0]

    unmount()

    expect(shake?.cancel).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(animateMock).toHaveBeenCalledTimes(1)
  })
})

describe("full reveal sequence", () => {
  it("shows invalidAttempts shakes then the valid letter, firing onComplete exactly once", () => {
    vi.spyOn(Math, "random").mockReturnValue(0) // always picks invalidLetters[0]

    const { element, animateMock, animations } = makeFakeElement()
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      (props: { solved: boolean }) =>
        useTypewriterAnimation({
          validLetter: "Z",
          invalidLetters: ["x"],
          invalidAttempts: 1,
          typingSpeed: 10,
          invalidDuration: 5,
          onComplete,
          ...props,
        }),
      { initialProps: { solved: false } }
    )

    act(() => {
      result.current.setRef(element)
    })
    rerender({ solved: true })

    // Tick 1 (typingSpeed): first (only) invalid attempt shown + shake starts.
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.currentLetter).toBe("x")
    expect(result.current.isVibrating).toBe(true)
    expect(animateMock).toHaveBeenCalledTimes(1)

    // Vibration finishes -> letter held for `invalidDuration`, then cleared.
    act(() => {
      animations[0]?.onfinish?.()
    })
    expect(result.current.isVibrating).toBe(false)

    act(() => {
      vi.advanceTimersByTime(5) // invalidDuration
    })
    expect(result.current.currentLetter).toBe("")

    // Wait `typingSpeed` more, currentAttempt (1) >= invalidAttempts (1) ->
    // animateValidLetter() runs directly (no further shake scheduled).
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.currentLetter).toBe("Z")
    expect(result.current.isValid).toBe(true)
    expect(animateMock).toHaveBeenCalledTimes(2) // shake + pop, no 2nd shake

    expect(onComplete).not.toHaveBeenCalled()

    // Pop animation finishes -> isAnimating clears, onComplete fires once.
    act(() => {
      animations[1]?.onfinish?.()
    })
    expect(result.current.isAnimating).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
