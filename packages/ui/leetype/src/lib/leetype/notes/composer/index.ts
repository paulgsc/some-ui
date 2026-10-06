/**
 * The margin-note composer (canon Rem. 3.7) as one state machine:
 * `step(state, event)` returns the next state and the effects to run, and
 * does nothing else. `../runtime` runs the effects against the store and
 * the recognizer and feeds their results back as events; `RoundSession`
 * renders a state and turns taps into intents (docs/monorepo-boundaries.md,
 * "Inside a React package: the component is not the coordinator"; the
 * model copied is `@some-ui/soundbites`' `lib/machine.ts`).
 *
 * The flow is built so that getting stuck costs one tap to record:
 *
 * ```text
 * closed ── notePressed(anchor) ──▶ choosing ── kindPicked ──▶ noted (saved)
 *                                                               │ micPressed ▶ listening ▶ transcript appended, saved
 *                                                               │ textEdited ▶ saved
 *                                                               │ undoPressed ▶ removed, closed
 *                                                               └ donePressed / notePressed ▶ closed
 * ```
 *
 * - **The kind is the note.** Picking a kind saves it at once; words are
 *   added to a note that already exists, so leaving at any point keeps
 *   what was said.
 * - **The anchor is taken when the composer opens**, from whatever was
 *   showing then; swiping to another artifact while writing does not move
 *   the note.
 * - **One utterance at a time, and a late one is dropped here.** Each
 *   listen carries a sequence number; a result for any other is ignored,
 *   so a transcript that lands after the note was closed, undone or
 *   replaced writes nothing.
 * - **Done while listening finishes the utterance first**, then closes, so
 *   the last words said are kept. Pressing it again waits for the same
 *   transcript; after `FINISH_TIMEOUT_MS` without one the note closes with
 *   what was heard, so a recognizer that never settles cannot hold the
 *   panel open.
 * - **Nothing listens while the page is off screen.** Hiding the page
 *   finishes an utterance in progress (what was heard is kept), and the
 *   microphone does not start while hidden.
 * - **Leaving the round closes the composer.** An utterance in progress
 *   is finished as Done finishes it, so the words land on the note, which
 *   keeps the anchor of the round it was raised on; leaving is never held
 *   back for it (Ax. 9.1). Only while the runtime stays attached: a host
 *   that unmounts the round session detaches it, which cancels.
 */

import type {
  NoteAnchor,
  NoteKind,
  RoundNote,
} from "@leetype/lib/leetype/notes"
import {
  appendNoteText,
  clampNoteText,
  NOTE_TEXT_MAX,
} from "@leetype/lib/leetype/notes"
import type { DictationFailure } from "@leetype/lib/leetype/notes/dictation"
import { assertNever } from "@some-ui/core-utils"

type Voice =
  | { readonly kind: "idle" }
  /** Asked to listen; nothing heard yet. */
  | { readonly kind: "listening"; readonly seq: number; readonly heard: string }
  /** Asked to finish; the transcript is on its way. */
  | { readonly kind: "finishing"; readonly seq: number; readonly heard: string }

export type Composer =
  | { readonly phase: "closed" }
  | { readonly phase: "choosing"; readonly anchor: NoteAnchor }
  | {
      readonly phase: "noted"
      readonly note: RoundNote
      readonly voice: Voice
      /** Done was pressed mid-utterance: close once it lands. */
      readonly closing: boolean
    }

export type ComposerState = {
  readonly composer: Composer
  /** Whether a recognizer exists here; without one the composer types only. */
  readonly canListen: boolean
  readonly visible: boolean
  /** The latest listen asked for; a result for any other is stale. */
  readonly seq: number
  /** Said once, after a note is saved or a listen fails; cleared on the next tap. */
  readonly notice: string
}

/** What the learner does. */
export type ComposerIntent =
  | { readonly type: "notePressed"; readonly anchor: NoteAnchor }
  | { readonly type: "kindPicked"; readonly kind: NoteKind }
  | { readonly type: "micPressed" }
  | { readonly type: "textEdited"; readonly text: string }
  | { readonly type: "donePressed" }
  | { readonly type: "undoPressed" }
  /** The round the composer was opened on is no longer the one showing. */
  | { readonly type: "roundLeft" }

/** What the runtime reports. */
type ComposerSignal =
  | {
      readonly type: "noteStarted"
      readonly kind: NoteKind
      readonly id: string
      readonly at: string
    }
  | { readonly type: "heard"; readonly seq: number; readonly heard: string }
  | {
      readonly type: "transcribed"
      readonly seq: number
      readonly text: string
    }
  | {
      readonly type: "listenFailed"
      readonly seq: number
      readonly reason: DictationFailure
    }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  /** `FINISH_TIMEOUT_MS` passed since Done asked utterance `seq` to finish. */
  | { readonly type: "finishTimedOut"; readonly seq: number }

