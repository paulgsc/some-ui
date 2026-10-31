/**
 * The phone session as one state machine: `step(state, event)` returns the
 * next state and the effects to run, and does nothing else. No React, no
 * microphone, no storage: `./runtime` runs the effects and feeds their
 * results back as events, and the screens render a state and turn taps into
 * events (docs/monorepo-boundaries.md, "Inside a React package").
 *
 * Rules that hold by structure (the owner, #2235):
 *
 * - **No finished state.** The screens are the menu, a card and the tutor's
 *   page, and none of them is an end. Next always has a card (`nextCard`),
 *   and nothing here measures how long anything took.
 * - **Nothing blocks.** Every card offers Next, a read or variant card also
 *   offers rustc's result at once, and no step waits on a choice, a voice
 *   note or the network.
 * - **Leaving a card logs it.** Next, or a new pick from the menu, appends
 *   the card's event; the card on screen is kept as the place, so leaving
 *   the app at any card and coming back lands on it with nothing lost.
 * - **A voice note is never lost to moving on.** A card left while its note
 *   is still being kept is logged once the note lands (`pending`), or as it
 *   is when the take ends with none.
 * - **rustc's result is never compared with the pick on screen.** The
 *   tutor's guess is checked only to log `tutorGuessedWrong`.
 */
import type {
  CardEvent,
  CardRef,
  Round,
  RoundLog,
} from "@rust-rounds/lib/formats"
import { expectMatches } from "@rust-rounds/lib/formats"
import { intakeReply } from "@rust-rounds/lib/intake"
import { copyForTutor } from "@rust-rounds/lib/tutor-copy"
import { assertNever } from "@some-ui/core-utils"

import type { Held } from "./held"
import {
  findingsNow,
  locate,
  nextCard,
  notesNow,
  playable,
  runOf,
} from "./held"
import type { LogAdd, SessionHead } from "./log"
import { appendToLog } from "./log"
import type { Opened, Place, Visit } from "./store"

/** A voice take as the screen shows it. */
type TakeView =
  | { readonly kind: "idle" }
  | { readonly kind: "opening" }
  | { readonly kind: "recording" }
  | { readonly kind: "keeping" }

/** How the last take ended. */
export type TakeEnd = "kept" | "short" | "full" | "failed"

/** The microphone's voice notes, as the session reads them. */
export type NoteView = {
  readonly take: TakeView
  /** The last voice note kept on this phone, whatever card it was said on. */
  readonly kept: { readonly id: string } | null
  /** How the last take ended; null once something since made it moot. */
  readonly ended: TakeEnd | null
  /** Why the last take could not start (the microphone refused), in the person's words. */
  readonly blocked: string | null
  /** No room on the phone for another note: none can start. */
  readonly full: boolean
}

export const QUIET_NOTES: NoteView = {
  take: { kind: "idle" },
  kept: null,
  ended: null,
  blocked: null,
  full: false,
}

/** What became of a pasted reply. */
type ReplyAnswer =
  | { readonly kind: "empty" }
  | { readonly kind: "taken"; readonly concept: string; readonly cards: number }
  | { readonly kind: "already-here" }
  | { readonly kind: "refused"; readonly fixRequest: string }

type CopyState =
  | { readonly kind: "idle" }
  | { readonly kind: "copying"; readonly seq: number }
  | { readonly kind: "copied"; readonly seq: number }
  /** The clipboard refused: the text stays on screen to select by hand. */
  | { readonly kind: "failed"; readonly seq: number; readonly text: string }

type Screen =
  | { readonly kind: "menu" }
  | { readonly kind: "card" }
  | {
      readonly kind: "tutor"
      readonly reply: string
      readonly answer: ReplyAnswer | null
    }

export type PlayState = {
  readonly screen: Screen
  readonly held: Held
  readonly log: RoundLog
  readonly head: SessionHead
  /** The card on screen, not logged yet; the menu's Continue returns to it. */
  readonly place: Place | null
  readonly notes: NoteView
  /** The card (`lineOf`) a take under way was started on. */
  readonly taking: string | null
  /** Cards left while their voice note was still being kept. */
  readonly pending: ReadonlyArray<{
    readonly line: string
    readonly add: LogAdd
  }>
  readonly copy: CopyState
  /** The phone refused to keep the last change. */
  readonly notKept: boolean
}

