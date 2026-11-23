/**
 * The show on a phone (PAGES, #3470; C1422): one scene at a time, its three
 * blocks (the narration, then its two faces) turning together about Y as a
 * finger drags them, easing into the next face once let go, and round from
 * the last scene to the first, and back. Pure: the deck's one state, the
 * events that move it and what it draws; `enhance.ts` runs it over the
 * page, with the phone's own pager (`createPager`, GES5) reading the finger.
 *
 * - **One scene index.** `at` is the scene on show; every block draws from
 *   it and the one `progress`, so the three cannot disagree.
 * - **Cyclical** (the owner, #3470): `wrap` takes every index into the deck,
 *   so the next of the last is the first and the previous of the first the
 *   last. There is no end.
 * - **A turn ends once.** A settle that a new touch or a new turn interrupts
 *   lands where it was going first, so a fast double flick turns two scenes,
 *   never one twice and never none.
 * - **Reduced motion swaps.** With `motion` false a drag draws nothing and a
 *   turn lands at once.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Turn } from "@some-ui/shared"

/** Where the deck is the show: the stage's other side (`WIDE_MOTION`, render.ts). */
export const DECK_QUERY = "(width < 900px)"
/** How long a let-go turn eases into its face, or back. */
export const SETTLE_MS = 260

/**
 * A turn's progress: 0 at rest, toward -1 as the next scene comes in from
 * the right, toward 1 as the previous one comes in from the left.
 */
type Progress = number

export type DeckState =
  | { readonly kind: "rest"; readonly at: number }
  /** A finger is turning the deck. */
  | { readonly kind: "drag"; readonly at: number; readonly progress: Progress }
  /** Let go: easing from `from` to `to` (-1, 0 or 1) since `since`. */
  | {
      readonly kind: "settle"
      readonly at: number
      readonly from: Progress
      readonly to: -1 | 0 | 1
      readonly since: number
    }

export type DeckEvent =
  /** The finger's travel, as a share of the deck's width (signed, as the pager's). */
  | { readonly type: "drag"; readonly progress: Progress }
  /** The pager turned the deck, or a key did. */
  | { readonly type: "turn"; readonly to: Turn; readonly now: number }
  /** A drag ended short, or was taken from the deck: back to rest. */
  | { readonly type: "release"; readonly now: number }
  /** A frame: a settle moves on. */
  | { readonly type: "frame"; readonly now: number }
  /** A new touch came down: a settle under way lands now. */
  | { readonly type: "touch" }
  /** A dot was pressed: straight to scene `at`, a settle under way landing first. */
  | { readonly type: "goto"; readonly at: number }

/** What a step asks of the page beyond drawing. */
type DeckEffect =
  /** A turn landed on scene `at`: say so once, and move focus there. */
  { readonly kind: "landed"; readonly at: number }

export type DeckStep = readonly [DeckState, ReadonlyArray<DeckEffect>]

export const restAt = (at: number): DeckState => ({ kind: "rest", at })

/** Index `i` in a deck of `n`, wrapped round. */
export const wrap = (i: number, n: number): number => ((i % n) + n) % n

const clamp = (v: number): number => Math.max(-1, Math.min(1, v))

/** The eased share of a settle `t` ms in: quick off the finger, soft into the face. */
function ease(t: number): number {
  const x = Math.max(0, Math.min(1, t / SETTLE_MS))
  return 1 - (1 - x) ** 3
}

/** A settle's progress at `now`. */
function settled(
  s: Extract<DeckState, { kind: "settle" }>,
  now: number
): number {
  return s.from + (s.to - s.from) * ease(now - s.since)
}

/** Where a settle lands, and the effect if it turned. */
function land(s: Extract<DeckState, { kind: "settle" }>, n: number): DeckStep {
  if (s.to === 0) return [restAt(s.at), []]
  const at = wrap(s.at - s.to, n)
  return [restAt(at), [{ kind: "landed", at }]]
}

/** The scene a turn toward `to` brings in. */
const toward = (to: Turn): -1 | 1 => (to === "next" ? -1 : 1)

/**
 * The next state, and what it asks of the page. `n` is the deck's scenes,
 * `motion` whether the reader allows motion.
 */
export function step(
  state: DeckState,
  event: DeckEvent,
  n: number,
  motion: boolean
): DeckStep {
  if (n < 2) return [state, []]
  switch (event.type) {
    case "drag": {
      if (!motion) return [state, []]
      if (state.kind === "settle") {
        // A drag only follows a touch, which lands a settle first.
        const [rest, effects] = land(state, n)
        return [
          { kind: "drag", at: rest.at, progress: clamp(event.progress) },
          effects,
        ]
      }
      return [
        { kind: "drag", at: state.at, progress: clamp(event.progress) },
        [],
      ]
    }
    case "turn": {
      const to = toward(event.to)
      // A turn under way lands first, so two quick turns are two scenes.
      const [base, effects] =
        state.kind === "settle" ? land(state, n) : [state, []]
      const from = base.kind === "drag" ? base.progress : 0
      const turning: Extract<DeckState, { kind: "settle" }> = {
        kind: "settle",
        at: base.at,
        from,
        to,
        since: event.now,
      }
      if (!motion) {
        const [rest, more] = land(turning, n)
        return [rest, [...effects, ...more]]
      }
      return [turning, effects]
    }
    case "release": {
      if (state.kind !== "drag") return [state, []]
      if (!motion || state.progress === 0) return [restAt(state.at), []]
      return [
        {
          kind: "settle",
          at: state.at,
          from: state.progress,
          to: 0,
          since: event.now,
        },
        [],
      ]
    }
    case "frame": {
      if (state.kind !== "settle") return [state, []]
      if (event.now - state.since >= SETTLE_MS) return land(state, n)
      return [state, []]
    }
    case "touch": {
      return state.kind === "settle" ? land(state, n) : [state, []]
    }
    case "goto": {
      const [base, effects] =
        state.kind === "settle" ? land(state, n) : [state, []]
      const at = wrap(event.at, n)
      if (base.at === at) return [restAt(at), effects]
      return [restAt(at), [...effects, { kind: "landed", at }]]
    }
    default: {
      return assertNever(event)
    }
  }
}

/** What the deck draws: the scene on show, the one coming in, and how far. */
export type DeckView = {
  readonly at: number
  /** The scene turning in, while one is. */
  readonly incoming: number | null
  /** The side it turns in from: -1 the right (the next), 1 the left (the previous), 0 none. */
  readonly side: -1 | 0 | 1
  readonly progress: Progress
}

/** The deck as drawn at `now`. */
export function viewOf(state: DeckState, n: number, now: number): DeckView {
  const progress =
    state.kind === "rest"
      ? 0
      : state.kind === "drag"
        ? state.progress
        : settled(state, now)
  // A settle back to rest still draws the scene it is leaving go.
  const side =
    n < 2
      ? 0
      : state.kind === "settle" && state.to !== 0
        ? state.to
        : progress < 0
          ? -1
          : progress > 0
            ? 1
            : 0
  return {
    at: state.at,
    incoming: side === 0 ? null : wrap(state.at - side, n),
    side,
    progress,
  }
}
