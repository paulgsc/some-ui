/**
 * Runs `../`'s `step` over a deck's touches (GES5): it owns the deck's touch
 * and click listeners and reads, at each touch, the deck's own facts
 * (`ports.deck`), what is under the finger and where its scroller stands;
 * `step` decides what the touch means. `usePager` (`components/ui/pager`)
 * makes one per deck and attaches it to the deck's node.
 *
 * Touch events, as the pull down from a page's top reads them
 * (`apps/www/src/lib/pull-refresh/runtime.ts`), and passive: the pager never
 * stops the page or a card from scrolling. A horizontal deck sets
 * `touch-action: pan-y`, so a sideways drag is the pager's and an upright one
 * scrolls; a vertical deck leaves the scroll to its card and keeps its
 * overscroll to itself, so a page at its end turns the card rather than
 * scrolling what is behind it.
 */
import { assertNever } from "@some-ui/core-utils"

import type {
  Axis,
  Deck,
  Edge,
  Orientation,
  PagerEffect,
  PagerEvent,
  PagerState,
  Point,
  Turn,
} from ".."
import { axisOf, INITIAL_PAGER, NO_OVERFLOW, step } from ".."

/** What a deck tells its pager. */
export type PagerPorts = {
  /** The deck's facts now: read at each touch, never kept. */
  readonly deck: () => Deck
  /** Turns the deck's card. */
  readonly page: (to: Turn) => void
}

/** Until a deck says otherwise, nothing turns. */
const UNSAID: PagerPorts = {
  deck: () => ({
    orientation: "horizontal",
    canPrev: false,
    canNext: false,
    held: true,
  }),
  page: () => undefined,
}

export type PagerRuntime = {
  readonly getState: () => PagerState
  readonly subscribe: (listener: () => void) => () => void
  /** What the deck says from now on: a render's latest. */
  readonly update: (ports: PagerPorts) => void
  /**
   * Listens for touches on `node`, the deck laid out as `orientation` (the
   * deck's own, which `update` repeats), until the returned detach.
   */
  readonly attach: (node: HTMLElement, orientation: Orientation) => () => void
}

/**
 * The attribute a surface that claims the pointer carries: `x`, `y` or
 * `both`, the axes it claims. A deck carries its own axis; a drag-and-drop
 * list carries `both`.
 */
export const CLAIMS_POINTER = "data-claims-pointer"

/**
 * Whether something from `target` up to (not including) `stop`, or up to the
 * document when `stop` is absent, claims `axis`: then a touch that came down
 * there is that surface's, not this gesture's.
 */
export function claimsAxis(
  target: EventTarget | null,
  axis: Axis,
  stop?: Element
): boolean {
  let node: Element | null = target instanceof Element ? target : null
  for (; node !== null && node !== stop; node = node.parentElement) {
    const claims = node.getAttribute(CLAIMS_POINTER)
    if (claims === "both" || claims === axis) return true
  }
  return false
}

/**
 * Where the nearest scroller from `target` up to `deck` that overflows along
 * `axis` stands: at its start, at its end. None overflowing is at both.
 */
export function edgeOf(
  target: EventTarget | null,
  deck: Element,
  axis: Axis
): Edge {
  let node: Element | null = target instanceof Element ? target : deck
  for (; node !== null; node = node.parentElement) {
    const size = axis === "x" ? node.scrollWidth : node.scrollHeight
    const box = axis === "x" ? node.clientWidth : node.clientHeight
    if (size > box + 1) {
      const at = axis === "x" ? node.scrollLeft : node.scrollTop
      return { start: at <= 0, end: at + box >= size - 1 }
    }
    if (node === deck) break
  }
  return NO_OVERFLOW
}

/** Where the first finger on the deck is, if one is. */
function firstTouch(touches: TouchList): Point | null {
  const touch = Array.from(touches).at(0)
  return touch === undefined ? null : { x: touch.clientX, y: touch.clientY }
}

/** One deck's pager: made once, attached while its node is mounted. */
export function createPager(initial: PagerPorts = UNSAID): PagerRuntime {
  let ports = initial
  let state: PagerState = INITIAL_PAGER
  const listeners = new Set<() => void>()

  /** Runs `event`; says whether a click it carried is to be swallowed. */
  function dispatch(event: PagerEvent): boolean {
    const [next, effects] = step(state, event, ports.deck())
    let swallow = false
    const run = (effect: PagerEffect): void => {
      switch (effect.kind) {
        case "page": {
          ports.page(effect.to)
          return
        }
        case "swallow": {
          swallow = true
          return
        }
        default: {
          assertNever(effect)
        }
      }
    }
    if (next !== state) {
      state = next
      listeners.forEach((listener) => listener())
    }
    effects.forEach(run)
    return swallow
  }

  const attach = (
    node: HTMLElement,
    orientation: Orientation
  ): (() => void) => {
    const axis = axisOf(orientation)
    const onStart = (event: TouchEvent): void => {
      const at = firstTouch(event.touches)
      if (at === null) return
      dispatch({
        type: "down",
        touch: {
          at,
          fingers: event.touches.length,
          claimed: claimsAxis(event.target, axis, node),
          edge: edgeOf(event.target, node, axis),
        },
      })
    }
    const onMove = (event: TouchEvent): void => {
      const at = firstTouch(event.touches)
      if (at !== null) dispatch({ type: "move", at })
    }
    const onEnd = (): void => {
      dispatch({ type: "up" })
    }
    const onCancel = (): void => {
      dispatch({ type: "cancel" })
    }
    // A swipe that began on a button may end in its click: swallowed here,
    // before the button hears it, so a swipe never also starts a take.
    const onClick = (event: MouseEvent): void => {
      if (!dispatch({ type: "click" })) return
      event.preventDefault()
      event.stopPropagation()
    }

    const passive = { passive: true }
    node.addEventListener("touchstart", onStart, passive)
    node.addEventListener("touchmove", onMove, passive)
    node.addEventListener("touchend", onEnd, passive)
    node.addEventListener("touchcancel", onCancel, passive)
    node.addEventListener("click", onClick, { capture: true })
    const was = {
      claims: node.getAttribute(CLAIMS_POINTER),
      touchAction: node.style.touchAction,
      overscroll: node.style.overscrollBehavior,
    }
    node.setAttribute(CLAIMS_POINTER, axis)
    if (axis === "x") node.style.touchAction = "pan-y"
    else node.style.overscrollBehavior = "contain"

    return (): void => {
      node.removeEventListener("touchstart", onStart)
      node.removeEventListener("touchmove", onMove)
      node.removeEventListener("touchend", onEnd)
      node.removeEventListener("touchcancel", onCancel)
      node.removeEventListener("click", onClick, { capture: true })
      if (was.claims === null) node.removeAttribute(CLAIMS_POINTER)
      else node.setAttribute(CLAIMS_POINTER, was.claims)
      node.style.touchAction = was.touchAction
      node.style.overscrollBehavior = was.overscroll
      // A touch in hand when the deck went is nobody's now.
      dispatch({ type: "cancel" })
    }
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update: (next): void => {
      ports = next
    },
    attach,
  }
}
