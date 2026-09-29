/**
 * The read-aloud set: a pure reducer that runs each rep's ladder, returns
 * what the learner reports stuck, and says what to count (adaptive-learning
 * canon Def. 4.8, Cor. 4.6, Def. 6.6, Prop. 6.4, Rem. 4.10).
 *
 * The reducer owns no clock and no speech. It returns effects - wait, speak,
 * count - and the host feeds back what happened as events, each tagged with
 * the time it happened at. A wait or a speech carries the sequence number of
 * the step that asked for it, and an event for any other step is ignored, so
 * a stale timer can never advance the ladder.
 *
 * - A rep runs glyphs, turn, audio, echo, gloss, advanced by the clock
 *   (Def. 4.8). Audio ends when speech reports its end or, failing that, when
 *   its fallback wait runs out, so every step has an end.
 * - A stuck report during the glyphs or the turn ends the turn and plays the
 *   audio. The item returns later in the set, at most twice (Cor. 4.6,
 *   `p_repeat = on-report`), even if the rep is then skipped; a word
 *   reported on first sight is introduced first, then returns (Cor. 4.6).
 * - Counting (Prop. 6.4): a rep counts only when its gloss ran to the end,
 *   so a skipped rep, and a rep interrupted by a pause or a hidden page,
 *   counts nothing; the interrupted rep starts over, keeping any stuck
 *   report already made, across sittings too. A reported rep counts
 *   like any other; the returns and introductions a report causes count
 *   nothing. Credit is the rep's nominal duration, never the clock.
 * - Pace (Cor. 4.6 (iii)): a word's factor moves when the word runs to the
 *   end as a rep or a return, and at no other time. A sentence has none: its
 *   turn is fixed by the level (Cor. 4.6 (ii)).
 * - The sitting (Rem. 4.10): once thirty minutes have passed, nothing new
 *   begins - no rep, no introduction, no summary, no set. What is showing
 *   finishes first; a rep is never cut short by the bound. The set in
 *   progress is kept, and `start-sitting` resumes it at its next rep. Every
 *   screen ends within two minutes, the learner's pause included: a pause
 *   left for that long ends the sitting, and so does any pause, or hidden
 *   page, once the thirty minutes have passed.
 */

import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"
import type { PaceBook, PaceEntry } from "@topik/lib/topik/read-aloud/records"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import {
  audioWaitMs,
  echoMs,
  GLOSS_MS,
  INTRODUCTION_HOLD_MS,
  MAX_SCREEN_MS,
  nextPace,
  nominalRepMs,
  sentenceTurnMs,
  SETTLE_MS,
  SITTING_MS,
  SPEECH_MS_PER_SYLLABLE,
  speechFallbackMs,
  SUMMARY_MS,
  wordTurnMs,
} from "@topik/lib/topik/read-aloud/timing"
import { assertNever } from "some-ui-utils"

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What an entry in the queue is: a rep drawn for the set, a return caused
 * by a stuck report, or an introduction of a word reported on first sight.
 * Only a `rep` is ever counted (Prop. 6.4 (ii)).
 */
export type EntryRole = "rep" | "return" | "introduction"

export type QueueEntry = { item: SetItem; role: EntryRole }

/** A set as it can be stored and resumed: what is left of it. */
export type SetProgress = {
  queue: Array<QueueEntry>
  /** Returns already scheduled per item key; at most `MAX_RETURNS`. */
  returns: Record<string, number>
  /** Reps of the set counted so far, for its summary. */
  counted: number
  /** Whether the first entry was reported stuck before it was interrupted. */
  reported: boolean
}

export type RepStep = "glyphs" | "turn" | "audio" | "echo" | "gloss"
export type IntroductionStep = "intro-audio" | "intro-hold"

export type SetPhase =
  /** No set: the host is asked for one with `request-set`. */
  | { name: "idle" }
  /** A step of the entry at `cursor`. */
  | { name: RepStep | IntroductionStep }
  /** The set's closing summary, which ends by its own countdown. */
  | { name: "summary" }
  | {
      name: "paused"
      by: "learner" | "hidden"
      /** What starts again on resuming: the entry from its glyphs, or the summary. */
      resume: "entry" | "summary"
    }
  /** Remark 4.10's bound reached; `start-sitting` begins the next sitting. */
  | { name: "sitting-over" }

