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
 *   is still being kept waits in `pending`, and the take under way in
 *   `taking`, both kept with the place. The card is logged, or the note put
 *   on the card on screen, once the microphone says how the take ended; or,
 *   once the screen was left or the app ended, when the next opening finds
 *   the note on the phone. A card is logged once, however many openings
 *   settle it: neither the session's log nor the store's adds a card's event
 *   it already holds (`holdsAdd`).
 * - **A note the phone could not keep is said, within the opening that left
 *   the card.** A card left before its take ended, whose note then failed to
 *   be kept or found no room, is said, whichever card is on screen by then.
 *   One let go too soon to keep is not: letting go early is the person's own
 *   doing, and the card they left on showed it when it happened. Once that
 *   opening is gone (the screen left, the app ended), the next one logs the
 *   card as it stood and says nothing: the phone holds no note, and nothing
 *   tells a note that failed from one cut short.
 * - **A failed write is said until that record is kept.** Each record's last
 *   write is tracked apart (`notKept`), so a later write of another record
 *   cannot hide it. An addition the log refused is kept by the store and
 *   sent again with the next one, and the store says the log is kept only
 *   once every refused addition is in it, so the warning stays until then,
 *   across openings too while the place record keeps the queue
 *   (`initialState`, `flush`). If that write is refused as well and the app
 *   is killed, only the cards still in `pending` survive to the next opening.
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
import { appendToLog, holdsAdd } from "./log"
import type {
  Again,
  Opened,
  Pending,
  Place,
  Taking,
  Title,
  Visit,
} from "./store"

/** A voice take as the screen shows it. */
type TakeView =
  | { readonly kind: "idle" }
  | { readonly kind: "opening" }
  | { readonly kind: "recording" }
  | { readonly kind: "keeping" }

/**
 * How a take ended: kept, too short, no room, failed to keep, refused by
 * the microphone, or let go before it opened.
 */
export type TakeEnd = "kept" | "short" | "full" | "failed" | "blocked" | "none"

/** The microphone's voice notes, as the session reads them. */
export type NoteView = {
  readonly take: TakeView
  /**
   * The last take to end, whatever card it was said on; `seq` counts every
   * take that ends, so a new one is told from the last.
   */
  readonly ended: {
    readonly seq: number
    readonly line: string
    readonly end: TakeEnd
    /** The note kept, when `end` is `kept`. */
    readonly note: string | null
  } | null
  /** Why the microphone refused the last take, in the person's words. */
  readonly blocked: string | null
}

/** What became of a pasted reply. */
type ReplyAnswer =
  | { readonly kind: "empty" }
  | { readonly kind: "taken"; readonly concept: string; readonly cards: number }
  | { readonly kind: "already-here" }
  | { readonly kind: "refused"; readonly fixRequest: string }

/** What a copy carries: the log for a tutor, or what a tutor should fix. */
type CopyWhat = "log" | "fix"

type CopyState =
  | {
      readonly kind: "idle" | "copying" | "copied"
      readonly seq: number
      readonly what: CopyWhat
    }
  /** The clipboard refused: the text stays on screen to select by hand. */
  | {
      readonly kind: "failed"
      readonly seq: number
      readonly what: CopyWhat
      readonly text: string
    }

type Screen =
  | { readonly kind: "menu" }
  | { readonly kind: "card" }
  | {
      readonly kind: "tutor"
      readonly reply: string
      readonly answer: ReplyAnswer | null
    }

/** The records the store keeps, each said apart when the phone refused it. */
type KeptRecord = "log" | "held" | "place"

