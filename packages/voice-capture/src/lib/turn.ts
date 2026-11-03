/**
 * The turn (TALK1, #2546): one pattern for every conversation a screen has
 * with the person. Something is put in front of them (the prime, the
 * screen's own), they say one take, its words come back, and they say
 * whether that's what they meant: That's right, Fix the words, or Say it
 * again. The words they confirm are kept, and the other side's reply is the
 * next turn, which the screen opens (`nextTurn`) once it has one.
 * `stepTurn(state, event)` returns the next state and the effects to run and
 * does nothing else; `./turn-runtime` runs the listening effects against a
 * listener (home hearing a take, or the phone's recognizer), and the screen
 * runs `keep` against its store (docs/monorepo-boundaries.md, "Inside a
 * React package"). Studio's idea screen is its first screen.
 *
 * Rules that hold by structure (`__tests__/turn.test.ts` holds each over
 * every ordering of hearing, confirming, keeping and leaving):
 *
 * - **Only confirmed words are kept.** `keep` is emitted only by That's
 *   right on words heard, or Keep these words on words fixed or typed, and
 *   a fix keeps the words first heard beside it.
 * - **Nothing is graded and there are no options.** A turn's words are what
 *   the person said, or wrote, and nothing else.
 * - **Speaking never waits on voice.** Until the listener says it can
 *   listen, and from the moment it says it can't, the turn takes typed
 *   words; "Type instead" is there while a take is under way too, and a take
 *   whose words don't come in time is kept and the turn takes typed words.
 * - **A tap is answered on screen**: a listening shows it is getting ready
 *   until the listener says it is listening, Done talking shows it is
 *   finishing until the words come, and a listener that never started says
 *   so and takes typed words.
 * - **One listening at a time**, numbered: a result for an earlier one, or
 *   one that lands after the turn moved on, changes nothing.
 * - **Kept is kept.** Once the screen says the words are kept, nothing that
 *   lands late changes them; until it says so, a second confirm does
 *   nothing, and a keep that failed returns to the words with a notice.
 */
import { assertNever } from "@some-ui/core-utils"

import type { RecordingFailure } from "./recorder"

/** Whether the listener can listen. */
export type TurnVoice = "checking" | "ready" | "unavailable"

/** How words came to be a turn's: heard from a take, typed, or fixed. */
type TurnWordsHow = "heard" | "typed" | "fixed"

/** One version of a turn's words, as it is kept. */
export type TurnWords = {
  /** ISO time it was confirmed. */
  readonly at: string
  readonly how: TurnWordsHow
  readonly words: string
}

/** Where a turn is, from waiting to be said to kept. */
export type TurnPhase =
  | { readonly kind: "idle" }
  | {
      readonly kind: "listening"
      readonly seq: number
      /** The listener has said it is listening. */
      readonly ready: boolean
      /** What has been heard so far; it may still change. */
      readonly words: string
    }
  /** Done talking: waiting on the words, briefly. */
  | { readonly kind: "finishing"; readonly seq: number; readonly words: string }
  /** The take is kept, and home is hearing it: the words come later. */
  | { readonly kind: "hearing"; readonly seq: number }
  | { readonly kind: "heard"; readonly words: string }
  | {
      readonly kind: "fixing"
      readonly heard: string
      readonly draft: string
    }
  | { readonly kind: "typing"; readonly draft: string }
  /** Confirmed, and the screen is keeping it. */
  | {
      readonly kind: "keeping"
      readonly versions: ReadonlyArray<TurnWords>
      /** Where it returns if keeping fails. */
      readonly from: Extract<TurnPhase, { kind: "heard" | "fixing" | "typing" }>
    }
  /** Kept: what the other side answers is the next turn. */
  | { readonly kind: "kept"; readonly versions: ReadonlyArray<TurnWords> }