/**
 * What `step` reads: every intent but `kindPicked`, which the runtime turns
 * into `noteStarted` with the id and time it alone can make.
 */
export type ComposerEvent =
  | Exclude<ComposerIntent, { readonly type: "kindPicked" }>
  | ComposerSignal

export type ComposerEffect =
  | { readonly type: "save"; readonly note: RoundNote }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "listen"; readonly seq: number }
  | { readonly type: "finishListening" }
  | { readonly type: "cancelListening" }
  /** Report `finishTimedOut` for `seq` after `FINISH_TIMEOUT_MS`. */
  | { readonly type: "startFinishTimer"; readonly seq: number }

export type ComposerStep = {
  readonly state: ComposerState
  readonly effects: ReadonlyArray<ComposerEffect>
}

export const COMPOSER_NOTICES = {
  saved: "Noted.",
  removed: "Note removed.",
  denied: "The microphone is blocked. You can type instead.",
  silent: "Didn't catch that. Tap the microphone and try again.",
  failed: "Couldn't turn that into text. You can type instead.",
} as const satisfies Record<"saved" | "removed" | DictationFailure, string>

/**
 * How long a closing note waits for its last transcript. A phone's
 * recognizer only hands words over when it is done (final results only), so
 * closing sooner would drop everything said; a recognizer that never
 * settles (another app took the microphone, its service died) must not hold
 * the panel open either.
 */
export const FINISH_TIMEOUT_MS = 8_000

export function initialComposerState(canListen: boolean): ComposerState {
  return {
    composer: { phase: "closed" },
    canListen,
    visible: true,
    seq: 0,
    notice: "",
  }
}

const stay = (state: ComposerState): ComposerStep => ({ state, effects: [] })

/** Whether an utterance is in progress (asked for, not yet landed). */
export function isListening(composer: Composer): boolean {
  return composer.phase === "noted" && composer.voice.kind !== "idle"
}

/** The note's text as it should read now: what is kept, plus what is being heard. */
export function draftOf(composer: Composer): string {
  if (composer.phase !== "noted") return ""
  const { note, voice } = composer
  return voice.kind === "idle"
    ? note.text
    : appendNoteText(note.text, voice.heard)
}

function close(state: ComposerState, notice: string): ComposerStep {
  return {
    state: { ...state, composer: { phase: "closed" }, notice },
    effects: [],
  }
}

/** Asks the open utterance to finish, then closes once it lands. */
function finish(state: ComposerState): ComposerStep {
  const { composer } = state
  if (composer.phase !== "noted") {
    return close(state, "")
  }
  if (composer.voice.kind === "idle")
    return close(state, COMPOSER_NOTICES.saved)
  // Already closing: a second Done (or "Make your own" after Done) waits
  // for the same transcript rather than dropping it.
  if (composer.closing) return stay(state)
  const { seq } = composer.voice
  return {
    state: {
      ...state,
      composer: {
        ...composer,
        voice: { ...composer.voice, kind: "finishing" },
        closing: true,
      },
    },
    effects: [
      ...(composer.voice.kind === "listening"
        ? [{ type: "finishListening" } as const]
        : []),
      { type: "startFinishTimer", seq },
    ],
  }
}

/** The utterance `seq` is over; `text` (possibly empty) joins the note. */
function landed(
  state: ComposerState,
  seq: number,
  text: string,
  notice: string
): ComposerStep {
  const { composer } = state
  if (composer.phase !== "noted" || composer.voice.kind === "idle") {
    return stay(state)
  }
  if (composer.voice.seq !== seq) return stay(state)
  const note =
    text === ""
      ? composer.note
      : {
          ...composer.note,
          text: appendNoteText(composer.note.text, text),
          spoken: true,
        }
  const effects: Array<ComposerEffect> =
    note === composer.note ? [] : [{ type: "save", note }]
  if (composer.closing) {
    return {
      state: {
        ...state,
        composer: { phase: "closed" },
        notice: notice || COMPOSER_NOTICES.saved,
      },
      effects,
    }
  }
  return {
    state: {
      ...state,
      composer: { ...composer, note, voice: { kind: "idle" } },
      notice,
    },
    effects,
  }
}