export type PlayState = {
  readonly screen: Screen
  readonly held: Held
  readonly log: RoundLog
  readonly head: SessionHead
  /** The card on screen, not logged yet; the menu's Continue returns to it. */
  readonly place: Place | null
  readonly notes: NoteView
  /** The take under way: the card it was started on, and when. */
  readonly taking: Taking | null
  /** Cards left while their voice note was still being kept. */
  readonly pending: ReadonlyArray<Pending>
  /** How the last take on the card on screen ended, until the next card. */
  readonly said: TakeEnd | null
  /** A card left whose note could not be kept, until the next card. */
  readonly lost: Title | null
  /**
   * The phone had no room for the last note; cleared by one kept, and on
   * each new card, which tries again.
   */
  readonly noRoom: boolean
  readonly copy: CopyState
  /** The records whose last write the phone refused. */
  readonly notKept: Readonly<Record<KeptRecord, boolean>>
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
  /**
   * The session opened: the note the phone holds for each card left
   * waiting on one, and whether a take is still under way.
   */
  | {
      readonly type: "reopened"
      readonly found: ReadonlyArray<{
        readonly line: string
        readonly note: string | null
      }>
      readonly busy: boolean
    }
  | { readonly type: "copied"; readonly seq: number }
  | { readonly type: "copyFailed"; readonly seq: number; readonly text: string }
  | { readonly type: "hidden" }
  | { readonly type: "left" }
  | {
      readonly type: "stored"
      readonly record: KeptRecord
      readonly ok: boolean
    }

/** An intent, stamped with when it happened (ISO 8601) by the runtime. */
export type PlayEvent = (PlayIntent & { readonly at: string }) | PlaySignal

export type PlayEffect =
  | {
      readonly type: "append"
      readonly head: SessionHead
      readonly add: LogAdd
    }
  | { readonly type: "hold"; readonly held: Held }
  | {
      readonly type: "savePlace"
      readonly place: Place | null
      readonly taking: Taking | null
      readonly pending: ReadonlyArray<Pending>
    }
  | { readonly type: "startNote"; readonly line: string }
  | { readonly type: "stopNote" }
  | { readonly type: "copy"; readonly seq: number; readonly text: string }

export type Step = {
  readonly state: PlayState
  readonly effects: ReadonlyArray<PlayEffect>
}

/** A card's name in the microphone's list: what a take was said on. */
export const lineOf = (ref: CardRef): string =>
  `rust-rounds:${ref.round}/${ref.card}`

const KEPT: Readonly<Record<KeptRecord, boolean>> = {
  log: false,
  held: false,
  place: false,
}

/**
 * The session as it opens: on the card left last, if there is one, so
 * coming back lands on it; otherwise on the menu. The take left under way,
 * and the cards still waiting on a note, are settled once the runtime has
 * asked the phone (`reopened`).
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
    taking: opened.taking,
    pending: opened.pending,
    said: null,
    lost: null,
    noRoom: false,
    copy: { kind: "idle", seq: 0, what: "log" },
    // Additions the log refused at an earlier opening are still to be written.
    notKept: { ...KEPT, log: opened.unlogged > 0 },
  }
}

const stay = (state: PlayState): Step => ({ state, effects: [] })

/** Keeps the place, the take under way and what waits on a note, as they now stand. */
const savePlace = (state: PlayState): PlayEffect => ({
  type: "savePlace",
  place: state.place,
  taking: state.taking,
  pending: state.pending,
})

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
  const next = { ...state, place: { ...place, visit } }
  return { state: next, effects: [savePlace(next)] }
}

/** The event that logs leaving `place`'s card at `at`. */
function leaving(
  held: Held,
  place: Place,
  at: string
): { event: CardEvent; guessedWrong: boolean } | null {
  const located = locate(playable(held), place.visit)
  if (located === null) return null
  const { card } = located
  const { visit } = place
  const ref = { round: visit.round, card: visit.card }
  const run = card.kind === "refine" ? null : runOf(held, ref)
  return {
    event: {
      ...ref,
      at,
      picked: visit.picked,
      note: visit.note,
      refines: card.kind === "refine" ? card.note : null,
      skipped: card.kind !== "refine" && !visit.shown,
      rustc: run,
    },
    guessedWrong:
      card.kind !== "refine" &&
      run !== null &&
      !expectMatches(card.expect, run),
  }
}

/** Appends a card's event, with the note it ended with. */
function logCard(
  state: PlayState,
  left: { event: CardEvent; guessedWrong: boolean },
  note: string | null
): Step {
  const add: LogAdd = {
    kind: "card",
    event: { ...left.event, note: left.event.note ?? note },
    guessedWrong: left.guessedWrong,
  }
  const log = holdsAdd(state.log, add)
    ? state.log
    : appendToLog(state.log, state.head, add)
  return {
    state: { ...state, log },
    effects: [{ type: "append", head: state.head, add }],
  }
}

/**
 * Leaves the card on screen, if any: logs it now, or once its voice note
 * lands when a take on it is still under way. `stopping` says that take is
 * to be ended, which the caller does last, once what waits on it is kept.
 */