export type TurnNotice =
  | "notHeard"
  | "listenFailed"
  | "listenNotStarted"
  | "notKept"
  /** A take was kept, and its words didn't come in time: where it is. */
  | "keptOnHome"
  | "keptOnPhone"
  /** A take home holds, and home can't give its words back. */
  | "homeNoWords"
  /** A take was kept, and home couldn't be reached: where it is. */
  | "awayOnHome"
  | "awayOnPhone"
  /** A take couldn't be kept: no room, or it failed. */
  | "takeFull"
  | "takeNotKept"
  /** The microphone refused a take, and why. */
  | { readonly refused: RecordingFailure }
  | null

export type TurnState = {
  readonly phase: TurnPhase
  readonly voice: TurnVoice
  readonly notice: TurnNotice
  /** The last listening's number, counted across turns. */
  readonly seq: number
}

/** How a listening ended. */
export type Listened =
  /** Empty when nothing was heard. */
  | { readonly kind: "heard"; readonly words: string }
  | { readonly kind: "unavailable" }
  /** The recognizer never said it was listening. */
  | { readonly kind: "notStarted" }
  | { readonly kind: "failed" }
  /**
   * The take was kept, and home's words for it didn't come: where it is
   * kept now, and why: not in time (`late`), home can't give them back
   * (`noWords`), or home couldn't be reached (`away`).
   */
  | {
      readonly kind: "kept"
      readonly on: "home" | "phone"
      readonly why: "late" | "noWords" | "away"
    }
  /** The take couldn't be kept: no room for it, or keeping it failed. */
  | { readonly kind: "notKept"; readonly why: "full" | "failed" }
  /** The microphone refused the take. */
  | { readonly kind: "refused"; readonly reason: RecordingFailure }

/** Taps, as the screen sends them. */
export type TurnIntent =
  | { readonly type: "talk" }
  | { readonly type: "stopTalking" }
  /** That's right: the words heard are what the person meant. */
  | { readonly type: "meant" }
  | { readonly type: "fix" }
  | { readonly type: "type" }
  | { readonly type: "draft"; readonly text: string }
  | { readonly type: "save" }

type Stamp = { readonly at: string }

export type TurnEvent =
  | (TurnIntent & Stamp)
  | { readonly type: "voiceChecked"; readonly available: boolean }
  | { readonly type: "ready"; readonly seq: number }
  /** The listening's take is kept, and home is hearing it. */
  | { readonly type: "hearing"; readonly seq: number }
  | { readonly type: "partial"; readonly seq: number; readonly words: string }
  | {
      readonly type: "listened"
      readonly seq: number
      readonly result: Listened
    }
  /** The screen kept the words `keep` asked for, or couldn't. */
  | { readonly type: "kept" }
  | { readonly type: "notKept" }
  /** The page hid (the app sent to the background). */
  | { readonly type: "hidden" }
  /** The turn's screen went. */
  | { readonly type: "left" }

export type TurnEffect =
  | { readonly type: "checkVoice" }
  | { readonly type: "listen"; readonly seq: number }
  | { readonly type: "stopListening" }
  | { readonly type: "cancelListening" }
  /** Keep these confirmed words, then answer `kept` or `notKept`. */
  | {
      readonly type: "keep"
      readonly versions: ReadonlyArray<TurnWords>
      readonly at: string
    }

export type TurnStep = {
  readonly state: TurnState
  readonly effects: ReadonlyArray<TurnEffect>
}

export const initialTurn: TurnState = {
  phase: { kind: "idle" },
  voice: "checking",
  notice: null,
  seq: 0,
}

/** Where a turn opens: talking when it can listen, else typing. */
function phaseFor(voice: TurnVoice): TurnPhase {
  return voice === "unavailable"
    ? { kind: "typing", draft: "" }
    : { kind: "idle" }
}

/**
 * The next turn, once the other side has answered: what the listener can do
 * and the listenings' count carry over, the notice too.
 */
export function nextTurn(state: TurnState): TurnState {
  return { ...state, phase: phaseFor(state.voice) }
}

type Underway = Extract<
  TurnPhase,
  { kind: "listening" | "finishing" | "hearing" }
>

/** A listening is under way: started, finishing, or its take being heard. */
export function isUnderway(phase: TurnPhase): phase is Underway {
  return (
    phase.kind === "listening" ||
    phase.kind === "finishing" ||
    phase.kind === "hearing"
  )
}

