/**
 * Dragging down from the top of a phone page to check again (PULL0, #2457):
 * the gesture's whole policy, as one state union and a pure `step`.
 *
 * A drag arms only when it starts with the page at its top, goes down before
 * it goes sideways or up, and travels `ARM_PX` (after `RESISTANCE`). Letting
 * go armed checks again; letting go short of that does nothing. While a check
 * is out a new drag is ignored, and a check's answer counts only for the pull
 * that asked it (`settled.pull`): one that lands after the page moved on
 * (`left`) paints nothing. `./runtime` runs the effects over the page's
 * touches and its reads; React only shows the state (`components/pull-to-check`).
 *
 * The page is never reloaded (epic #2456, D3): checking again re-reads what is
 * on screen, and what is in hand stays.
 */
import { assertNever } from "@some-ui/core-utils"

/** How far the indicator travels per pixel the finger does: the pull resists. */
export const RESISTANCE = 0.5
/** The indicator's travel at which letting go checks again. */
export const ARM_PX = 64
/** The furthest the indicator travels, however far the finger goes. */
export const MAX_PX = 96
/** Finger travel before a touch counts as going one way or another. */
export const SLOP_PX = 10
/** How long "Up to date" stays before the indicator goes. */
export const DONE_MS = 2_000
/** How long a check that could not finish stays said. */
export const FAILED_MS = 5_000

export type Point = { readonly x: number; readonly y: number }

export type Phase =
  /** Nothing in hand, nothing showing. */
  | { readonly kind: "idle" }
  /** A finger down at the page's top, its direction not yet known. */
  | { readonly kind: "tracking"; readonly from: Point }
  /** Going down, short of `ARM_PX`: letting go does nothing. */
  | {
      readonly kind: "pulling"
      readonly from: Point
      readonly distance: number
    }
  /** Down past `ARM_PX`: letting go checks again. */
  | { readonly kind: "armed"; readonly from: Point; readonly distance: number }
  /** Pull number `pull` is checking. */
  | { readonly kind: "checking"; readonly pull: number }
  /** Pull `pull` finished at `at` (epoch ms). */
  | { readonly kind: "done"; readonly pull: number; readonly at: number }
  /** Pull `pull` could not read everything again, at `at`. */
  | { readonly kind: "failed"; readonly pull: number; readonly at: number }

export type PullState = {
  /** Pulls checked so far: the next one is `pulls + 1`. */
  readonly pulls: number
  readonly phase: Phase
}

export const INITIAL_PULL: PullState = { pulls: 0, phase: { kind: "idle" } }

export type PullEvent =
  /** A finger came down; `atTop` when nothing under it is scrolled down. */
  | {
      readonly type: "touchStart"
      readonly at: Point
      readonly atTop: boolean
      readonly fingers: number
    }
  | { readonly type: "touchMove"; readonly at: Point }
  | { readonly type: "touchEnd" }
  | { readonly type: "touchCancel" }
  /** Pull `pull`'s reads came back, all of them or not. */
  | {
      readonly type: "settled"
      readonly pull: number
      readonly outcome: "done" | "failed"
      readonly at: number
    }
  /** Pull `pull`'s outcome has been shown long enough. */
  | { readonly type: "faded"; readonly pull: number }
  /** The page moved to another route, or the gesture was taken away. */
  | { readonly type: "left" }

export type PullEffect =
  /** Read again what the page shows, then answer `settled` for `pull`. */
  | { readonly kind: "check"; readonly pull: number }
  /** Answer `faded` for `pull` after `afterMs`. */
  | { readonly kind: "fade"; readonly pull: number; readonly afterMs: number }

type Step = readonly [PullState, ReadonlyArray<PullEffect>]

const IDLE: Phase = { kind: "idle" }

const stay = (state: PullState): Step => [state, []]
const to = (state: PullState, phase: Phase): Step => [{ ...state, phase }, []]

/** Whether a finger is on the page in this phase. */
const inHand = (
  phase: Phase
): phase is Extract<Phase, { kind: "tracking" | "pulling" | "armed" }> =>
  phase.kind === "tracking" ||
  phase.kind === "pulling" ||
  phase.kind === "armed"

/** The indicator's travel for a finger `dy` below where it came down. */
export const travel = (dy: number): number =>
  Math.min(MAX_PX, Math.max(0, dy) * RESISTANCE)

/** Where a finger at `at` puts a drag that came down at `from`. */
function dragged(from: Point, at: Point): Phase {
  const dy = at.y - from.y
  if (dy <= 0) return IDLE
  const distance = travel(dy)
  return distance >= ARM_PX
    ? { kind: "armed", from, distance }
    : { kind: "pulling", from, distance }
}

function touchStart(
  state: PullState,
  event: Extract<PullEvent, { type: "touchStart" }>
): Step {
  const { phase } = state
  // One check at a time: a drag while one is out is the page's own.
  if (phase.kind === "checking") return stay(state)
  // A second finger is a pinch, never a pull.
  if (event.fingers !== 1) return inHand(phase) ? to(state, IDLE) : stay(state)
  if (event.atTop) return to(state, { kind: "tracking", from: event.at })
  return inHand(phase) ? to(state, IDLE) : stay(state)
}

function touchMove(state: PullState, at: Point): Step {
  const { phase } = state
  if (phase.kind === "tracking") {
    const dx = Math.abs(at.x - phase.from.x)
    const dy = at.y - phase.from.y
    // Up is the page scrolling, and sideways is a swipe: neither is a pull.
    if (dy < -SLOP_PX) return to(state, IDLE)
    if (dx > SLOP_PX && dx >= dy) return to(state, IDLE)
    if (dy > SLOP_PX && dy > dx) return to(state, dragged(phase.from, at))
    return stay(state)
  }
  if (phase.kind === "pulling" || phase.kind === "armed") {
    return to(state, dragged(phase.from, at))
  }
  return stay(state)
}

/** The next state, and the effects that take it there. Pure. */
export function step(state: PullState, event: PullEvent): Step {
  const { phase } = state
  switch (event.type) {
    case "touchStart": {
      return touchStart(state, event)
    }
    case "touchMove": {
      return touchMove(state, event.at)
    }
    case "touchEnd": {
      if (phase.kind === "armed") {
        const pull = state.pulls + 1
        return [
          { pulls: pull, phase: { kind: "checking", pull } },
          [{ kind: "check", pull }],
        ]
      }
      return inHand(phase) ? to(state, IDLE) : stay(state)
    }
    case "touchCancel": {
      return inHand(phase) ? to(state, IDLE) : stay(state)
    }
    case "settled": {
      // An answer for a pull that is no longer out (the page moved on) is stale.
      if (phase.kind !== "checking" || phase.pull !== event.pull) {
        return stay(state)
      }
      const outcome = { kind: event.outcome, pull: event.pull, at: event.at }
      const afterMs = event.outcome === "done" ? DONE_MS : FAILED_MS
      return [
        { ...state, phase: outcome },
        [{ kind: "fade", pull: event.pull, afterMs }],
      ]
    }
    case "faded": {
      return (phase.kind === "done" || phase.kind === "failed") &&
        phase.pull === event.pull
        ? to(state, IDLE)
        : stay(state)
    }
    case "left": {
      return phase.kind === "idle" ? stay(state) : to(state, IDLE)
    }
    default: {
      return assertNever(event)
    }
  }
}
