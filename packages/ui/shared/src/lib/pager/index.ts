/**
 * One card of several, paged by a swipe (MOB-GESTURE GES5, #2524): the
 * gesture's whole policy, as one state union and a pure `step`. `./runtime`
 * runs it over a deck's touches, and `usePager` (`components/ui/pager`)
 * hands a screen the node to attach and the card's travel to draw.
 *
 * **GES5:** on the phone build, every surface that shows one card of several
 * pages to the next and previous card by a swipe, through this pager, beside
 * a visible control that does the same; no screen carries its own swipe code.
 * Held by:
 *
 * - this `step`, tested over its whole family (`./index.test.ts`);
 * - `pnpm check:gestures` (`packages/eslint/src/gestures.ts`).
 *
 * Tolerance: desktop web is out (the phone and the desktop are separate
 * surfaces), and so is paging by keyboard.
 *
 * Rules that hold by structure:
 *
 * - **One direction lock.** A touch counts as going one way once it travels
 *   past `SLOP_PX` on either axis, the larger travel winning (`lockOf`); the
 *   pull down from a page's top reads the same lock, so the two never both
 *   take one touch.
 * - **Across the deck is someone else's.** A touch locked across a
 *   horizontal deck is the page or its card scrolling, and the pager lets it
 *   go for the rest of the touch.
 * - **A card that overflows scrolls first.** Along the deck's own axis, a
 *   touch pages only from the end of the scroller under it in the direction
 *   it goes; anywhere else it is that scroller's.
 * - **Nothing pages while something is under way** (a take): a touch that
 *   comes down while it is passes, one under way when it starts stops where
 *   it is, and a release while it is pages nothing.
 * - **A surface that claims the pointer keeps it** (a drag-and-drop list,
 *   marked `data-claims-pointer`): a touch that comes down on it passes.
 * - **A swipe never also taps.** Should the touch that paged end in a click,
 *   the click is swallowed; the next touch clears that.
 */
import { assertNever } from "@some-ui/core-utils"

/** Finger travel before a touch counts as going one way or another. */
export const SLOP_PX = 10
/** Finger travel along the deck at which letting go turns the card. */
export const SWIPE_PX = 60
/** How much of the finger's travel the card follows where it can't turn. */
export const EDGE_RESISTANCE = 0.25

export type Point = { readonly x: number; readonly y: number }

/** The axis a touch has locked to. */
export type Axis = "x" | "y"

/** A deck of cards side by side, or one above the other. */
export type Orientation = "horizontal" | "vertical"

/** Which way a card turns. */
export type Turn = "next" | "prev"

/**
 * The axis a finger that came down at `from` and is at `at` has locked to,
 * or null while it is still within `SLOP_PX` of where it came down. Pure,
 * and the one lock every gesture on the phone reads.
 */
export function lockOf(from: Point, at: Point): Axis | null {
  const dx = Math.abs(at.x - from.x)
  const dy = Math.abs(at.y - from.y)
  if (dx <= SLOP_PX && dy <= SLOP_PX) return null
  return dx >= dy ? "x" : "y"
}

/** The axis a deck pages along. */
export const axisOf = (orientation: Orientation): Axis =>
  orientation === "horizontal" ? "x" : "y"

/** What the deck says about itself at each event: read, never kept. */
export type Deck = {
  readonly orientation: Orientation
  /** There is a card before this one to turn to. */
  readonly canPrev: boolean
  /** There is a card after this one to turn to. */
  readonly canNext: boolean
  /** Something is under way (a take being recorded): nothing pages. */
  readonly held: boolean
}

/**
 * Where the scroller under the finger stands along the deck's axis when the
 * touch came down: at its start, at its end. A card that doesn't overflow is
 * at both.
 */
export type Edge = { readonly start: boolean; readonly end: boolean }

export const NO_OVERFLOW: Edge = { start: true, end: true }

/** A touch coming down on the deck, as the runtime read it. */
type Touchdown = {
  readonly at: Point
  readonly fingers: number
  /** It came down on something inside the deck that claims this axis. */
  readonly claimed: boolean
  readonly edge: Edge
}

export type PagerState =
  /** No finger on the deck. */
  | { readonly kind: "idle" }
  /** A finger down, its direction not yet known. */
  | {
      readonly kind: "tracking"
      readonly from: Point
      readonly edge: Edge
    }
  /** Going along the deck: `travel` is signed, toward the end positive. */
  | {
      readonly kind: "dragging"
      readonly from: Point
      readonly edge: Edge
      readonly travel: number
    }
  /** This touch is someone else's until it ends: a scroll, a pinch, a hold. */
  | { readonly kind: "passed" }
  /** This touch turned a card: a click it ends in is swallowed. */
  | { readonly kind: "paged" }