/** Whether a listening numbered `seq` is on screen, under way. */
function underway(phase: TurnPhase, seq: number): phase is Underway {
  return isUnderway(phase) && phase.seq === seq
}

/** The words a listening under way has heard so far. */
function sofarOf(phase: Underway): string {
  return phase.kind === "hearing" ? "" : phase.words.trim()
}

/** Where a take whose words didn't come is kept, and why, as a notice. */
function keptNotice(result: Extract<Listened, { kind: "kept" }>): TurnNotice {
  switch (result.why) {
    case "late": {
      return result.on === "home" ? "keptOnHome" : "keptOnPhone"
    }
    case "noWords": {
      return "homeNoWords"
    }
    case "away": {
      return result.on === "home" ? "awayOnHome" : "awayOnPhone"
    }
    default: {
      return assertNever(result.why)
    }
  }
}

const same = (state: TurnState): TurnStep => ({ state, effects: [] })

/** Done talking, or the page hid: a listening finishes with its words. */
function finish(state: TurnState): TurnStep {
  const { phase } = state
  return phase.kind === "listening"
    ? {
        state: {
          ...state,
          phase: { kind: "finishing", seq: phase.seq, words: phase.words },
        },
        effects: [{ type: "stopListening" }],
      }
    : same(state)
}

function listened(state: TurnState, seq: number, result: Listened): TurnStep {
  const { phase } = state
  if (!underway(phase, seq)) return same(state)
  const sofar = sofarOf(phase)
  const at = (next: TurnPhase, notice: TurnNotice): TurnStep =>
    same({ ...state, phase: next, notice })
  switch (result.kind) {
    case "heard": {
      const words = result.words.trim() || sofar
      return words === ""
        ? at({ kind: "idle" }, "notHeard")
        : at({ kind: "heard", words }, null)
    }
    case "failed": {
      return sofar === ""
        ? at({ kind: "idle" }, "listenFailed")
        : at({ kind: "heard", words: sofar }, null)
    }
    case "unavailable": {
      return same({
        ...state,
        voice: "unavailable",
        phase: { kind: "typing", draft: sofar },
        notice: null,
      })
    }
    case "notStarted": {
      // This turn takes typed words; the next may try the voice again.
      return at({ kind: "typing", draft: sofar }, "listenNotStarted")
    }
    case "kept": {
      // The take is kept; its words for this turn are typed.
      const typing = at({ kind: "typing", draft: sofar }, keptNotice(result))
      // Home didn't answer: what the listener can do next may have changed.
      return result.why === "away"
        ? { ...typing, effects: [{ type: "checkVoice" }] }
        : typing
    }
    case "notKept": {
      return at(
        { kind: "idle" },
        result.why === "full" ? "takeFull" : "takeNotKept"
      )
    }
    case "refused": {
      return at({ kind: "idle" }, { refused: result.reason })
    }
    default: {
      return assertNever(result)
    }
  }
}

/** Confirms `versions`, from the words on screen. */
function keep(
  state: TurnState,
  from: Extract<TurnPhase, { kind: "heard" | "fixing" | "typing" }>,
  versions: ReadonlyArray<TurnWords>,
  at: string
): TurnStep {
  return {
    state: { ...state, phase: { kind: "keeping", versions, from } },
    effects: [{ type: "keep", versions, at }],
  }
}

