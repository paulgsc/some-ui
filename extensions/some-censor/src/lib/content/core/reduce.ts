/**
 * The Core reducer (BC3): `reduce(state, event) → { state, actions }`.
 *
 * Pure and total. Every branch below is a function of the state it is given
 * and the event it is handed — no clock, no randomness, no session counter,
 * no DOM, no browser call (Boundary Contract B6, B8). What a card shows is
 * `fsm.ts`'s `decide`, over the card's evidence and the event's `t`; this
 * module is the orchestration, as data in, data out.
 *
 * Design properties, pinned by `core.test.ts` (labels for citation, not
 * declared review invariants):
 *
 *   R1 — Phase gate. Nothing but `start` does anything while idle (M1).
 *   R2 — One card per artifact. `observed` for a key already held folds the
 *        observation and re-renders; it never creates a second card (M2).
 *   R3 — Navigation is total. `nav` unmounts and forgets every card and
 *        adopts the shell's new session; nothing survives it (C2, M3, F1).
 *   R5 — Every observation renders. The Actuator's idempotence is what
 *        makes that cheap, and it is what keeps "what Core believes" and
 *        "what the page shows" from drifting.
 *   R6 — Unknown shape is a state (B4). A card the table could not place is
 *        still a card, decided like every other; each `unknown-shape` token
 *        (one per element the Sensor could not place) is counted.
 *   R7 — Evidence under the boundary. A card's view is `decide()` of its
 *        merged observation at the `t` it was last observed, under the
 *        state's boundary: a re-observation that moves the estimate moves
 *        the view (#1803), and so does the owner's `boundary`, re-deciding
 *        every card in place in one step (#1807). No other input changes it.
 *   R8 — The watch page is one more piece of evidence (#1805). Its view is
 *        `decideWatch()` of the merged `watched` observations of the same
 *        video, re-decided by `boundary` as a card is; `nav` and `stop`
 *        forget it, as R3 forgets cards. A `watch` action is emitted only
 *        when its view or its video changes.
 *
 * R4 correlated the answers to Core's async requests; none are left, so it
 * is retired. The parenthesised M- and C- labels are kept so their
 * citations resolve: M1, M2 and M3 are R1, R2 and R3 as stated, and C1–C4
 * are `controller.ts`'s.
 */

import { decide, decideWatch, project } from "@censor/lib/content/fsm"
import { assertNever } from "@some-extension/common"

import type { Action, CoreFact } from "./actions"
import type { CoreEvent } from "./events"
import type { CardKey } from "./keys"
import { keyVideoId } from "./keys"
import type { Observation, WatchObservation } from "./observation"
import { mergeObservation, mergeWatch } from "./observation"
import type { CardState, CoreState, WatchState } from "./state"
import { EMPTY_UNKNOWN_SHAPES } from "./state"

export type Step = {
  readonly state: CoreState
  readonly actions: ReadonlyArray<Action>
}

const none = (state: CoreState): Step => ({ state, actions: [] })

const record = (fact: CoreFact): Action => ({ kind: "record", fact })

function withCards(
  state: CoreState,
  cards: ReadonlyMap<CardKey, CardState>
): CoreState {
  return { ...state, cards }
}

function setCard(state: CoreState, card: CardState): CoreState {
  const cards = new Map(state.cards)
  cards.set(card.key, card)
  return withCards(state, cards)
}

function deleteCard(state: CoreState, key: CardKey): CoreState {
  const cards = new Map(state.cards)
  cards.delete(key)
  return withCards(state, cards)
}

/** The render for a card's current view. */
function render(card: CardState): Action {
  return {
    kind: "render",
    key: card.key,
    model: project(card.view, card.observation),
  }
}

function stateFact(card: CardState): Action {
  return record({
    kind: "entry.state",
    videoId: keyVideoId(card.key),
    state: card.view.kind,
  })
}

/** Unmount and forget every card. */
function clearCards(state: CoreState): Step {
  const actions: Array<Action> = []
  for (const key of state.cards.keys()) actions.push({ kind: "unmount", key })
  return { state: withCards(state, new Map()), actions }
}