/** What the person does. */
export type PlayIntent =
  | { readonly type: "continue" }
  | { readonly type: "play"; readonly concept: string | null }
  | { readonly type: "pick"; readonly pick: string }
  | { readonly type: "holdToSpeak" }
  | { readonly type: "letGo" }
  | { readonly type: "showRustc" }
  | { readonly type: "next" }
  | { readonly type: "pin" }
  | { readonly type: "menu" }
  | { readonly type: "tutor" }
  | { readonly type: "copyLog" }
  | { readonly type: "reply"; readonly text: string }
  | { readonly type: "takeReply" }
  | { readonly type: "copyFix" }

/** What the microphone, the clipboard, the page and the store report. */
type PlaySignal =
  | { readonly type: "notes"; readonly view: NoteView }
  | { readonly type: "copied"; readonly seq: number }
  | { readonly type: "copyFailed"; readonly seq: number; readonly text: string }
  | { readonly type: "hidden" }
  | { readonly type: "left" }
  | { readonly type: "stored"; readonly ok: boolean }

/** An intent, stamped with when it happened (ISO 8601) by the runtime. */
export type PlayEvent = (PlayIntent & { readonly at: string }) | PlaySignal

export type PlayEffect =
  | {
      readonly type: "append"
      readonly head: SessionHead
      readonly add: LogAdd
    }
  | { readonly type: "hold"; readonly held: Held }
  | { readonly type: "savePlace"; readonly place: Place }
  | { readonly type: "startNote"; readonly line: string }
  | { readonly type: "stopNote" }
  | { readonly type: "resetNote" }
  | { readonly type: "copy"; readonly seq: number; readonly text: string }

export type Step = {
  readonly state: PlayState
  readonly effects: ReadonlyArray<PlayEffect>
}

/** A card's name in the microphone's list: what a take was said on. */
export const lineOf = (ref: CardRef): string =>
  `rust-rounds:${ref.round}/${ref.card}`

/**
 * The session as it opens: on the card left last, if there is one, so
 * coming back lands on it; otherwise on the menu.
 */
export function initialState(
  opened: Opened,
  head: SessionHead,
  notes: NoteView
): PlayState {
  const place =
    opened.place !== null &&
    locate(playable(opened.held), opened.place.visit) !== null
      ? opened.place
      : null
  return {
    screen: { kind: place === null ? "menu" : "card" },
    held: opened.held,
    log: opened.log,
    head,
    place,
    notes,
    taking: null,
    pending: [],
    copy: { kind: "idle" },
    notKept: false,
  }
}

const stay = (state: PlayState): Step => ({ state, effects: [] })

/** The card on screen with its round, while the screen shows one. */
function onScreen(state: PlayState): {
  place: Place
  round: Round
  card: Round["cards"][number]
} | null {
  if (state.screen.kind !== "card" || state.place === null) return null
  const located = locate(playable(state.held), state.place.visit)
  return located === null
    ? null
    : { place: state.place, round: located.round, card: located.card }
}

function withVisit(state: PlayState, place: Place, visit: Visit): Step {
  const next = { ...place, visit }
  return {
    state: { ...state, place: next },
    effects: [{ type: "savePlace", place: next }],
  }
}

/** The event that logs leaving `place`'s card at `at`. */
function leaving(held: Held, place: Place, at: string): LogAdd | null {
  const located = locate(playable(held), place.visit)
  if (located === null) return null
  const { card } = located
  const { visit } = place
  const ref = { round: visit.round, card: visit.card }
  const run = card.kind === "refine" ? null : runOf(held, ref)
  const event: CardEvent = {
    ...ref,
    at,
    picked: visit.picked,
    note: visit.note,
    refines: card.kind === "refine" ? card.note : null,
    skipped: card.kind !== "refine" && !visit.shown,
    rustc: run,
  }
  return {
    kind: "card",
    event,
    guessedWrong:
      card.kind !== "refine" &&
      run !== null &&
      !expectMatches(card.expect, run),
  }
}

/**
 * Leaves the card on screen, if any: logs it now, or once its voice note
 * lands when a take on it is still under way.
 */
function leave(state: PlayState, at: string): Step {
  if (state.place === null) return stay(state)
  const add = leaving(state.held, state.place, at)
  const cleared = { ...state, place: null }
  if (add === null) return stay(cleared)
  const line = lineOf(state.place.visit)
  if (state.taking === line) {
    return {
      state: { ...cleared, pending: [...state.pending, { line, add }] },
      effects: [{ type: "stopNote" }],
    }
  }
  return {
    state: { ...cleared, log: appendToLog(state.log, state.head, add) },
    effects: [{ type: "append", head: state.head, add }],
  }
}

