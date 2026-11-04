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
 * - **Nothing blocks.** Every card offers Next, a read or variant card shows
 *   rustc's result from the start, and no step waits on a voice note or the
 *   network. There is nothing to pick (TALK5, #2550): a card asks the owner
 *   to talk about what rustc did, at any moment on it.
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
 * - **An error from the desk is pasted from any card** (RR4c): its step is a
 *   screen of the machine (`desk`), kept with the place as it is typed, with
 *   an optional voice note on the take pattern, as a card's is. Back to the
 *   card logs it (`fromMyDesk`) when anything was pasted, once its note has
 *   landed if a take on it was under way (`deskPending`, kept with the place
 *   as `pending` is). Nothing on the step waits: Back is always there.
 * - **rustc's result is never compared with anything the owner said.** The
 *   tutor's guess is checked only to log `tutorGuessedWrong`.
 * - **A card's kept note is the card's note**, on the take pattern
 *   (`@some-ui/voice-capture`). A Redo's note, once kept, is the card's
 *   note, a card left mid-Redo's included, and the earlier one stays on the
 *   phone (D2); one not kept leaves the card the note it had. Let go sets
 *   the card's note aside, kept (D3), and the card has none. The pattern's
 *   snapshot (`notes`) is the only record of a take under way; `taking` is
 *   what the place record keeps of it for the next opening.
 */
import type {
  CardEvent,
  CardRef,
  Round,
  RoundLog,
} from "@rust-rounds/lib/formats"
import { expectMatches, SLUG } from "@rust-rounds/lib/formats"
import { intakeReply } from "@rust-rounds/lib/intake"
import { copyForTutor } from "@rust-rounds/lib/tutor-copy"
import { assertNever } from "@some-ui/core-utils"
import type {
  TakeEnded,
  TakeEnding,
  TakePatternSnapshot,
  TakePlace,
} from "@some-ui/voice-capture"

import type { Held } from "./held"
import {
  findingsNow,
  locate,
  mergeHeld,
  nextCard,
  notesNow,
  playable,
  runOf,
} from "./held"
import type { LogAdd, SessionHead } from "./log"
import { appendToLog, holdsAdd } from "./log"
import type {
  Again,
  DeskDraft,
  DeskPending,
  Opened,
  Pending,
  Place,
  Taking,
  Title,
  Visit,
} from "./store"

/**
 * How a take ended, as the take pattern says (`TakeEnding`); or, for a take
 * an earlier opening left, that the phone holds no note from it (`missing`).
 */
type TakeEnd = TakeEnding | "missing"

/**
 * What the card on screen says of its note, until the next card: how its
 * last take ended, in the pattern's words (none in silence, VC2), that the
 * phone holds no note from a take an earlier opening left, or that its note
 * was set aside (D3).
 */
type NoteSaid =
  | { readonly kind: "ended"; readonly ended: TakeEnded }
  | { readonly kind: "missing" }
  | { readonly kind: "setAside"; readonly place: TakePlace }

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
  /** Pasting an error from the desk, from the card on screen (`desk`). */
  | { readonly kind: "desk" }
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
  /** The take pattern's snapshot: the take under way, the last one to end, what plays. */
  readonly notes: TakePatternSnapshot
  /** The take under way: the card it was started on, and when. */
  readonly taking: Taking | null
  /** Cards left while their voice note was still being kept. */
  readonly pending: ReadonlyArray<Pending>
  /** The error being pasted from the desk; null while the step is closed. */
  readonly desk: DeskDraft | null
  /** Pastes left while their voice note was still being kept. */
  readonly deskPending: ReadonlyArray<DeskPending>
  /**
   * What the card on screen, or the desk step while it is open, says of its
   * note, until the next card or the step closes.
   */
  readonly said: NoteSaid | null
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
  /** D1: starts a take of the card's note, Redo included, or stops it. */
  | { readonly type: "tapNote" }
  /** Plays the card's note, or stops it while it plays. */
  | { readonly type: "playNote" }
  /**
   * On a refine card, plays the earlier note it brings back, or stops it
   * while it plays: from this phone, or from home once its audio left (RR6).
   */
  | { readonly type: "playEarlier" }
  /** D3: sets the card's note aside; `place` is where it is kept. */
  | { readonly type: "letGoNote"; readonly place: TakePlace }
  | { readonly type: "next" }
  | { readonly type: "pin" }
  | { readonly type: "menu" }
  | { readonly type: "tutor" }
  | { readonly type: "copyLog" }
  | { readonly type: "reply"; readonly text: string }
  | { readonly type: "takeReply" }
  | { readonly type: "copyFix" }
  /** Opens the desk step from the card on screen (RR4c). */
  | { readonly type: "desk" }
  /** The text in the desk step, as pasted or typed so far. */
  | { readonly type: "deskText"; readonly text: string }
  /** Starts a take of the paste's note, Redo included, or stops it. */
  | { readonly type: "deskTapNote" }
  /** Plays the paste's note, or stops it while it plays. */
  | { readonly type: "deskPlayNote" }
  /** Sets the paste's note aside; `place` is where it is kept. */
  | { readonly type: "deskLetGoNote"; readonly place: TakePlace }
  /** Back to the card: the paste is logged, if anything was pasted. */
  | { readonly type: "deskBack" }

/** What the microphone, the clipboard, the page and the store report. */
type PlaySignal =
  | { readonly type: "notes"; readonly view: TakePatternSnapshot }
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
  /** What plays, as stored after any write of it. */
  | { readonly type: "held"; readonly held: Held }

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
      readonly desk: DeskDraft | null
      readonly deskPending: ReadonlyArray<DeskPending>
    }
  /** The pattern's tap: a take on `line`, superseding `supersedes` once kept. */
  | {
      readonly type: "tapNote"
      readonly line: string
      readonly supersedes: string | null
    }
  /** A take under way is kept, and nothing plays. */
  | { readonly type: "stopNote" }
  | { readonly type: "playNote"; readonly id: string }
  | {
      readonly type: "setAsideNote"
      readonly id: string
      readonly place: TakePlace
    }
  | { readonly type: "copy"; readonly seq: number; readonly text: string }