export type SetMachineState = {
  seq: number
  phase: SetPhase
  level: ReadAloudLevel
  queue: Array<QueueEntry>
  cursor: number
  returns: Record<string, number>
  /**
   * Whether the entry at `cursor` has been reported stuck. It is cleared only
   * on moving to the next entry, so a report outlives a restart.
   */
  reported: boolean
  /** Reps counted in this set: what the summary shows. */
  counted: number
  paces: PaceBook
  /** When the sitting began; null before the first set. */
  sittingStartedAt: number | null
}

export type SetEffect =
  /** Dispatch `elapsed` with this `seq` after `ms`, cancelling any other wait. */
  | { type: "wait"; seq: number; ms: number }
  /**
   * Say `text`; dispatch `spoken` with this `seq` when it ends. When playback
   * starts, replace this step's wait with one of `playingMs`, but never one
   * that ends after the step's first wait would have.
   */
  | { type: "speak"; seq: number; text: string; playingMs: number }
  | { type: "stop-speech" }
  /** Add one rep and its nominal practice to the record (Def. 6.6). */
  | { type: "count-rep"; creditMs: number }
  | { type: "count-set" }
  /** Store the word's pace (Cor. 4.6 (iii)). */
  | { type: "save-pace"; wordId: string; pace: PaceEntry }
  /** Build the next set and dispatch `begin-set`. */
  | { type: "request-set" }

export type SetEvent =
  | {
      type: "begin-set"
      at: number
      level: ReadAloudLevel
      progress: SetProgress
      paces: PaceBook
    }
  | { type: "start-sitting"; at: number }
  | { type: "elapsed"; at: number; seq: number }
  | { type: "spoken"; at: number; seq: number; heardMs: number }
  | { type: "stuck"; at: number }
  | { type: "skip"; at: number }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "hidden"; at: number }
  | { type: "shown"; at: number }
  | { type: "next-set"; at: number }

export type SetTransition = {
  state: SetMachineState
  effects: Array<SetEffect>
}

/** Cor. 4.6: an item reported stuck returns at most twice in a set. */
export const MAX_RETURNS = 2
/** How far after a report its return, or introduction, is placed. */
export const RETURN_GAP = 3
export const INTRODUCTION_GAP = 2

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const REP_STEPS: ReadonlySet<string> = new Set<RepStep>([
  "glyphs",
  "turn",
  "audio",
  "echo",
  "gloss",
])
const INTRODUCTION_STEPS: ReadonlySet<string> = new Set<IntroductionStep>([
  "intro-audio",
  "intro-hold",
])

const onEntry = (phase: SetPhase): boolean =>
  REP_STEPS.has(phase.name) || INTRODUCTION_STEPS.has(phase.name)

export function createSetMachine(level: ReadAloudLevel): SetMachineState {
  return {
    seq: 0,
    phase: { name: "idle" },
    level,
    queue: [],
    cursor: 0,
    returns: {},
    reported: false,
    counted: 0,
    paces: {},
    sittingStartedAt: null,
  }
}

/** A freshly built set, ready for `begin-set`. */
export const freshSet = (items: Array<SetItem>): SetProgress => ({
  queue: items.map((item) => ({ item, role: "rep" })),
  returns: {},
  counted: 0,
  reported: false,
})

/** What is left of the set in progress, for resuming it; null when none is. */
export function progressOf(state: SetMachineState): SetProgress | null {
  if (state.cursor >= state.queue.length) return null
  return {
    queue: state.queue.slice(state.cursor),
    returns: state.returns,
    counted: state.counted,
    reported: state.reported,
  }
}

export const currentEntry = (state: SetMachineState): QueueEntry | undefined =>
  state.queue[state.cursor]

/** A record's own entry: a word id such as `constructor` must not find `Object.prototype`'s. */
const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

const paceOf = (paces: PaceBook, wordId: string): PaceEntry =>
  own(paces, wordId) ?? { factor: 1, seen: 0 }

const sittingOver = (state: SetMachineState, at: number): boolean =>
  state.sittingStartedAt !== null && at - state.sittingStartedAt >= SITTING_MS

/** Move to a phase under a fresh sequence number. */
const enter = (state: SetMachineState, phase: SetPhase): SetMachineState => ({
  ...state,
  phase,
  seq: state.seq + 1,
})

const nominalSpeechMs = (item: SetItem): number =>
  item.syllables * SPEECH_MS_PER_SYLLABLE

