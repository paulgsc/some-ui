import { useEffect, useState } from "react"
import type { RefObject } from "react"

/** Scroll this far before the bar changes its mind: a jitter is not a direction. */
const SCROLL_SLOP = 8

/**
 * A box must have at least this much left to scroll before its scrolling may
 * hide the bar.
 *
 * Hiding the bar hands the pane its height back, so a box that overflows by
 * only a little stops overflowing the moment the bar goes: the browser clamps
 * its `scrollTop` to 0, that reads as "reached the top", the bar comes back,
 * the box overflows again - and a finger resting near the boundary sees the
 * bar bounce. A bottom bar is ~50px, so a box with less than about three bars
 * of range would spend its whole scroll inside that dead zone. Such a box
 * cannot drive the bar; it can still bring it back.
 */
const MIN_SCROLL_RANGE = 160

/**
 * Whether a phone's bottom bar should show: hidden while the content scrolls
 * down, shown again the moment it scrolls up, or reaches its top - the
 * pattern a video app uses for its bottom bar.
 *
 * Listens at `scope` in the capture phase, because the scrolling is inside a
 * pane (a text box, a chat, a fitted list's residue) and `scroll` does not
 * bubble. Each scroller's last position is kept separately, so switching
 * which box is scrolling never reads as a jump.
 *
 * `scope` must be attached to the same element for the life of the component
 * that calls this: the listener is added once, to whatever the ref holds when
 * the component mounts.
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