export type Step = {
  readonly state: PlayState
  readonly effects: ReadonlyArray<PlayEffect>
}

/** A card's name in the microphone's list: what a take was said on. */
export const lineOf = (ref: CardRef): string =>
  `rust-rounds:${ref.round}/${ref.card}`

/**
 * A paste's name in the microphone's list: when its step opened. No card's
 * line can be one: a round id holds no `:`.
 */
export const deskLine = (at: string): string => `rust-rounds:desk:${at}`

const LINE = new RegExp(`^rust-rounds:(${SLUG})/(${SLUG})$`)

/** The card `lineOf` names; null for a line it never makes. */
export function cardOfLine(line: string): CardRef | null {
  const [, round, card] = LINE.exec(line) ?? []
  return round === undefined || card === undefined ? null : { round, card }
}

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
  notes: TakePatternSnapshot
): PlayState {
  const place =
    opened.place !== null &&
    locate(playable(opened.held), opened.place.visit) !== null
      ? opened.place
      : null
  // A paste left open is open again, on the card it was pasted from.
  const desk = place === null ? null : opened.desk
  return {
    screen: {
      kind: desk !== null ? "desk" : place === null ? "menu" : "card",
    },
    held: opened.held,
    log: opened.log,
    head,
    place,
    notes,
    taking: opened.taking,
    pending: opened.pending,
    desk,
    deskPending: opened.deskPending,
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
  desk: state.desk,
  deskPending: state.deskPending,
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
      // Nothing is picked, and rustc's result shows from the start (TALK5).
      picked: null,
      note: visit.note,
      refines: card.kind === "refine" ? card.note : null,
      skipped: false,
      rustc: run,
    },
    guessedWrong:
      card.kind !== "refine" &&
      run !== null &&
      !expectMatches(card.expect, run),
  }
}

/**
 * Appends a card's event, with the note it ended with: `note`, a take kept
 * since it was left, in place of the one it was left with (D2).
 */
function logCard(
  state: PlayState,
  left: { event: CardEvent; guessedWrong: boolean },
  note: string | null
): Step {
  return logAdd(state, {
    kind: "card",
    event: { ...left.event, note: note ?? left.event.note },
    guessedWrong: left.guessedWrong,
  })
}

/** Appends `add` to the log, once: neither log adds what it already holds. */
function logAdd(state: PlayState, add: LogAdd): Step {
  const log = holdsAdd(state.log, add)
    ? state.log
    : appendToLog(state.log, state.head, add)
  return {
    state: { ...state, log },
    effects: [{ type: "append", head: state.head, add }],
  }
}

/**
 * A tap on the note of `line` (a card's or a paste's), whose kept note is
 * `note`: D1, it stops that line's take, and leaves another line's to end;
 * with none under way, it starts one, a Redo of `note` when there is one.
 */