function countTriples(queue: ReadonlyArray<QueueEntry>): number {
  let triples = 0
  for (let index = 2; index < queue.length; index += 1) {
    const kind = queue[index]?.item.kind
    if (
      queue[index - 1]?.item.kind === kind &&
      queue[index - 2]?.item.kind === kind
    ) {
      triples += 1
    }
  }
  return triples
}

/**
 * Insert an entry no earlier than `earliest`, preferably at `from` or later,
 * at the first place that adds no run of three alike (Cor. 4.6 (i)): every
 * place from `from` on, then the places before it, nearest first. Only when
 * every place would add a run does the entry go at `from`.
 */
function insertEntry(
  queue: Array<QueueEntry>,
  earliest: number,
  from: number,
  entry: QueueEntry
): { queue: Array<QueueEntry>; index: number } {
  const start = Math.min(Math.max(from, earliest), queue.length)
  const lowest = Math.min(earliest, start)
  const places = [
    ...Array.from({ length: queue.length - start + 1 }, (_, n) => start + n),
    ...Array.from({ length: start - lowest }, (_, n) => start - 1 - n),
  ]
  const at = (index: number): Array<QueueEntry> => [
    ...queue.slice(0, index),
    entry,
    ...queue.slice(index),
  ]
  const before = countTriples(queue)
  const index =
    places.find((place) => countTriples(at(place)) <= before) ?? start
  return { queue: at(index), index }
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════

function endSitting(state: SetMachineState): SetTransition {
  return { state: enter(state, { name: "sitting-over" }), effects: [] }
}

/**
 * Speak an entry, bounded: the wait allows for a voice to synthesise before
 * it plays, and the host renews it as `playingMs` once playback starts,
 * never past the first wait's deadline, so the step never outlasts
 * `audioWaitMs` and Rem. 4.10's bound holds.
 */
function speakEffects(seq: number, entry: QueueEntry): Array<SetEffect> {
  const { syllables, text } = entry.item
  return [
    { type: "speak", seq, text, playingMs: speechFallbackMs(syllables) },
    { type: "wait", seq, ms: audioWaitMs(syllables) },
  ]
}

/**
 * Begin the entry at `cursor`, unless the sitting is over. A restart after a
 * pause or a hidden page keeps the entry's stuck report.
 */
function startEntry(state: SetMachineState, at: number): SetTransition {
  const entry = currentEntry(state)
  if (!entry) return closeSet(state, at)
  if (sittingOver(state, at)) return endSitting(state)
  if (entry.role === "introduction") {
    const next = enter(state, { name: "intro-audio" })
    return {
      state: next,
      effects: speakEffects(next.seq, entry),
    }
  }
  const next = enter(state, { name: "glyphs" })
  return {
    state: next,
    effects: [{ type: "wait", seq: next.seq, ms: SETTLE_MS }],
  }
}

/** The set has run out: count it, then show the summary if there is time. */
function closeSet(state: SetMachineState, at: number): SetTransition {
  const effects: Array<SetEffect> = [{ type: "count-set" }]
  if (sittingOver(state, at)) {
    return { state: enter(state, { name: "sitting-over" }), effects }
  }
  const next = enter(state, { name: "summary" })
  effects.push({ type: "wait", seq: next.seq, ms: SUMMARY_MS })
  return { state: next, effects }
}

function advance(
  state: SetMachineState,
  at: number,
  effects: Array<SetEffect>
): SetTransition {
  const moved = startEntry(
    { ...state, cursor: state.cursor + 1, reported: false },
    at
  )
  return { state: moved.state, effects: [...effects, ...moved.effects] }
}

function startTurn(state: SetMachineState, entry: QueueEntry): SetTransition {
  const { item } = entry
  const ms =
    item.kind === "word"
      ? wordTurnMs(item.syllables, paceOf(state.paces, item.wordId).factor)
      : sentenceTurnMs(item.syllables, state.level)
  const next = enter(state, { name: "turn" })
  return { state: next, effects: [{ type: "wait", seq: next.seq, ms }] }
}

function startAudio(state: SetMachineState, entry: QueueEntry): SetTransition {
  const next = enter(state, { name: "audio" })
  return {
    state: next,
    effects: speakEffects(next.seq, entry),
  }
}

function startEcho(
  state: SetMachineState,
  entry: QueueEntry,
  heardMs: number
): SetTransition {
  const next = enter(state, { name: "echo" })
  return {
    state: next,
    effects: [
      { type: "wait", seq: next.seq, ms: echoMs(heardMs, entry.item.kind) },
    ],
  }
}

/** The gloss ran to the end: count, pace and schedule returns. */
function completeRep(
  state: SetMachineState,
  entry: QueueEntry,
  at: number
): SetTransition {
  const { item, role } = entry
  const effects: Array<SetEffect> = []
  let next = state

  if (role === "rep") {
    effects.push({
      type: "count-rep",
      creditMs: nominalRepMs(item.kind, item.syllables, state.level),
    })
    next = { ...next, counted: next.counted + 1 }
  }

  if (item.kind === "word") {
    const pace = paceOf(state.paces, item.wordId)
    const updated: PaceEntry = {
      factor: nextPace(pace.factor, state.reported),
      seen: pace.seen + 1,
    }
    next = { ...next, paces: { ...next.paces, [item.wordId]: updated } }
    effects.push({ type: "save-pace", wordId: item.wordId, pace: updated })
  }

  return advance(scheduleReturn(next, state, entry), at, effects)
}

/**
 * Bring a reported entry back later in the set, at most `MAX_RETURNS` times,
 * introducing a word reported on first sight before it returns (Cor. 4.6).
 * `before` is the state the entry ran in, whose pace book says whether the
 * word had been seen; `next` is where the return is scheduled.
 */
function scheduleReturn(
  next: SetMachineState,
  before: SetMachineState,
  { item, role }: QueueEntry
): SetMachineState {
  const returned = own(before.returns, item.key) ?? 0
  if (!before.reported || returned >= MAX_RETURNS) return next
  const firstSight =
    item.kind === "word" && paceOf(before.paces, item.wordId).seen === 0
  let queue = next.queue
  let earliest = before.cursor + 1
  let from = before.cursor + RETURN_GAP
  if (firstSight && role === "rep") {
    const introduced = insertEntry(
      queue,
      before.cursor + 1,
      before.cursor + INTRODUCTION_GAP,
      { item, role: "introduction" }
    )
    queue = introduced.queue
    earliest = introduced.index + 1
    from = introduced.index + RETURN_GAP
  }
  queue = insertEntry(queue, earliest, from, { item, role: "return" }).queue
  return {
    ...next,
    queue,
    returns: { ...next.returns, [item.key]: returned + 1 },
  }
}

function resumeFromPause(
  state: SetMachineState,
  resume: "entry" | "summary",
  at: number
): SetTransition {
  if (resume === "entry") return startEntry(state, at)
  if (sittingOver(state, at)) return endSitting(state)
  const next = enter(state, { name: "summary" })
  return {
    state: next,
    effects: [{ type: "wait", seq: next.seq, ms: SUMMARY_MS }],
  }
}

function leaveSummary(state: SetMachineState, at: number): SetTransition {
  if (sittingOver(state, at)) return endSitting(state)
  return {
    state: enter(state, { name: "idle" }),
    effects: [{ type: "request-set" }],
  }
}

/** A step's own clock ran out. */
function onElapsed(state: SetMachineState, at: number): SetTransition {
  const entry = currentEntry(state)
  const { phase } = state
  switch (phase.name) {
    case "glyphs": {
      return entry ? startTurn(state, entry) : { state, effects: [] }
    }
    case "turn": {
      return entry ? startAudio(state, entry) : { state, effects: [] }
    }
    case "audio": {
      if (!entry) return { state, effects: [] }
      // Speech never said it ended: stop it, and assume it took its nominal time.
      const echo = startEcho(state, entry, nominalSpeechMs(entry.item))
      return {
        state: echo.state,
        effects: [{ type: "stop-speech" }, ...echo.effects],
      }
    }
    case "echo": {
      if (!entry) return { state, effects: [] }
      const next = enter(state, { name: "gloss" })
      return {
        state: next,
        effects: [
          { type: "wait", seq: next.seq, ms: GLOSS_MS[entry.item.kind] },
        ],
      }
    }
    case "gloss": {
      return entry ? completeRep(state, entry, at) : { state, effects: [] }
    }
    case "intro-audio": {
      const next = enter(state, { name: "intro-hold" })
      return {
        state: next,
        effects: [
          { type: "stop-speech" },
          { type: "wait", seq: next.seq, ms: INTRODUCTION_HOLD_MS },
        ],
      }
    }
    case "intro-hold": {
      return advance(state, at, [])
    }
    case "summary": {
      return leaveSummary(state, at)
    }
    case "paused": {
      // Only a learner's pause waits, and it is a screen like any other
      // (Rem. 4.10): left for two minutes, it ends the sitting.
      return endSitting(state)
    }
    case "idle":
    case "sitting-over": {
      return { state, effects: [] }
    }
    default: {
      return assertNever(phase)
    }
  }
}

function pauseWith(
  state: SetMachineState,
  by: "learner" | "hidden",
  at: number
): SetTransition {
  const { phase } = state
  if (!onEntry(phase) && phase.name !== "summary") return { state, effects: [] }
  // Past the bound, a pause would be a new screen: the sitting ends instead,
  // and the interrupted entry resumes in the next one.
  if (sittingOver(state, at)) {
    const ended = endSitting(state)
    return { state: ended.state, effects: [{ type: "stop-speech" }] }
  }
  const next = enter(state, {
    name: "paused",
    by,
    resume: phase.name === "summary" ? "summary" : "entry",
  })
  const effects: Array<SetEffect> = [{ type: "stop-speech" }]
  if (by === "learner") {
    effects.push({ type: "wait", seq: next.seq, ms: MAX_SCREEN_MS })
  }
  return { state: next, effects }
}

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

export function setMachineReducer(
  state: SetMachineState,
  event: SetEvent
): SetTransition {
  const unchanged: SetTransition = { state, effects: [] }
  const { phase } = state

  switch (event.type) {
    case "begin-set": {
      if (phase.name !== "idle" || event.progress.queue.length === 0) {
        return unchanged
      }
      return startEntry(
        {
          ...state,
          level: event.level,
          queue: event.progress.queue,
          returns: event.progress.returns,
          cursor: 0,
          counted: event.progress.counted,
          reported: event.progress.reported,
          paces: event.paces,
          sittingStartedAt: state.sittingStartedAt ?? event.at,
        },
        event.at
      )
    }

    case "start-sitting": {
      if (phase.name !== "sitting-over") return unchanged
      const fresh = { ...state, sittingStartedAt: event.at }
      if (progressOf(fresh)) return startEntry(fresh, event.at)
      return {
        state: enter(fresh, { name: "idle" }),
        effects: [{ type: "request-set" }],
      }
    }

    case "elapsed": {
      return event.seq === state.seq ? onElapsed(state, event.at) : unchanged
    }

    case "spoken": {
      if (event.seq !== state.seq) return unchanged
      const entry = currentEntry(state)
      if (!entry) return unchanged
      if (phase.name === "audio") return startEcho(state, entry, event.heardMs)
      if (phase.name === "intro-audio") {
        const next = enter(state, { name: "intro-hold" })
        return {
          state: next,
          effects: [{ type: "wait", seq: next.seq, ms: INTRODUCTION_HOLD_MS }],
        }
      }
      return unchanged
    }

    case "stuck": {
      const entry = currentEntry(state)
      if (!entry || !REP_STEPS.has(phase.name)) return unchanged
      const reported = { ...state, reported: true }
      // Before the audio, the report ends the turn: hearing it is the help.
      if (phase.name === "glyphs" || phase.name === "turn") {
        return startAudio(reported, entry)
      }
      return { state: reported, effects: [] }
    }

    case "skip": {
      // A skipped rep counts nothing and leaves its pace alone, but a stuck
      // report made before the skip still brings the item back.
      const entry = currentEntry(state)
      if (!entry || !onEntry(phase)) return unchanged
      return advance(scheduleReturn(state, state, entry), event.at, [
        { type: "stop-speech" },
      ])
    }

    case "next-set": {
      return phase.name === "summary"
        ? leaveSummary(state, event.at)
        : unchanged
    }

    case "pause": {
      return pauseWith(state, "learner", event.at)
    }

    case "hidden": {
      return phase.name === "paused"
        ? unchanged
        : pauseWith(state, "hidden", event.at)
    }

    case "resume": {
      return phase.name === "paused" && phase.by === "learner"
        ? resumeFromPause(state, phase.resume, event.at)
        : unchanged
    }

    case "shown": {
      return phase.name === "paused" && phase.by === "hidden"
        ? resumeFromPause(state, phase.resume, event.at)
        : unchanged
    }

    default: {
      return assertNever(event)
    }
  }
}
