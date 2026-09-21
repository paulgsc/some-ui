/**
 * The Core reducer (BC3, #1436): `reduce(state, event) → { state, actions }`.
 *
 * Pure and total. Every branch below is a function of the state it is given
 * and the event it is handed — no clock, no randomness, no session counter,
 * no DOM, no browser call (Boundary Contract B6, B8). The disclosure ladder
 * is `fsm.ts`'s, ported as-is (F1–F4 still hold: every view carries its
 * session, transitions are typed over their legal sources, `project()` is
 * exhaustive); what this module adds is the *orchestration* `VideoManager`
 * and `VideoEntry` used to do in place — as data in, data out.
 *
 * Invariants:
 *
 *   R1 — Phase gate. Nothing but `start` does anything while idle (M1).
 *   R2 — One card per artifact. `observed` for a key already held folds the
 *        observation and re-renders; it never creates a second card (M2, and
 *        #1426's "adopting the same card twice produces exactly one entry").
 *   R3 — Navigation is total. `nav` unmounts and forgets every card and
 *        adopts the shell's new session; nothing survives it (C2, M3, F1).
 *   R4 — Async answers are versioned. A whitelist answer, a title transform
 *        or a reveal timer for a card whose version has moved on is discarded
 *        and recorded as stale (Entry-2, M6 — as data rather than tokens on a
 *        WeakMap).
 *   R5 — Every state change renders. A card's view or channel changing
 *        always emits `render` for it; the Actuator's idempotence is what
 *        makes that cheap, and it is what keeps "what Core believes" and
 *        "what the page shows" from drifting.
 *   R6 — Unknown shape is a state (B4). A card the table could not place is
 *        still a card — masked, like every other — and the miss is counted.
 */

import type { MetaData, ViewState } from "@censor/lib/content/fsm"
import {
  applyClick,
  applyDblClick,
  applySkipToTitle,
  applyWhitelist,
  project,
} from "@censor/lib/content/fsm"
import type { ChannelId } from "@censor/types/ids"
import { assertNever } from "@some-extension/common"

import type { Action, CoreFact } from "./actions"
import { WHITELIST_REVEAL_DELAY_MS } from "./actions"
import type { CoreEvent } from "./events"
import type { CardKey } from "./keys"
import { keyVideoId } from "./keys"
import type { Observation } from "./observation"
import { mergeObservation } from "./observation"
import type { CardState, CoreState } from "./state"
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

function metaOf(o: Observation): MetaData {
  return {
    channelName: o.channelName,
    duration: o.duration,
    uploadDate: o.uploadDate,
  }
}

/** The render for a card's current view. */
function render(card: CardState): Action {
  return { kind: "render", key: card.key, model: project(card.view) }
}

function stateFact(card: CardState): Action {
  return record({
    kind: "entry.state",
    videoId: keyVideoId(card.key),
    state: card.view.kind,
  })
}

/**
 * Move a card to a new view: bump its version, render, record — and, when
 * the new view is a title with text, ask for the transform; when it is
 * whitelisted, schedule the reveal.
 */
function transition(state: CoreState, card: CardState, view: ViewState): Step {
  if (view === card.view) return none(state)
  const next: CardState = { ...card, view, version: card.version + 1 }
  const actions: Array<Action> = [render(next), stateFact(next)]
  if (view.kind === "title" && view.title.text !== "") {
    actions.push({
      kind: "transform-title",
      key: next.key,
      version: next.version,
      text: view.title.text,
      channelId: channelIdOf(next),
    })
  }
  if (view.kind === "whitelisted") {
    actions.push({
      kind: "schedule",
      key: next.key,
      version: next.version,
      delayMs: WHITELIST_REVEAL_DELAY_MS,
    })
  }
  return { state: setCard(state, next), actions }
}

function channelIdOf(card: CardState): ChannelId | null {
  return card.channel.kind === "unknown" ? null : card.channel.channelId
}

/**
 * Whitelist a card locally — the fan-out `_whitelistChannelLocally` used to
 * do — from any view (parity with `applyWhitelist`; #1385 narrows this).
 */