function tapNoteOn(
  state: PlayState,
  line: string,
  note: string | null,
  at: string
): Step {
  const { take, answers } = state.notes
  if (take.kind !== "idle") {
    return answers === line
      ? { state, effects: [{ type: "tapNote", line, supersedes: null }] }
      : stay(state)
  }
  // A take an earlier opening left may yet land on this line.
  if (state.taking !== null) return stay(state)
  const next: PlayState = {
    ...state,
    said: null,
    taking: { line, since: Date.parse(at) },
  }
  // Kept before the take starts, so a note that lands after the screen is
  // gone still finds its line at the next opening.
  return {
    state: next,
    effects: [savePlace(next), { type: "tapNote", line, supersedes: note }],
  }
}

/** Plays `note`, or stops it while it plays; nothing when there is none. */
const playNoteOf = (state: PlayState, note: string | null): Step =>
  note === null
    ? stay(state)
    : { state, effects: [{ type: "playNote", id: note }] }

/**
 * D3: sets `note` aside, kept at `place`; `cleared` takes it off its card or
 * paste. The row's actions wait while a take is under way.
 */
function letGoOf(
  state: PlayState,
  note: string | null,
  place: TakePlace,
  cleared: (state: PlayState) => Step
): Step {
  if (note === null || state.notes.take.kind !== "idle") return stay(state)
  const step = cleared({ ...state, said: { kind: "setAside", place } })
  return {
    state: step.state,
    effects: [...step.effects, { type: "setAsideNote", id: note, place }],
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

/** The log as it will stand once every card and paste waiting on a note is logged. */
function logWithPending(state: PlayState): RoundLog {
  const cards = state.pending.reduce(
    (log, waiting) =>
      appendToLog(log, state.head, {
        kind: "card",
        event: waiting.event,
        guessedWrong: waiting.guessedWrong,
      }),
    state.log
  )
  return state.deskPending.reduce(
    (log, waiting) =>
      appendToLog(log, state.head, { kind: "desk", paste: waiting.paste }),
    cards
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
        note: null,
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
  // waiting on it is kept with the place by then. A note playing stops.
  const stop: ReadonlyArray<PlayEffect> =
    left.stopping || state.notes.playback.kind !== "quiet"
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
 * waiting on it. The take no longer under way is kept as such. `said` is
 * what the card on screen says of it.
 */
function settle(
  state: PlayState,
  line: string,
  end: TakeEnd,
  note: string | null,
  said: NoteSaid | null
): Step {
  const settled = settleCard(state, line, end, note, said)
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
  note: string | null,
  said: NoteSaid | null
): Step {
  const base: PlayState = {
    ...state,
    taking: state.taking?.line === line ? null : state.taking,
    noRoom: end === "full" ? true : end === "kept" ? false : state.noRoom,
  }
  if (line.startsWith(deskLine("")))
    return settleDesk(base, line, end, note, said)
  const waiting = base.pending.find((each) => each.line === line)
  if (waiting !== undefined) {
    // A Redo that was not kept leaves the card the note it was left with.
    const lostIt =
      (end === "failed" || end === "full") && waiting.event.note === null
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
  const shown = { ...base, said }
  // A kept take is the card's note, a Redo's in place of the one before (D2).
  if (end !== "kept" || note === null || place.visit.note === note) {
    return stay(shown)
  }
  return withVisit(shown, place, { ...place.visit, note })
}

/**
 * A take on a paste's `line` ended: log the paste left waiting on it, with
 * the note if it was kept, or put the note on the paste being made.
 */
function settleDesk(
  base: PlayState,
  line: string,
  end: TakeEnd,
  note: string | null,
  said: NoteSaid | null
): Step {
  const waiting = base.deskPending.find((each) => each.line === line)
  if (waiting !== undefined) {
    const next: PlayState = {
      ...base,
      deskPending: base.deskPending.filter((each) => each !== waiting),
    }
    const kept = end === "kept" && note !== null
    const logged = logAdd(next, {
      kind: "desk",
      paste: kept ? { ...waiting.paste, note } : waiting.paste,
    })
    return {
      state: logged.state,
      effects: [...logged.effects, savePlace(logged.state)],
    }
  }
  const { desk } = base
  if (desk === null || deskLine(desk.at) !== line) return stay(base)
  const shown = { ...base, said: base.screen.kind === "desk" ? said : null }
  if (end !== "kept" || note === null || desk.note === note) {
    return stay(shown)
  }
  const next = { ...shown, desk: { ...desk, note } }
  return { state: next, effects: [savePlace(next)] }
}

/**
 * Back to the card from the desk step: the paste is logged when anything was
 * pasted, at once, or once its note lands when a take on it is under way.
 * Nothing pasted logs nothing.
 */
function deskBack(state: PlayState, desk: DeskDraft): Step {
  const closed: PlayState = {
    ...state,
    screen: { kind: state.place === null ? "menu" : "card" },
    desk: null,
    said: null,
  }
  const line = deskLine(desk.at)
  const taking = state.taking?.line === line ? state.taking : null
  const stop: ReadonlyArray<PlayEffect> =
    taking !== null || state.notes.playback.kind !== "quiet"
      ? [{ type: "stopNote" }]
      : []
  if (desk.pasted.trim() === "") {
    const next = { ...closed, taking: taking === null ? state.taking : null }
    return { state: next, effects: [savePlace(next), ...stop] }
  }
  if (taking !== null) {
    const next: PlayState = {
      ...closed,
      deskPending: [...state.deskPending, { ...taking, paste: desk }],
    }
    // Kept with the place before the take ends, so its note finds the paste.
    return { state: next, effects: [savePlace(next), ...stop] }
  }
  const logged = logAdd(closed, { kind: "desk", paste: desk })
  return {
    state: logged.state,
    effects: [...logged.effects, savePlace(logged.state), ...stop],
  }
}

/** What the person does on the desk step, and the tap that opens it. */
type DeskIntent = Extract<
  PlayIntent,
  {
    readonly type:
      | "desk"
      | "deskText"
      | "deskTapNote"
      | "deskPlayNote"
      | "deskLetGoNote"
      | "deskBack"
  }
>

function onDesk(state: PlayState, event: DeskIntent & { at: string }): Step {
  const { desk } = state
  if (event.type === "desk") {
    if (state.screen.kind !== "card" || state.place === null) return stay(state)
    const next: PlayState = {
      ...state,
      screen: { kind: "desk" },
      desk: { at: event.at, pasted: "", note: null },
      said: null,
    }
    return { state: next, effects: [savePlace(next)] }
  }
  if (state.screen.kind !== "desk" || desk === null) return stay(state)
  switch (event.type) {
    case "deskText": {
      const next = { ...state, desk: { ...desk, pasted: event.text } }
      return { state: next, effects: [savePlace(next)] }
    }
    case "deskTapNote": {
      return tapNoteOn(state, deskLine(desk.at), desk.note, event.at)
    }
    case "deskPlayNote": {
      return playNoteOf(state, desk.note)
    }
    case "deskLetGoNote": {
      return letGoOf(state, desk.note, event.place, (cleared) => {
        const next = { ...cleared, desk: { ...desk, note: null } }
        return { state: next, effects: [savePlace(next)] }
      })
    }
    case "deskBack": {
      return deskBack(state, desk)
    }
    default: {
      return assertNever(event)
    }
  }
}

function onNotes(state: PlayState, view: TakePatternSnapshot): Step {
  const before = state.notes.ended?.seq ?? 0
  const next = { ...state, notes: view }
  const { ended } = view
  if (ended === null || ended.seq <= before) return stay(next)
  return settle(next, ended.answers, ended.ending, ended.id, {
    kind: "ended",
    ended,
  })
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
    // A note found is shown on its card; none found is said.
    const settled =
      note === null
        ? settle(step.state, line, "missing", null, { kind: "missing" })
        : settle(step.state, line, "kept", note, null)
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
    case "desk":
    case "deskText":
    case "deskTapNote":
    case "deskPlayNote":
    case "deskLetGoNote":
    case "deskBack": {
      return onDesk(state, event)
    }
    case "continue": {
      return state.place === null
        ? moveOn(state, event.at, null)
        : stay({ ...state, screen: { kind: "card" } })
    }
    case "play": {
      return moveOn(state, event.at, event.concept)
    }
    case "tapNote": {
      const shown = onScreen(state)
      if (shown === null) return stay(state)
      const { visit } = shown.place
      return tapNoteOn(state, lineOf(visit), visit.note, event.at)
    }
    case "playNote": {
      return playNoteOf(state, onScreen(state)?.place.visit.note ?? null)
    }
    case "playEarlier": {
      const shown = onScreen(state)
      return shown?.card.kind === "refine"
        ? { state, effects: [{ type: "playNote", id: shown.card.note }] }
        : stay(state)
    }
    case "letGoNote": {
      const shown = onScreen(state)
      if (shown === null) return stay(state)
      const { visit } = shown.place
      return letGoOf(state, visit.note, event.place, (cleared) =>
        withVisit(cleared, shown.place, { ...visit, note: null })
      )
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
  "held",
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
      // opening, settles them. A note playing stops.
      return state.taking === null && state.notes.playback.kind === "quiet"
        ? stay(state)
        : { state, effects: [{ type: "stopNote" }] }
    }
    case "held": {
      // Rounds are only added, so the card on screen and every card waiting
      // on a note are still held; one with no run may now have one. What
      // this session holds and the phone did not keep stays too.
      return event.held === state.held
        ? stay(state)
        : stay({ ...state, held: mergeHeld(event.held, state.held) })
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