export const INITIAL_PAGER: PagerState = { kind: "idle" }

export type PagerEvent =
  | { readonly type: "down"; readonly touch: Touchdown }
  | { readonly type: "move"; readonly at: Point }
  | { readonly type: "up" }
  | { readonly type: "cancel" }
  /** A click reached the deck. */
  | { readonly type: "click" }

export type PagerEffect =
  /** Turn the deck's card. */
  | { readonly kind: "page"; readonly to: Turn }
  /** Stop the click that reached the deck: the touch was a swipe. */
  | { readonly kind: "swallow" }

type Step = readonly [PagerState, ReadonlyArray<PagerEffect>]

const IDLE: PagerState = INITIAL_PAGER
const PASSED: PagerState = { kind: "passed" }

const stay = (state: PagerState): Step => [state, []]

/** Where `at` is along the deck's axis. */
const along = (at: Point, orientation: Orientation): number =>
  orientation === "horizontal" ? at.x : at.y

/** The card a finger travelling `travel` along the deck drags in. */
const turnOf = (travel: number): Turn => (travel < 0 ? "next" : "prev")

/**
 * Whether the deck can turn to `to` for a touch that came down at `edge`:
 * there is a card there, and the scroller under the finger is at its end in
 * that direction. Says nothing of `held`.
 */
function open(deck: Deck, edge: Edge, to: Turn): boolean {
  return to === "next" ? deck.canNext && edge.end : deck.canPrev && edge.start
}

function down(touch: Touchdown, deck: Deck): Step {
  // A second finger, a hold, or a surface that claims the pointer: the
  // touch is someone else's, whatever this one was doing.
  if (touch.fingers !== 1 || deck.held || touch.claimed) return stay(PASSED)
  return stay({ kind: "tracking", from: touch.at, edge: touch.edge })
}

function move(state: PagerState, at: Point, deck: Deck): Step {
  if (state.kind !== "tracking" && state.kind !== "dragging") {
    return stay(state)
  }
  // Something got under way since the touch came down: stop where it is.
  if (deck.held) return stay(PASSED)
  const travel =
    along(at, deck.orientation) - along(state.from, deck.orientation)
  if (state.kind === "dragging") return stay({ ...state, travel })
  const lock = lockOf(state.from, at)
  if (lock === null) return stay(state)
  if (lock !== axisOf(deck.orientation)) return stay(PASSED)
  // Along the deck, but its card can still scroll that way: the card's.
  const to = turnOf(travel)
  const atEnd = to === "next" ? state.edge.end : state.edge.start
  if (!atEnd) return stay(PASSED)
  return stay({ kind: "dragging", from: state.from, edge: state.edge, travel })
}

function up(state: PagerState, deck: Deck): Step {
  if (state.kind === "dragging") {
    const to = turnOf(state.travel)
    const far = Math.abs(state.travel) >= SWIPE_PX
    if (far && !deck.held && open(deck, state.edge, to)) {
      return [{ kind: "paged" }, [{ kind: "page", to }]]
    }
    return stay(IDLE)
  }
  return state.kind === "paged" ? stay(state) : stay(IDLE)
}

/** The next state, and the effects that take it there. Pure. */
export function step(state: PagerState, event: PagerEvent, deck: Deck): Step {
  switch (event.type) {
    case "down": {
      return down(event.touch, deck)
    }
    case "move": {
      return move(state, event.at, deck)
    }
    case "up": {
      return up(state, deck)
    }
    case "cancel": {
      return state.kind === "paged" ? stay(state) : stay(IDLE)
    }
    case "click": {
      return state.kind === "paged"
        ? [IDLE, [{ kind: "swallow" }]]
        : stay(state)
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * How far the card on screen is drawn from its place, in pixels along the
 * deck: the finger's travel toward a card it can turn to, and only
 * `EDGE_RESISTANCE` of it toward one it can't.
 */
export function offsetOf(state: PagerState, deck: Deck): number {
  if (state.kind !== "dragging") return 0
  const to = turnOf(state.travel)
  const free = !deck.held && open(deck, state.edge, to)
  return free ? state.travel : state.travel * EDGE_RESISTANCE
}