function onIntent(state: TurnState, event: TurnIntent & Stamp): TurnStep {
  const { phase } = state
  const withPhase = (next: TurnPhase, notice = state.notice): TurnState => ({
    ...state,
    phase: next,
    notice,
  })
  switch (event.type) {
    case "talk": {
      if (
        state.voice !== "ready" ||
        (phase.kind !== "idle" && phase.kind !== "heard")
      ) {
        return same(state)
      }
      const seq = state.seq + 1
      return {
        state: {
          ...withPhase(
            { kind: "listening", seq, ready: false, words: "" },
            null
          ),
          seq,
        },
        effects: [{ type: "listen", seq }],
      }
    }
    case "stopTalking": {
      return finish(state)
    }
    case "meant": {
      return phase.kind === "heard"
        ? keep(
            state,
            phase,
            [{ at: event.at, how: "heard", words: phase.words }],
            event.at
          )
        : same(state)
    }
    case "fix": {
      return phase.kind === "heard"
        ? same(
            withPhase({
              kind: "fixing",
              heard: phase.words,
              draft: phase.words,
            })
          )
        : same(state)
    }
    case "type": {
      // Heard words are confirmed or fixed, so a fix keeps them beside it.
      if (phase.kind === "idle") {
        return same(withPhase({ kind: "typing", draft: "" }))
      }
      return isUnderway(phase)
        ? {
            state: withPhase({ kind: "typing", draft: sofarOf(phase) }),
            effects: [{ type: "cancelListening" }],
          }
        : same(state)
    }
    case "draft": {
      return phase.kind === "fixing" || phase.kind === "typing"
        ? same(withPhase({ ...phase, draft: event.text }))
        : same(state)
    }
    case "save": {
      if (phase.kind !== "fixing" && phase.kind !== "typing") return same(state)
      const draft = phase.draft.trim()
      if (draft === "") return same(state)
      if (phase.kind === "typing") {
        return keep(
          state,
          phase,
          [{ at: event.at, how: "typed", words: draft }],
          event.at
        )
      }
      const heard: TurnWords = {
        at: event.at,
        how: "heard",
        words: phase.heard,
      }
      return keep(
        state,
        phase,
        draft === phase.heard
          ? [heard]
          : [heard, { at: event.at, how: "fixed", words: draft }],
        event.at
      )
    }
    default: {
      return assertNever(event)
    }
  }
}

/** The turn's step. */
export function stepTurn(state: TurnState, event: TurnEvent): TurnStep {
  const { phase } = state
  switch (event.type) {
    case "voiceChecked": {
      const voice: TurnVoice = event.available ? "ready" : "unavailable"
      const next: TurnState = { ...state, voice }
      // A turn opened before the answer came takes its own: typing from
      // talking only while nothing has been typed or heard yet.
      if (phase.kind === "idle" && voice === "unavailable") {
        return same({ ...next, phase: { kind: "typing", draft: "" } })
      }
      // The listener can listen again: a turn typing only because it
      // couldn't, with nothing typed yet, offers "Say it".
      if (
        state.voice === "unavailable" &&
        voice === "ready" &&
        phase.kind === "typing" &&
        phase.draft === ""
      ) {
        return same({ ...next, phase: { kind: "idle" } })
      }
      return same(next)
    }
    case "ready": {
      return phase.kind === "listening" && phase.seq === event.seq
        ? same({ ...state, phase: { ...phase, ready: true } })
        : same(state)
    }
    case "hearing": {
      return underway(phase, event.seq) && phase.kind !== "hearing"
        ? same({ ...state, phase: { kind: "hearing", seq: event.seq } })
        : same(state)
    }
    case "partial": {
      return underway(phase, event.seq) && phase.kind !== "hearing"
        ? same({ ...state, phase: { ...phase, words: event.words } })
        : same(state)
    }
    case "listened": {
      return listened(state, event.seq, event.result)
    }
    case "kept": {
      return phase.kind === "keeping"
        ? same({
            ...state,
            phase: { kind: "kept", versions: phase.versions },
            notice: null,
          })
        : same(state)
    }
    case "notKept": {
      return phase.kind === "keeping"
        ? same({ ...state, phase: phase.from, notice: "notKept" })
        : same(state)
    }
    case "hidden": {
      return finish(state)
    }
    case "left": {
      return isUnderway(phase)
        ? {
            state: { ...state, phase: phaseFor(state.voice) },
            effects: [{ type: "cancelListening" }],
          }
        : same(state)
    }
    case "talk":
    case "stopTalking":
    case "meant":
    case "fix":
    case "type":
    case "draft":
    case "save": {
      return onIntent(state, event)
    }
    default: {
      return assertNever(event)
    }
  }
}