function leave(
  state: PlayState,
  at: string
): Step & { readonly stopping: boolean } {
  const stays = (next: PlayState): Step & { stopping: false } => ({
    ...stay(next),
    stopping: false,
  })
  if (state.place === null) return stays(state)
  const left = leaving(state.held, state.place, at)
  const cleared = { ...state, place: null }
  if (left === null) return stays(cleared)
  const line = lineOf(state.place.visit)
  if (state.taking?.line === line) {
    const waiting: Pending = {
      line,
      since: state.taking.since,
      title: state.place.title,
      ...left,
    }
    return {
      state: { ...cleared, pending: [...state.pending, waiting] },
      effects: [],
      stopping: true,
    }
  }
  return { ...logCard(cleared, left, null), stopping: false }
}

/** The log as it will stand once every card waiting on a note is logged. */
function logWithPending(state: PlayState): RoundLog {
  return state.pending.reduce(
    (log, waiting) =>
      appendToLog(log, state.head, {
        kind: "card",
        event: waiting.event,
        guessedWrong: waiting.guessedWrong,
      }),
    state.log
  )
}

/** Puts `ref` on screen, fresh; `from` is the card it was reached from. */
function enter(
  state: PlayState,
  ref: CardRef,
  menu: string | null,
  from: CardRef | null
): Step {
  const located = locate(playable(state.held), ref)
  if (located === null) return stay({ ...state, screen: { kind: "menu" } })
  const played = logWithPending(state).sessions.some((session) =>
    session.cards.some(
      (event) => event.round === ref.round && event.card === ref.card
    )
  )
  const again: Again =
    from?.round === ref.round && from.card === ref.card
      ? "same"
      : played
        ? "played"
        : "fresh"
  const next: PlayState = {
    ...state,
    screen: { kind: "card" },
    said: null,
    lost: null,
    // Each card tries again: room may have been made since.
    noRoom: false,
    place: {
      visit: {
        ...ref,
        stage: located.card.kind === "refine" ? "speak" : "choose",
        picked: null,
        note: null,
        shown: false,
        pinned: false,
        again,
      },
      menu,
      title: { concept: located.round.concept, number: located.number },
    },
  }
  return { state: next, effects: [savePlace(next)] }
}

/** Leaves the card on screen and puts the next one in `menu`'s concept up. */
function moveOn(state: PlayState, at: string, menu: string | null): Step {
  const visit = state.place?.visit ?? null
  const current =
    visit === null ? null : { round: visit.round, card: visit.card }
  const left = leave(state, at)
  // A card waiting on its note counts as played: it is not served as new.
  const ref = nextCard(
    playable(left.state.held),
    logWithPending(left.state),
    menu,
    current
  )
  // The take is ended last: its end may be heard at once, and the card
  // waiting on it is kept with the place by then.
  const stop: ReadonlyArray<PlayEffect> = left.stopping
    ? [{ type: "stopNote" }]
    : []
  if (ref === null) {
    const next = { ...left.state, screen: { kind: "menu" } as const }
    return {
      state: next,
      effects: [...left.effects, savePlace(next), ...stop],
    }
  }
  const entered = enter(left.state, ref, menu, current)
  return {
    state: entered.state,
    effects: [...left.effects, ...entered.effects, ...stop],
  }
}

/**
 * A take on `line` ended: settle the card on screen, or the card left
 * waiting on it. The take no longer under way is kept as such.
 */
function settle(
  state: PlayState,
  line: string,
  end: TakeEnd,
  note: string | null
): Step {
  const settled = settleCard(state, line, end, note)
  const saved = settled.effects.some((effect) => effect.type === "savePlace")
  return settled.state.taking === state.taking || saved
    ? settled
    : {
        state: settled.state,
        effects: [...settled.effects, savePlace(settled.state)],
      }
}

function settleCard(
  state: PlayState,
  line: string,
  end: TakeEnd,
  note: string | null
): Step {
  const base: PlayState = {
    ...state,
    taking: state.taking?.line === line ? null : state.taking,
    noRoom: end === "full" ? true : end === "kept" ? false : state.noRoom,
  }
  const waiting = base.pending.find((each) => each.line === line)
  if (waiting !== undefined) {
    const lostIt = end === "failed" || end === "full"
    const next: PlayState = {
      ...base,
      pending: base.pending.filter((each) => each !== waiting),
      lost: lostIt ? waiting.title : base.lost,
    }
    const logged = logCard(next, waiting, end === "kept" ? note : null)
    return {
      state: logged.state,
      effects: [...logged.effects, savePlace(logged.state)],
    }
  }
  const { place } = base
  if (place === null || lineOf(place.visit) !== line) return stay(base)
  const shown = { ...base, said: end }
  if (end !== "kept" || note === null || place.visit.note !== null) {
    return stay(shown)
  }
  return withVisit(shown, place, { ...place.visit, note })
}

