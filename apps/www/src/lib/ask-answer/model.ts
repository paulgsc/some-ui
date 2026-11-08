/**
 * An ask answered by voice on its page in Studio (SFEED5, #2746): one take,
 * kept on home under the ask's ref (`answerRef`), which the reflections
 * routine files as a pending issue in the ask's repository
 * (`packages/ui/topik/ROUTINE.md`, part E). The take is the answer: home's
 * words come back only to show what was heard, so there is nothing to
 * confirm, fix or type, and each take said is an answer of its own.
 *
 * `step(state, event)` is pure; `./index` runs its effects through the
 * turn's `turnListening` (`@some-ui/voice-capture`), so one listening runs at
 * a time and a result for an earlier one changes nothing. It is not the
 * turn's `stepTurn`, which ends in typed words wherever a take's words don't
 * come; it keeps the turn's rules that apply to a take alone: the page
 * hiding ends a take, a take let go is kept, and since only home hears it, a
 * phone not paired with home says so instead of recording.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  ListeningEffect,
  ListeningEvent,
  RecordingFailure,
} from "@some-ui/voice-capture"

export type AnswerPhase =
  | { readonly kind: "idle" }
  | {
      readonly kind: "recording"
      readonly seq: number
      readonly ready: boolean
    }
  /** Done talking: the take is being kept. */
  | { readonly kind: "finishing"; readonly seq: number }
  /** Kept, and home is hearing it. */
  | { readonly kind: "hearing"; readonly seq: number }
  /** Home heard these words in it. */
  | { readonly kind: "heard"; readonly words: string }
  /** Kept, where it is, and why home's words didn't come back. */
  | {
      readonly kind: "kept"
      readonly on: "home" | "phone"
      readonly why: "late" | "noWords" | "away"
    }

export type AnswerNotice =
  | "silent"
  | "notStarted"
  | "full"
  | "notKept"
  | { readonly refused: RecordingFailure }

export type AnswerState = {
  readonly voice: "checking" | "ready" | "unpaired" | "unavailable"
  readonly phase: AnswerPhase
  readonly notice: AnswerNotice | null
  readonly seq: number
}

export type AnswerEvent =
  | { readonly type: "opened" }
  | { readonly type: "talk" }
  | { readonly type: "stopTalking" }
  | { readonly type: "left" }
  /** The page hid (the app sent to the background). */
  | { readonly type: "hidden" }
  /** The phone holds no pairing with home. */
  | { readonly type: "unpaired" }
  | ListeningEvent

type Effect =
  | Exclude<ListeningEffect, { type: "listen" }>
  | {
      readonly type: "listen"
      readonly seq: number
    }

export type AnswerStep = {
  readonly state: AnswerState
  readonly effects: ReadonlyArray<Effect>
}

export const initialAnswer: AnswerState = {
  voice: "checking",
  phase: { kind: "idle" },
  notice: null,
  seq: 0,
}

const same = (state: AnswerState): AnswerStep => ({ state, effects: [] })

/** Whether a listening is under way, and it is `seq`. */
const isCurrent = (phase: AnswerPhase, seq: number): boolean =>
  (phase.kind === "recording" ||
    phase.kind === "finishing" ||
    phase.kind === "hearing") &&
  phase.seq === seq

export function step(state: AnswerState, event: AnswerEvent): AnswerStep {
  const { phase } = state
  switch (event.type) {
    case "opened": {
      return { state, effects: [{ type: "checkVoice" }] }
    }
    case "voiceChecked": {
      return same({
        ...state,
        voice: event.available ? "ready" : "unavailable",
      })
    }
    case "unpaired": {
      return same({ ...state, voice: "unpaired" })
    }
    case "talk": {
      if (state.voice !== "ready") return same(state)
      // While home hears the last take, it is kept: another may be said.
      if (phase.kind === "recording" || phase.kind === "finishing")
        return same(state)
      const seq = state.seq + 1
      return {
        state: {
          ...state,
          seq,
          notice: null,
          phase: { kind: "recording", seq, ready: false },
        },
        effects: [{ type: "listen", seq }],
      }
    }
    case "stopTalking":
    case "hidden": {
      return phase.kind === "recording"
        ? {
            state: { ...state, phase: { kind: "finishing", seq: phase.seq } },
            effects: [{ type: "stopListening" }],
          }
        : same(state)
    }
    case "left": {
      return isCurrent(phase, state.seq)
        ? {
            state: { ...state, phase: { kind: "idle" } },
            effects: [{ type: "cancelListening" }],
          }
        : same(state)
    }
    case "ready": {
      return phase.kind === "recording" && phase.seq === event.seq
        ? same({ ...state, phase: { ...phase, ready: true } })
        : same(state)
    }
    case "hearing": {
      return isCurrent(phase, event.seq)
        ? same({ ...state, phase: { kind: "hearing", seq: event.seq } })
        : same(state)
    }
    case "partial": {
      return same(state)
    }
    case "listened": {
      return isCurrent(phase, event.seq)
        ? same(ended(state, event.result))
        : same(state)
    }
    default: {
      return assertNever(event)
    }
  }
}

function ended(
  state: AnswerState,
  result: Extract<ListeningEvent, { type: "listened" }>["result"]
): AnswerState {
  const idle = { kind: "idle" } as const
  switch (result.kind) {
    case "heard": {
      return result.words.trim() === ""
        ? { ...state, phase: idle, notice: "silent" }
        : { ...state, phase: { kind: "heard", words: result.words } }
    }
    case "kept": {
      return {
        ...state,
        phase: { kind: "kept", on: result.on, why: result.why },
      }
    }
    case "unavailable": {
      return { ...state, phase: idle, voice: "unavailable" }
    }
    case "notStarted": {
      return { ...state, phase: idle, notice: "notStarted" }
    }
    case "failed": {
      return { ...state, phase: idle, notice: "notKept" }
    }
    case "notKept": {
      return {
        ...state,
        phase: idle,
        notice: result.why === "full" ? "full" : "notKept",
      }
    }
    case "refused": {
      return { ...state, phase: idle, notice: { refused: result.reason } }
    }
    default: {
      return assertNever(result)
    }
  }
}