/** Puts `ref` on screen, fresh. */
function enter(state: PlayState, ref: CardRef, menu: string | null): Step {
  const located = locate(playable(state.held), ref)
  if (located === null) return stay({ ...state, screen: { kind: "menu" } })
  const place: Place = {
    visit: {
      ...ref,
      stage: located.card.kind === "refine" ? "speak" : "choose",
      picked: null,
      note: null,
      shown: false,
      pinned: false,
    },
    menu,
    title: { concept: located.round.concept, number: located.number },
  }
  return {
    state: { ...state, screen: { kind: "card" }, place },
    effects: [{ type: "savePlace", place }, { type: "resetNote" }],
  }
}

/** Leaves the card on screen and puts the next one in `menu`'s concept up. */
function moveOn(state: PlayState, at: string, menu: string | null): Step {
  const current = state.place?.visit ?? null
  const left = leave(state, at)
  const ref = nextCard(
    playable(left.state.held),
    left.state.log,
    menu,
    current === null ? null : { round: current.round, card: current.card }
  )
  if (ref === null) {
    return {
      state: { ...left.state, screen: { kind: "menu" } },
      effects: left.effects,
    }
  }
  const entered = enter(left.state, ref, menu)
  return {
    state: entered.state,
    effects: [...left.effects, ...entered.effects],
  }
}

/** A voice note landed, or a take ended with none: settle what waited on it. */
function settle(state: PlayState, line: string, note: string | null): Step {
  const waiting = state.pending.find((each) => each.line === line)
  if (waiting !== undefined) {
    const add: LogAdd =
      waiting.add.kind === "card"
        ? { ...waiting.add, event: { ...waiting.add.event, note } }
        : waiting.add
    return {
      state: {
        ...state,
        taking: null,
        pending: state.pending.filter((each) => each !== waiting),
        log: appendToLog(state.log, state.head, add),
      },
      effects: [{ type: "append", head: state.head, add }],
    }
  }
  const settled = { ...state, taking: null }
  const place = state.place
  if (note === null || place === null || lineOf(place.visit) !== line) {
    return stay(settled)
  }
  return withVisit(settled, place, { ...place.visit, note })
}

function onNotes(state: PlayState, view: NoteView): Step {
  const before = state.notes.kept?.id ?? null
  const landed =
    view.kept !== null && view.kept.id !== before ? view.kept : null
  const next = { ...state, notes: view }
  if (next.taking === null) return stay(next)
  if (landed !== null) return settle(next, next.taking, landed.id)
  if (view.take.kind === "idle") return settle(next, next.taking, null)
  return stay(next)
}

function takeReply(state: PlayState, reply: string): Step {
  const answer = (value: ReplyAnswer): PlayState => ({
    ...state,
    screen: { kind: "tutor", reply, answer: value },
  })
  if (reply.trim() === "") return stay(answer({ kind: "empty" }))
  const taken = intakeReply(reply, state.log)
  if (!taken.ok) {
    return stay(answer({ kind: "refused", fixRequest: taken.fixRequest }))
  }
  if (playable(state.held).some((round) => round.id === taken.round.id)) {
    return stay(answer({ kind: "already-here" }))
  }
  const held: Held = {
    ...state.held,
    rounds: [...state.held.rounds, taken.round],
    notes:
      taken.notes === null
        ? state.held.notes
        : [...state.held.notes, taken.notes],
    notesMissing: taken.notes === null,
  }
  return {
    state: {
      ...state,
      held,
      screen: {
        kind: "tutor",
        reply: "",
        answer: {
          kind: "taken",
          concept: taken.round.concept,
          cards: taken.round.cards.length,
        },
      },
    },
    effects: [{ type: "hold", held }],
  }
}

function copying(state: PlayState, text: string): Step {
  const seq = state.copy.kind === "idle" ? 1 : state.copy.seq + 1
  return {
    state: { ...state, copy: { kind: "copying", seq } },
    effects: [{ type: "copy", seq, text }],
  }
}