function whitelistLocally(state: CoreState, channelId: ChannelId): Step {
  let current = state
  const actions: Array<Action> = []
  for (const card of state.cards.values()) {
    if (channelIdOf(card) !== channelId) continue
    const known: CardState = {
      ...card,
      channel: { kind: "known", channelId, whitelisted: true },
    }
    const step = transition(
      setCard(current, known),
      known,
      applyWhitelist(card.view)
    )
    current = step.state
    actions.push(...step.actions)
  }
  return { state: current, actions }
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
          unknownShapes: EMPTY_UNKNOWN_SHAPES,
        },
        actions: [record({ kind: "session.start", session: event.session })],
      }
    }

    case "stop": {
      if (state.phase !== "running") return none(state)
      const cleared = clearCards(state)
      return {
        state: { ...cleared.state, phase: "idle" },
        actions: [
          record({ kind: "session.reset", session: state.session }),
          ...cleared.actions,
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
          unknownShapes: EMPTY_UNKNOWN_SHAPES,
        },
        actions: [
          record({ kind: "navigation" }),
          record({ kind: "session.reset", session: state.session }),
          ...cleared.actions,
          record({ kind: "session.start", session: event.session }),
        ],
      }
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

    // ── Inputs ─────────────────────────────────────────────────────────────
    case "gesture": {
      if (state.phase !== "running") return none(state)
      const card = state.cards.get(event.key)
      if (card === undefined) return none(state)
      if (event.gesture === "dblclick") {
        return transition(state, card, applyDblClick(card.view))
      }
      return transition(state, card, clickView(card))
    }

    case "whitelist-request": {
      if (state.phase !== "running") return none(state)
      const card = state.cards.get(event.key)
      if (card === undefined) return none(state)
      const channelId = channelIdOf(card)
      // A provisional card has no channel to persist; the request is a
      // no-op rather than a write of the empty sentinel (record.ts V2).
      if (channelId === null) return none(state)
      const local = whitelistLocally(state, channelId)
      return {
        state: local.state,
        actions: [
          {
            kind: "persist-whitelist",
            channelId,
            channelName: card.observation.channelName ?? channelId,
          },
          ...local.actions,
        ],
      }
    }

    case "whitelist-broadcast": {
      if (state.phase !== "running") return none(state)
      return whitelistLocally(state, event.channelId)
    }

    case "whitelist-answer": {
      if (state.phase !== "running") return none(state)
      const card = state.cards.get(event.key)
      if (card === undefined) return none(state)
      // Only the answer to the question still open counts: a card whose
      // channel moved on (recycled to another video's channel, or already
      // answered) treats a late reply as stale (R4).
      if (
        card.channel.kind !== "pending" ||
        card.channel.channelId !== event.channelId
      ) {
        return {
          state,
          actions: [
            record({ kind: "stale.discarded", videoId: keyVideoId(card.key) }),
          ],
        }
      }
      const known: CardState = {
        ...card,
        channel: {
          kind: "known",
          channelId: event.channelId,
          whitelisted: event.whitelisted,
        },
      }
      // A late whitelist must not yank a card the user has already begun
      // progressing (Entry-4): only a still-masked card becomes whitelisted.
      if (event.whitelisted && card.view.kind === "masked") {
        return transition(
          setCard(state, known),
          known,
          applyWhitelist(card.view)
        )
      }
      return { state: setCard(state, known), actions: [render(known)] }
    }

    case "title-transformed": {
      if (state.phase !== "running") return none(state)
      const card = state.cards.get(event.key)
      if (card === undefined) return none(state)
      if (card.version !== event.version || card.view.kind !== "title") {
        return {
          state,
          actions: [
            record({ kind: "stale.discarded", videoId: keyVideoId(card.key) }),
          ],
        }
      }
      const view: ViewState = {
        ...card.view,
        title: { text: event.text, translated: true },
      }
      // Same version on purpose: the transform completes the title step, it
      // is not a step of its own, so a reveal timer issued under this version
      // stays valid.
      const next: CardState = { ...card, view }
      return { state: setCard(state, next), actions: [render(next)] }
    }

    case "timer": {
      if (state.phase !== "running") return none(state)
      const card = state.cards.get(event.key)
      if (card === undefined) return none(state)
      if (card.version !== event.version || card.view.kind !== "whitelisted") {
        return none(state)
      }
      return transition(state, card, {
        kind: "revealed",
        session: card.view.session,
      })
    }

    case "command": {
      if (state.phase !== "running") return none(state)
      return advanceAll(state)
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
    view: { kind: "masked", session: state.session },
    channel:
      observation.channelId === null
        ? { kind: "unknown" }
        : { kind: "pending", channelId: observation.channelId, since: t },
    version: 0,
    firstSeenAt: t,
    lastSeenAt: t,
  }
  const videoId = keyVideoId(key)
  const actions: Array<Action> = [
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
  ]
  if (observation.channelId !== null) {
    actions.push({
      kind: "query-whitelist",
      key,
      channelId: observation.channelId,
    })
  }
  let next = setCard(state, card)
  if (observation.shape === "unknown") {
    next = {
      ...next,
      unknownShapes: {
        ...next.unknownShapes,
        degraded: next.unknownShapes.degraded + 1,
      },
    }
    actions.push(
      record({
        kind: "shape.unknown",
        tag: observation.renderer,
        surface: observation.surface,
        reason: "degraded",
        shape: "unknown",
      })
    )
  }
  return { state: next, actions }
}