export function reduce(state: CoreState, event: CoreEvent): Step {
  const { kind } = event
  switch (kind) {
    // ── Lifecycle ──────────────────────────────────────────────────────────
    case "start": {
      if (state.phase === "running") return none(state)
      return {
        state: {
          ...state,
          phase: "running",
          session: event.session,
          cards: new Map(),
          watch: null,
          boundaryDays: event.boundaryDays,
          unknownShapes: EMPTY_UNKNOWN_SHAPES,
        },
        actions: [record({ kind: "session.start", session: event.session })],
      }
    }

    case "stop": {
      if (state.phase !== "running") return none(state)
      const cleared = clearCards(state)
      return {
        state: { ...cleared.state, phase: "idle", watch: null },
        actions: [
          record({ kind: "session.reset", session: state.session }),
          ...cleared.actions,
          ...unwatch(state),
        ],
      }
    }

    case "nav": {
      if (state.phase !== "running") return none(state)
      const cleared = clearCards(state)
      return {
        state: {
          ...cleared.state,
          session: event.session,
          watch: null,
          unknownShapes: EMPTY_UNKNOWN_SHAPES,
        },
        actions: [
          record({ kind: "navigation" }),
          record({ kind: "session.reset", session: state.session }),
          ...cleared.actions,
          ...unwatch(state),
          record({ kind: "session.start", session: event.session }),
        ],
      }
    }

    case "boundary": {
      if (state.phase !== "running") return none(state)
      return rebound(state, event.days)
    }

    // ── Tokens ─────────────────────────────────────────────────────────────
    case "observed": {
      if (state.phase !== "running") return none(state)
      const existing = state.cards.get(event.key)
      if (existing === undefined)
        return adopt(state, event.key, event.observation, event.t)
      return reobserve(state, existing, event.observation, event.t)
    }

    case "gone": {
      if (state.phase !== "running") return none(state)
      if (!state.cards.has(event.key)) return none(state)
      return {
        state: deleteCard(state, event.key),
        actions: [{ kind: "unmount", key: event.key }],
      }
    }

    case "watched": {
      if (state.phase !== "running") return none(state)
      return watched(state, event.watch, event.t)
    }

    case "unknown-shape": {
      if (state.phase !== "running") return none(state)
      return {
        state: {
          ...state,
          unknownShapes: {
            ...state.unknownShapes,
            [event.reason]: state.unknownShapes[event.reason] + 1,
          },
        },
        actions: [
          record({
            kind: "shape.unknown",
            tag: event.tag,
            surface: event.surface,
            reason: event.reason,
            shape: "unknown",
          }),
        ],
      }
    }

    default: {
      kind satisfies never
      return assertNever(kind)
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function adopt(
  state: CoreState,
  key: CardKey,
  observation: Observation,
  t: number
): Step {
  const card: CardState = {
    key,
    observation,
    view: decide(observation, t, state.boundaryDays, state.session),
    firstSeenAt: t,
    lastSeenAt: t,
  }
  const videoId = keyVideoId(key)
  return {
    state: setCard(state, card),
    actions: [
      render(card),
      record(
        observation.channelId === null
          ? { kind: "mount.provisional", videoId }
          : { kind: "mount.resolved", videoId }
      ),
      stateFact(card),
      record({
        kind: "date.observed",
        raw: observation.uploadDate,
        surface: observation.surface,
        renderer: observation.renderer,
      }),
    ],
  }
}

function reobserve(
  state: CoreState,
  card: CardState,
  observation: Observation,
  t: number
): Step {
  const merged = mergeObservation(card.observation, observation)
  const view = decide(merged, t, state.boundaryDays, state.session)
  const next: CardState = { ...card, observation: merged, view, lastSeenAt: t }
  const actions: Array<Action> = []
  const videoId = keyVideoId(card.key)

  // A channel arriving late (or a display-name fallback replaced by the
  // hydrated handle) upgrades a provisional card.
  if (
    merged.channelId !== null &&
    merged.channelId !== card.observation.channelId
  ) {
    actions.push(record({ kind: "channel.backfilled", videoId }))
  }

  // A date arriving late is corpus: YouTube hydrates it after the card, so
  // the adoption-time fact alone would miss most forms. Recorded when a later
  // observation supplies a new or different date, never a repeat.
  if (
    merged.uploadDate !== null &&
    merged.uploadDate !== card.observation.uploadDate
  ) {
    actions.push(
      record({
        kind: "date.observed",
        raw: merged.uploadDate,
        surface: merged.surface,
        renderer: merged.renderer,
      })
    )
  }

  // R5 and R7: re-render on every observation, whether or not the view
  // moved. A re-observed card may have gained or lost elements, and the
  // Actuator re-derives targets.
  actions.push(render(next))
  if (view.kind !== card.view.kind) actions.push(stateFact(next))
  return { state: setCard(state, next), actions }
}

function watchAction(watch: WatchState | null): Action {
  return {
    kind: "watch",
    view: watch?.view ?? null,
    videoId: watch?.observation.videoId ?? null,
  }
}

/** Strip the watch page's hold, if one is up (R8). */
function unwatch(state: CoreState): Array<Action> {
  return state.watch === null ? [] : [watchAction(null)]
}

function watched(
  state: CoreState,
  observation: WatchObservation | null,
  t: number
): Step {
  if (observation === null) {
    return { state: { ...state, watch: null }, actions: unwatch(state) }
  }
  const previous = state.watch
  const merged =
    previous === null
      ? observation
      : mergeWatch(previous.observation, observation)
  const next: WatchState = {
    observation: merged,
    view: decideWatch(merged, t, state.boundaryDays),
    seenAt: t,
  }
  const moved =
    previous?.view !== next.view ||
    previous.observation.videoId !== merged.videoId
  return {
    state: { ...state, watch: next },
    actions: moved ? [watchAction(next)] : [],
  }
}

/**
 * Re-decide every card, and the watch page, under a new boundary. Only a
 * card whose view moved is re-rendered, and each goes straight from one
 * stamp to the other, so no card passes through unstamped.
 */
function rebound(state: CoreState, boundaryDays: number): Step {
  const cards = new Map<CardKey, CardState>()
  const actions: Array<Action> = []
  for (const card of state.cards.values()) {
    const view = decide(
      card.observation,
      card.lastSeenAt,
      boundaryDays,
      state.session
    )
    const next: CardState = { ...card, view }
    cards.set(card.key, next)
    if (view.kind !== card.view.kind)
      actions.push(render(next), stateFact(next))
  }
  let watch = state.watch
  if (watch !== null) {
    const view = decideWatch(watch.observation, watch.seenAt, boundaryDays)
    if (view !== watch.view) {
      watch = { ...watch, view }
      actions.push(watchAction(watch))
    }
  }
  return { state: { ...state, boundaryDays, cards, watch }, actions }
}