function onIntent(state: PlayState, event: PlayIntent & { at: string }): Step {
  switch (event.type) {
    case "continue": {
      return state.place === null
        ? moveOn(state, event.at, null)
        : stay({ ...state, screen: { kind: "card" } })
    }
    case "play": {
      return moveOn(state, event.at, event.concept)
    }
    case "pick": {
      const shown = onScreen(state)
      if (shown === null || shown.card.kind === "refine") return stay(state)
      const { visit } = shown.place
      if (visit.stage !== "choose") return stay(state)
      if (!shown.card.choices.some((choice) => choice.pick === event.pick)) {
        return stay(state)
      }
      return withVisit(state, shown.place, {
        ...visit,
        stage: "speak",
        picked: event.pick,
      })
    }
    case "holdToSpeak": {
      const shown = onScreen(state)
      if (shown?.place.visit.stage !== "speak") return stay(state)
      if (shown.place.visit.note !== null || state.taking !== null) {
        return stay(state)
      }
      if (state.notes.take.kind !== "idle" || state.notes.full) {
        return stay(state)
      }
      const line = lineOf(shown.place.visit)
      return {
        state: { ...state, taking: line },
        effects: [{ type: "startNote", line }],
      }
    }
    case "letGo": {
      return state.taking === null
        ? stay(state)
        : { state, effects: [{ type: "stopNote" }] }
    }
    case "showRustc": {
      const shown = onScreen(state)
      if (shown === null || shown.card.kind === "refine") return stay(state)
      const { visit } = shown.place
      if (visit.stage === "see") return stay(state)
      const step = withVisit(state, shown.place, {
        ...visit,
        stage: "see",
        shown: true,
      })
      return state.taking === lineOf(visit)
        ? { ...step, effects: [{ type: "stopNote" }, ...step.effects] }
        : step
    }
    case "next": {
      if (state.screen.kind !== "card") return stay(state)
      return moveOn(state, event.at, state.place?.menu ?? null)
    }
    case "pin": {
      const shown = onScreen(state)
      if (shown === null || shown.place.visit.pinned) return stay(state)
      const { visit } = shown.place
      const add: LogAdd = {
        kind: "pin",
        ref: { round: visit.round, card: visit.card },
      }
      const step = withVisit(state, shown.place, { ...visit, pinned: true })
      return {
        state: {
          ...step.state,
          log: appendToLog(step.state.log, state.head, add),
        },
        effects: [{ type: "append", head: state.head, add }, ...step.effects],
      }
    }
    case "menu": {
      return stay({ ...state, screen: { kind: "menu" } })
    }
    case "tutor": {
      return stay({
        ...state,
        screen: { kind: "tutor", reply: "", answer: null },
        copy: { kind: "idle" },
      })
    }
    case "copyLog": {
      if (state.screen.kind !== "tutor") return stay(state)
      return copying(
        state,
        copyForTutor({
          log: state.log,
          rounds: playable(state.held),
          notes: notesNow(state.held),
          // What home transcribed reaches the phone with RR6 (#2237).
          transcripts: new Map(),
          findings: findingsNow(state.held, state.log),
        })
      )
    }
    case "reply": {
      if (state.screen.kind !== "tutor") return stay(state)
      return stay({
        ...state,
        screen: { kind: "tutor", reply: event.text, answer: null },
      })
    }
    case "takeReply": {
      return state.screen.kind === "tutor"
        ? takeReply(state, state.screen.reply)
        : stay(state)
    }
    case "copyFix": {
      const { screen } = state
      if (screen.kind !== "tutor" || screen.answer?.kind !== "refused") {
        return stay(state)
      }
      return copying(state, screen.answer.fixRequest)
    }
    default: {
      return assertNever(event)
    }
  }
}

const SIGNALS: ReadonlySet<string> = new Set<PlaySignal["type"]>([
  "notes",
  "copied",
  "copyFailed",
  "hidden",
  "left",
  "stored",
])

const isSignal = (event: PlayEvent): event is PlaySignal =>
  SIGNALS.has(event.type)

export function step(state: PlayState, event: PlayEvent): Step {
  if (!isSignal(event)) return onIntent(state, event)
  switch (event.type) {
    case "notes": {
      return onNotes(state, event.view)
    }
    case "copied": {
      return state.copy.kind === "copying" && state.copy.seq === event.seq
        ? stay({ ...state, copy: { kind: "copied", seq: event.seq } })
        : stay(state)
    }
    case "copyFailed": {
      return state.copy.kind === "copying" && state.copy.seq === event.seq
        ? stay({
            ...state,
            copy: { kind: "failed", seq: event.seq, text: event.text },
          })
        : stay(state)
    }
    case "hidden": {
      return state.taking === null
        ? stay(state)
        : { state, effects: [{ type: "stopNote" }] }
    }
    case "left": {
      // The page is gone: a card still waiting on its note is logged as it
      // stands, and a take under way is ended and kept by the microphone.
      const effects: Array<PlayEffect> = state.pending.map(({ add }) => ({
        type: "append",
        head: state.head,
        add,
      }))
      if (state.taking !== null) effects.push({ type: "stopNote" })
      return {
        state: {
          ...state,
          log: state.pending.reduce(
            (log, { add }) => appendToLog(log, state.head, add),
            state.log
          ),
          pending: [],
          taking: null,
        },
        effects,
      }
    }
    case "stored": {
      return state.notKept === !event.ok
        ? stay(state)
        : stay({ ...state, notKept: !event.ok })
    }
    default: {
      return assertNever(event)
    }
  }
}