function reobserve(
  state: CoreState,
  card: CardState,
  observation: Observation,
  t: number
): Step {
  const merged = mergeObservation(card.observation, observation)
  let next: CardState = { ...card, observation: merged, lastSeenAt: t }
  const actions: Array<Action> = []
  const videoId = keyVideoId(card.key)

  // A channel arriving late upgrades a provisional card (Entry-4): ask the
  // background about it now, once.
  if (card.channel.kind === "unknown" && merged.channelId !== null) {
    next = {
      ...next,
      channel: { kind: "pending", channelId: merged.channelId, since: t },
    }
    actions.push(
      { kind: "query-whitelist", key: card.key, channelId: merged.channelId },
      record({ kind: "channel.backfilled", videoId })
    )
  }

  // R5: re-render on every observation. The view's meta/title are snapshots
  // taken at click time (parity with VideoEntry), so a re-observation does
  // not rewrite them; the render is for custody — a re-observed card may
  // have gained or lost elements, and the Actuator re-derives targets.
  actions.push(render(next))
  return { state: setCard(state, next), actions }
}

function clickView(card: CardState): ViewState {
  const { view } = card
  const { kind } = view
  switch (kind) {
    case "masked": {
      return applyClick(view, metaOf(card.observation))
    }
    case "meta": {
      return applyClick(view, card.observation.title ?? "")
    }
    case "title":
    case "revealed":
    case "whitelisted": {
      return view
    }
    default: {
      kind satisfies never
      return assertNever(kind)
    }
  }
}

/**
 * Advance every masked or meta card to title — pointwise the same transition
 * a single card takes, so the command cannot express anything one card could
 * not (#1385's bulk-equivalence requirement, met by construction).
 */
function advanceAll(state: CoreState): Step {
  let current = state
  const actions: Array<Action> = []
  let advanced = 0
  let alreadyPast = 0
  let channelPending = 0
  for (const card of state.cards.values()) {
    const { kind } = card.view
    if (kind === "masked" || kind === "meta") {
      const view = applySkipToTitle(
        card.view,
        metaOf(card.observation),
        card.observation.title ?? ""
      )
      const step = transition(current, card, view)
      current = step.state
      actions.push(...step.actions)
      advanced += 1
    } else {
      alreadyPast += 1
    }
    if (card.channel.kind === "pending") channelPending += 1
  }
  actions.push(
    record({ kind: "bulk.advance", advanced, alreadyPast, channelPending })
  )
  return { state: current, actions }
}