export function step(state: ComposerState, event: ComposerEvent): ComposerStep {
  const { composer } = state
  switch (event.type) {
    case "notePressed": {
      if (composer.phase === "closed") {
        return stay({
          ...state,
          composer: { phase: "choosing", anchor: event.anchor },
          notice: "",
        })
      }
      return finish(state)
    }
    case "noteStarted": {
      if (composer.phase !== "choosing") return stay(state)
      const note: RoundNote = {
        id: event.id,
        at: event.at,
        kind: event.kind,
        text: "",
        spoken: false,
        anchor: composer.anchor,
      }
      return {
        state: {
          ...state,
          composer: {
            phase: "noted",
            note,
            voice: { kind: "idle" },
            closing: false,
          },
          notice: COMPOSER_NOTICES.saved,
        },
        effects: [{ type: "save", note }],
      }
    }
    case "micPressed": {
      if (composer.phase !== "noted" || composer.closing) return stay(state)
      if (composer.voice.kind === "listening") {
        return {
          state: {
            ...state,
            composer: {
              ...composer,
              voice: { ...composer.voice, kind: "finishing" },
            },
          },
          effects: [{ type: "finishListening" }],
        }
      }
      if (composer.voice.kind === "finishing") return stay(state)
      if (!state.canListen || !state.visible) return stay(state)
      const seq = state.seq + 1
      return {
        state: {
          ...state,
          seq,
          notice: "",
          composer: {
            ...composer,
            voice: { kind: "listening", seq, heard: "" },
          },
        },
        effects: [{ type: "listen", seq }],
      }
    }
    case "heard": {
      if (composer.phase !== "noted" || composer.voice.kind === "idle") {
        return stay(state)
      }
      if (composer.voice.seq !== event.seq) return stay(state)
      return stay({
        ...state,
        composer: {
          ...composer,
          voice: { ...composer.voice, heard: event.heard },
        },
      })
    }
    case "transcribed": {
      return landed(state, event.seq, event.text, "")
    }
    case "listenFailed": {
      // Words heard before a failure are still the learner's words.
      const heard =
        composer.phase === "noted" &&
        composer.voice.kind !== "idle" &&
        composer.voice.seq === event.seq
          ? composer.voice.heard
          : ""
      return landed(
        state,
        event.seq,
        heard,
        heard === "" ? COMPOSER_NOTICES[event.reason] : ""
      )
    }
    case "textEdited": {
      if (composer.phase !== "noted" || isListening(composer)) {
        return stay(state)
      }
      const text = event.text.slice(0, NOTE_TEXT_MAX)
      if (text === composer.note.text) return stay(state)
      // Saved trimmed and cut; held as typed, so a trailing space survives
      // the keystroke that made it.
      const note = { ...composer.note, text }
      return {
        state: { ...state, composer: { ...composer, note }, notice: "" },
        effects: [
          { type: "save", note: { ...note, text: clampNoteText(text) } },
        ],
      }
    }
    case "donePressed": {
      return finish(state)
    }
    case "undoPressed": {
      if (composer.phase !== "noted") return close(state, "")
      return {
        state: {
          ...state,
          composer: { phase: "closed" },
          notice: COMPOSER_NOTICES.removed,
        },
        effects: [
          ...(isListening(composer)
            ? [{ type: "cancelListening" } as const]
            : []),
          { type: "remove", id: composer.note.id },
        ],
      }
    }
    case "roundLeft": {
      if (composer.phase === "closed") return stay({ ...state, notice: "" })
      // Words still being turned into text are the learner's, said about
      // the round they were on: finish them as Done would (the note keeps
      // its own anchor), rather than hold the next round back (Ax. 9.1).
      if (isListening(composer)) return finish(state)
      return stay({ ...state, composer: { phase: "closed" }, notice: "" })
    }
    case "hidden": {
      const hidden = { ...state, visible: false }
      if (composer.phase !== "noted" || composer.voice.kind !== "listening") {
        return stay(hidden)
      }
      return {
        state: {
          ...hidden,
          composer: {
            ...composer,
            voice: { ...composer.voice, kind: "finishing" },
          },
        },
        effects: [{ type: "finishListening" }],
      }
    }
    case "shown": {
      return stay({ ...state, visible: true })
    }
    case "finishTimedOut": {
      if (
        composer.phase !== "noted" ||
        !composer.closing ||
        composer.voice.kind !== "finishing" ||
        composer.voice.seq !== event.seq
      ) {
        return stay(state)
      }
      // The transcript never came: close with what was heard (nothing, on
      // a phone), and let go of the recognizer. The note itself was saved
      // when its kind was picked.
      const landing = landed(state, event.seq, composer.voice.heard, "")
      return {
        state: landing.state,
        effects: [...landing.effects, { type: "cancelListening" }],
      }
    }
    default: {
      return assertNever(event)
    }
  }
}