function onNotes(state: PlayState, view: NoteView): Step {
  const before = state.notes.ended?.seq ?? 0
  const next = { ...state, notes: view }
  const { ended } = view
  if (ended === null || ended.seq <= before) return stay(next)
  return settle(next, ended.line, ended.end, ended.note)
}

/** Settles the cards a session ended while they waited on a note. */
function onReopened(
  state: PlayState,
  found: ReadonlyArray<{ line: string; note: string | null }>,
  busy: boolean
): Step {
  let step = stay(state)
  for (const { line, note } of found) {
    // A take still under way may yet land; its end settles it then.
    if (note === null && busy) continue
    const settled = settle(
      step.state,
      line,
      note === null ? "none" : "kept",
      note
    )
    step = {
      state: settled.state,
      effects: [...step.effects, ...settled.effects],
    }
  }
  return step
}

function takeReply(state: PlayState, reply: string): Step {
  const answer = (value: ReplyAnswer): PlayState => ({
    ...state,
    screen: { kind: "tutor", reply, answer: value },
  })
  if (reply.trim() === "") return stay(answer({ kind: "empty" }))
  const taken = intakeReply(reply, state.log, playable(state.held))
  if (!taken.ok) {
    return stay(answer({ kind: "refused", fixRequest: taken.fixRequest }))
  }
  if (taken.alreadyHeld) return stay(answer({ kind: "already-here" }))
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

function copying(state: PlayState, what: CopyWhat, text: string): Step {
  const seq = state.copy.seq + 1
  return {
    state: { ...state, copy: { kind: "copying", seq, what } },
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
      if (state.notes.take.kind !== "idle") return stay(state)
      const line = lineOf(shown.place.visit)
      const next: PlayState = {
        ...state,
        said: null,
        taking: { line, since: Date.parse(event.at) },
      }
      // Kept before the take starts, so a note that lands after the screen
      // is gone still finds this card at the next opening.
      return {
        state: next,
        effects: [savePlace(next), { type: "startNote", line }],
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
      // The take is ended last, once the card as it now stands is kept.
      return state.taking?.line === lineOf(visit)
        ? { ...step, effects: [...step.effects, { type: "stopNote" }] }
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
        // A copy still under way can only land as stale: its seq is behind.
        copy: { kind: "idle", seq: state.copy.seq, what: "log" },
      })
    }
    case "copyLog": {
      if (state.screen.kind !== "tutor") return stay(state)
      // With the cards still waiting on their note, as they stand: a card
      // just left is in the copy, without the note that has not landed yet.
      const log = logWithPending(state)
      return copying(
        state,
        "log",
        copyForTutor({
          log,
          rounds: playable(state.held),
          notes: notesNow(state.held),
          // What home transcribed reaches the phone with RR6 (#2237).
          transcripts: new Map(),
          findings: findingsNow(state.held, log),
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
      return copying(state, "fix", screen.answer.fixRequest)
    }
    default: {
      return assertNever(event)
    }
  }
}

const SIGNALS: ReadonlySet<string> = new Set<PlaySignal["type"]>([
  "notes",
  "reopened",
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
    case "reopened": {
      return onReopened(state, event.found, event.busy)
    }
    case "copied": {
      const { copy } = state
      return copy.kind === "copying" && copy.seq === event.seq
        ? stay({ ...state, copy: { ...copy, kind: "copied" } })
        : stay(state)
    }
    case "copyFailed": {
      const { copy } = state
      return copy.kind === "copying" && copy.seq === event.seq
        ? stay({
            ...state,
            copy: { ...copy, kind: "failed", text: event.text },
          })
        : stay(state)
    }
    case "hidden":
    case "left": {
      // A take under way is ended and kept by the microphone. It, and a card
      // waiting on it, stay kept with the place until its end, or the next
      // opening, settles them.
      return state.taking === null
        ? stay(state)
        : { state, effects: [{ type: "stopNote" }] }
    }
    case "stored": {
      const failed = !event.ok
      return state.notKept[event.record] === failed
        ? stay(state)
        : stay({
            ...state,
            notKept: { ...state.notKept, [event.record]: failed },
          })
    }
    default: {
      return assertNever(event)
    }
  }
}
