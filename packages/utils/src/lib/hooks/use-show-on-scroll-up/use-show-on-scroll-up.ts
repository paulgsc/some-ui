import { useEffect, useState } from "react"
import type { RefObject } from "react"

/** Scroll this far before the bar changes its mind: a jitter is not a direction. */
const SCROLL_SLOP = 8

/**
 * Scroll range a box needs before scrolling it may hide the bar. Hiding the
 * bar (~50px) gives the pane its height back, so a box that barely overflows
 * stops overflowing, clamps `scrollTop` to 0, reads as "at the top", and the
 * bar bounces. Such a box can still bring the bar back.
 */
const MIN_SCROLL_RANGE = 160

/**
 * Whether a phone's bottom bar should show: hidden while content scrolls
 * down, shown when it scrolls up or reaches its top.
 *
 * Listens at `scope` in the capture phase, since `scroll` does not bubble out
 * of inner panes. Each scroller's last position is kept separately, so
 * switching scrollers never reads as a jump. `scope` must hold the same
 * element for the caller's lifetime: the listener is added once, on mount.
 *
 */
export function useShowOnScrollUp(
  scope: RefObject<HTMLElement | null>,
  /** Anything that should bring the bar back: the pane changing. */
  resetKey: unknown
): boolean {
  const [shown, setShown] = useState(true)
  const [lastKey, setLastKey] = useState(resetKey)
  if (lastKey !== resetKey) {
    setLastKey(resetKey)
    setShown(true)
  }

  useEffect(() => {
    const root = scope.current
    if (!root) return undefined
    const last = new WeakMap<EventTarget, number>()
    const onScroll = (event: Event): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const top = target.scrollTop
      const before = last.get(target) ?? 0
      if (top <= 0) {
        last.set(target, 0)
        setShown(true)
        return
      }
      if (Math.abs(top - before) < SCROLL_SLOP) return
      last.set(target, top)
      const goingUp = top < before
      const range = target.scrollHeight - target.clientHeight
      if (!goingUp && range < MIN_SCROLL_RANGE) return
      setShown(goingUp)
    }
    root.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return (): void => {
      root.removeEventListener("scroll", onScroll, { capture: true })
    }
  }, [scope])

  return shown
}
