/**
 * Runs `./model`'s `step` over a page scroller's touches and the reads a
 * check makes. It owns the touch listeners, the root's overscroll, the
 * timers and the route subscription; `step` decides which answer is stale.
 */
import { assertNever } from "@some-ui/core-utils"

import type { CheckEnd, Point, PullEffect, PullEvent, PullState } from "./model"
import { INITIAL_PULL, step } from "./model"

/** What a check reaches, behind ports. */
export type PullPorts = {
  /**
   * Reads again everything the page shows, and resolves to how that ended.
   * A rejection is a check that said nothing of what it could not read.
   */
  readonly readAgain: () => Promise<CheckEnd>
  /** Calls `listener` each time the page moves to another route. */
  readonly onLeave: (listener: () => void) => () => void
  /** Epoch ms, for when a check finished. */
  readonly now: () => number
}

export type PullRuntime = {
  readonly getState: () => PullState
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Listens for drags on `scroller`, the page's scroller, until the returned
   * detach: a ref's cleanup, or the route turning bounded (D2).
   */
  readonly attach: (scroller: HTMLElement) => () => void
}

/**
 * Whether nothing under `target`, up to and including `scroller`, nor the
 * document itself, is scrolled down: only then is a drag down a pull and not
 * the page (or a list in it) scrolling back up. On the phone the document is
 * what scrolls an ordinary route (`routes/_dashboard.tsx`: the shell bounds
 * no height there), so it is read too.
 */
export function atTop(
  target: EventTarget | null,
  scroller: HTMLElement
): boolean {
  const doc = scroller.ownerDocument
  if ((doc.scrollingElement ?? doc.documentElement).scrollTop > 0) return false
  let node: Element | null = target instanceof Element ? target : scroller
  for (; node !== null; node = node.parentElement) {
    if (node.scrollTop > 0) return false
    if (node === scroller) return true
  }
  return true
}

/** Where the first finger on the page is, if one is. */
function firstTouch(touches: TouchList): Point | null {
  const touch = Array.from(touches).at(0)
  return touch === undefined ? null : { x: touch.clientX, y: touch.clientY }
}

/** One shell's pull: made once, attached while its page route allows one. */
export function createPullRuntime(ports: PullPorts): PullRuntime {
  let state: PullState = INITIAL_PULL
  const listeners = new Set<() => void>()

  const settle = (pull: number, end: CheckEnd): void =>
    dispatch({ type: "settled", pull, end, at: ports.now() })
  const unsaid: CheckEnd = { kind: "unread", what: [] }

  // Each timer is bounded (`CHECK_MS`, `DONE_MS`, `FAILED_MS`) and only
  // moves the machine on, so a detach leaves them to run out. The deadline
  // must: a read that never answers would otherwise hold every later pull.
  const run = (effect: PullEffect): void => {
    const { pull } = effect
    switch (effect.kind) {
      case "check": {
        ports.readAgain().then(
          (end) => settle(pull, end),
          () => settle(pull, unsaid)
        )
        return
      }
      case "deadline": {
        setTimeout(() => settle(pull, unsaid), effect.afterMs)
        return
      }
      case "fade": {
        setTimeout(() => dispatch({ type: "faded", pull }), effect.afterMs)
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  function dispatch(event: PullEvent): void {
    const [next, effects] = step(state, event)
    effects.forEach(run)
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }

  const attach = (scroller: HTMLElement): (() => void) => {
    const root = scroller.ownerDocument.documentElement
    const onStart = (event: TouchEvent): void => {
      const at = firstTouch(event.touches)
      if (at === null) return
      dispatch({
        type: "touchStart",
        at,
        atTop: atTop(event.target, scroller),
        fingers: event.touches.length,
      })
    }
    const onMove = (event: TouchEvent): void => {
      const at = firstTouch(event.touches)
      if (at !== null) dispatch({ type: "touchMove", at })
    }
    const onEnd = (): void => dispatch({ type: "touchEnd" })
    const onCancel = (): void => dispatch({ type: "touchCancel" })

    // Passive: a pull never stops the page from scrolling. The root's
    // overscroll is off instead, so the WebView's stretch at the top does
    // not move the page under the indicator; `contain` would keep it.
    const passive = { passive: true }
    scroller.addEventListener("touchstart", onStart, passive)
    scroller.addEventListener("touchmove", onMove, passive)
    scroller.addEventListener("touchend", onEnd, passive)
    scroller.addEventListener("touchcancel", onCancel, passive)
    const overscroll = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = "none"
    const stopLeaving = ports.onLeave(() => dispatch({ type: "left" }))

    return (): void => {
      scroller.removeEventListener("touchstart", onStart)
      scroller.removeEventListener("touchmove", onMove)
      scroller.removeEventListener("touchend", onEnd)
      scroller.removeEventListener("touchcancel", onCancel)
      root.style.overscrollBehaviorY = overscroll
      stopLeaving()
      // Whatever was out paints nothing now.
      dispatch({ type: "left" })
    }
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    attach,
  }
}
