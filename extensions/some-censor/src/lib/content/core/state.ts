/**
 * Core's state (BC3) — Boundary Contract B8: one explicit value, threaded
 * through pure reducers, never a private field.
 *
 * Plain data keyed by {@link CardKey}, so a recorded event log folds back into
 * the same state every time and the diagnostics page can render it directly.
 */

import type { ViewState } from "@censor/lib/content/fsm"
import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"
import type { SessionId } from "@some-extension/common"

import type { CardKey } from "./keys"
import type { Observation } from "./observation"

export type CardState = {
  readonly key: CardKey
  readonly observation: Observation
  /** Decided by `observation` alone (`fsm.ts`'s `decide`), never by a gesture. */
  readonly view: ViewState
  /** When the card was first observed, and when it was last. */
  readonly firstSeenAt: number
  readonly lastSeenAt: number
}

type Phase = "idle" | "running"

export type CoreState = {
  readonly phase: Phase
  readonly session: SessionId
  readonly cards: ReadonlyMap<CardKey, CardState>
  /** The owner's `B`, in days, as the shell last supplied it. */
  readonly boundaryDays: number
  /** B4's staleness signal, per session: how often the table had no answer. */
  readonly unknownShapes: Readonly<Record<UnknownShapeReason, number>>
}

export const EMPTY_UNKNOWN_SHAPES: CoreState["unknownShapes"] = {
  "surface-uncrawled": 0,
  "tag-unseen": 0,
  "nested-without-outer": 0,
  "unexpected-outer": 0,
}

/** The state before any session — what `start` folds over. */
export function initialState(session: SessionId): CoreState {
  return {
    phase: "idle",
    session,
    cards: new Map(),
    boundaryDays: DEFAULT_BOUNDARY_DAYS,
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
  readonly boundaryDays: number
  readonly unknownShapes: CoreState["unknownShapes"]
}

export function snapshot(state: CoreState): CoreSnapshot {
  return {
    phase: state.phase,
    session: state.session,
    cards: [...state.cards.values()],
    boundaryDays: state.boundaryDays,
    unknownShapes: state.unknownShapes,
  }
}
