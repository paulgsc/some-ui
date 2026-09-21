/**
 * Core's state (BC3, #1436) — Boundary Contract B8: one explicit value,
 * threaded through pure reducers, never a private field.
 *
 * Everything the old `VideoManager` kept across seven `HTMLElement`-keyed
 * maps, sets and weak maps is here as plain data keyed by {@link CardKey},
 * which is why a recorded event log folds back into the same state every
 * time and why the diagnostics page can render it without reconstructing
 * anything.
 */

import type { ViewState } from "@censor/lib/content/fsm"
import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import type { ChannelId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"

import type { CardKey } from "./keys"
import type { Observation } from "./observation"

/** What Core knows about a card's channel, and the whitelist verdict on it. */
export type ChannelState =
  /** No channel evidence yet (a provisional mount, canon Def. 4.1's "partial"). */
  | { readonly kind: "unknown" }
  /** A channel is known and its whitelist verdict was asked for at `since`. */
  | {
      readonly kind: "pending"
      readonly channelId: ChannelId
      readonly since: number
    }
  | {
      readonly kind: "known"
      readonly channelId: ChannelId
      readonly whitelisted: boolean
    }

export type CardState = {
  readonly key: CardKey
  readonly observation: Observation
  readonly view: ViewState
  readonly channel: ChannelState
  /**
   * Which incarnation of this key this is. Taken from
   * {@link CoreState.nextGeneration} at adoption, so no two adoptions of one
   * key — before and after a `gone`, or across a navigation — ever share it.
   * Every async request (`query-whitelist`, `transform-title`, `schedule`)
   * carries it and every answer echoes it; an answer from a previous
   * incarnation is stale however well its other fields match. Bot-found
   * (#1506's own review): a key re-observed while its first whitelist lookup
   * was still in flight would otherwise take the old answer for the new card
   * and discard the new one.
   */
  readonly generation: number
  /**
   * Bumped on every view change within an incarnation. A title transform or
   * the whitelist reveal timer carries the version it was issued under and is
   * discarded if the card has moved on — `VideoEntry`'s Entry-2, as data.
   * Meaningful only together with `generation`: two incarnations both count
   * from zero.
   */
  readonly version: number
  /** When the card was first observed, and when it was last. */
  readonly firstSeenAt: number
  readonly lastSeenAt: number
}

export type Phase = "idle" | "running"

export type CoreState = {
  readonly phase: Phase
  readonly session: SessionId
  readonly cards: ReadonlyMap<CardKey, CardState>
  /**
   * The next card's {@link CardState.generation}. Monotonic for the life of
   * the state — deliberately *not* reset by `start` or `nav`, since the whole
   * point is that an answer issued before a navigation cannot match a card
   * adopted after it. Explicit state, not a hidden counter (B8).
   */
  readonly nextGeneration: number
  /** B4's staleness signal, per session: how often the table had no answer. */
  readonly unknownShapes: Readonly<
    Record<UnknownShapeReason | "degraded", number>
  >
}

export const EMPTY_UNKNOWN_SHAPES: CoreState["unknownShapes"] = {
  "surface-uncrawled": 0,
  "tag-unseen": 0,
  "nested-without-outer": 0,
  "unexpected-outer": 0,
  degraded: 0,
}

/** The state before any session — what `start` folds over. */
export function initialState(session: SessionId): CoreState {
  return {
    phase: "idle",
    session,
    cards: new Map(),
    nextGeneration: 0,
    unknownShapes: EMPTY_UNKNOWN_SHAPES,
  }
}

/**
 * A JSON-safe view of the state, for the diagnostics page and for the
 * replay-determinism test. A `Map` is not JSON, so cards are listed.
 */
export type CoreSnapshot = {
  readonly phase: Phase
  readonly session: number
  readonly cards: ReadonlyArray<CardState>
  readonly nextGeneration: number
  readonly unknownShapes: CoreState["unknownShapes"]
}

export function snapshot(state: CoreState): CoreSnapshot {
  return {
    phase: state.phase,
    session: state.session,
    cards: [...state.cards.values()],
    nextGeneration: state.nextGeneration,
    unknownShapes: state.unknownShapes,
  }
}
