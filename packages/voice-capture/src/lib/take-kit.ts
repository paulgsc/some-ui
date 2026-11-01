/**
 * The take kit: what a screen uses to record. One take at a time, started and
 * stopped by a tap (D1), its phase, elapsed time against the cap and level
 * while it runs, and exactly one ending once it is over, which the kit
 * records in its own step: no layer above keeps a copy of "a take is under
 * way" or compares snapshots to find where one ended.
 *
 * - `stepTakeKit(state, event, limits)` is the pure step; it embeds the
 *   voice note's (`./voice-note`), which embeds the take's (`./take`).
 * - `takeKit(ports, limits)` runs it over ports: the microphone
 *   (`takeRunner`, through the phone's one owner, `./owner`), the clock,
 *   and `keep`, which is the screen's: where a take's audio is kept and
 *   under which id.
 *
 * A screen's parameters, not copies: what each take answers (`start`'s
 * `answers`, carried to its ending), the cap and the minimum (`limits`).
 * One current take or many, Redo, Let go and playing a take back are the
 * take pattern's (`./take-pattern`), which embeds this step.
 *
 * The properties every trace of the kit keeps (VC2, VC3) are `./properties`.
 */
import { assertNever } from "@some-ui/core-utils"

import type { MicOwner } from "./owner"
import type { RecordingFailure, StartRecording, Take } from "./recorder"
import { RECORDING_FAILURE_COPY } from "./recorder"
import type { TakeDeadlines, TakeLimits, TakeSignal } from "./take"
import { takeRunner } from "./take"
import type {
  TakeEnding,
  VoiceNoteEffect,
  VoiceNoteEvent,
  VoiceNoteOutcome,
  VoiceNoteState,
} from "./voice-note"
import {
  initialVoiceNote,
  stepVoiceNote,
  takeEnding,
  VOICE_NOTE_SAID,
} from "./voice-note"

/** How the last take ended: one per take, `seq` counting them. */
export type TakeEnded = {
  readonly seq: number
  /** What the take answers: `start`'s `answers`. */
  readonly answers: string
  readonly ending: TakeEnding
  /** Where `keep` put it, when `ending` is `kept`. */
  readonly id: string | null
  /** Why the microphone refused it, when `ending` is `blocked`. */
  readonly reason: RecordingFailure | null
}

export type TakeKitState = {
  readonly note: VoiceNoteState
  /** What the take under way, or the last one, answers. */
  readonly answers: string
  /** The id `keep` gave the take being kept. */
  readonly keptId: string | null
  readonly ended: TakeEnded | null
}

/** What `keep` answers: the take's id once kept, or why it was not. */
export type KeepResult =
  | { readonly outcome: "kept"; readonly id: string }
  | { readonly outcome: Extract<VoiceNoteOutcome, "full" | "failed"> }

export type TakeKitEvent =
  | { readonly type: "start"; readonly answers: string }
  /** D1: a tap starts a take when none is under way, and stops one that is. */
  | { readonly type: "tap"; readonly answers: string }
  | { readonly type: "stop" }
  /** The screen went: a take under way is kept. */
  | { readonly type: "left" }
  | TakeSignal
  | { readonly type: "kept"; readonly result: KeepResult }

export type TakeKitEffect =
  | Exclude<VoiceNoteEffect, { type: "save" }>
  | { readonly type: "keep"; readonly take: Take; readonly answers: string }

export const initialTakeKit: TakeKitState = {
  note: initialVoiceNote,
  answers: "",
  keptId: null,
  ended: null,
}

/** A take is under way from its start until its ending. */
function underway(note: VoiceNoteState): boolean {
  return note.kind === "taking" || note.kind === "saving"
}

type Next = {
  readonly state: TakeKitState
  readonly effects: ReadonlyArray<TakeKitEffect>
}

export function stepTakeKit(
  state: TakeKitState,
  event: TakeKitEvent,
  limits: TakeLimits
): Next {
  const busy = underway(state.note)
  let { answers, keptId } = state
  let noteEvent: VoiceNoteEvent
  switch (event.type) {
    case "start":
    case "tap": {
      if (busy) {
        if (event.type === "start") return { state, effects: [] }
        noteEvent = { type: "stop" }
      } else {
        answers = event.answers
        keptId = null
        noteEvent = { type: "start", atMs: null }
      }
      break
    }
    case "kept": {
      const { result } = event
      keptId = result.outcome === "kept" ? result.id : null
      noteEvent = { type: "saved", outcome: result.outcome }
      break
    }
    case "stop":
    case "left":
    case "micOpened":
    case "micFailed":
    case "ticked":
    case "taken":
    case "takeFailed": {
      noteEvent = event
      break
    }
    default: {
      return assertNever(event)
    }
  }
  const next = stepVoiceNote(state.note, noteEvent, limits)
  const effects = next.effects.map(
    (effect): TakeKitEffect =>
      effect.type === "save"
        ? { type: "keep", take: effect.take, answers }
        : effect
  )
  const ending = busy && !underway(next.state) ? takeEnding(next.state) : null
  const ended: TakeEnded | null =
    ending === null
      ? state.ended
      : {
          seq: (state.ended?.seq ?? 0) + 1,
          answers,
          ending,
          id: ending === "kept" ? keptId : null,
          reason: next.state.kind === "blocked" ? next.state.reason : null,
        }
  if (
    next.state === state.note &&
    ended === state.ended &&
    answers === state.answers &&
    keptId === state.keptId
  ) {
    return { state, effects }
  }
  return { state: { note: next.state, answers, keptId, ended }, effects }
}

/** A take as a screen shows it: the button, the time against the cap, the level. */
export type TakeKitView =
  | { readonly kind: "idle" }
  | { readonly kind: "opening" }
  | {
      readonly kind: "recording"
      readonly elapsedMs: number
      readonly capMs: number
      /** How loud the input is, 0 (silence) to 1. */
      readonly level: number
    }
  /** Stopped; being kept. */
  | { readonly kind: "keeping" }

export function takeKitView(
  state: TakeKitState,
  limits: TakeLimits
): TakeKitView {
  const { note } = state
  if (note.kind === "saving") return { kind: "keeping" }
  if (note.kind !== "taking") return { kind: "idle" }
  const { phase } = note
  switch (phase.kind) {
    case "opening": {
      return { kind: "opening" }
    }
    case "recording": {
      return {
        kind: "recording",
        elapsedMs: phase.elapsed,
        capMs: limits.maxMs,
        level: phase.level,
      }
    }
    case "finishing": {
      return { kind: "keeping" }
    }
    default: {
      return assertNever(phase)
    }
  }
}

/**
 * A screen's words for every ending: a sentence for each, and the
 * microphone's refusal by its reason. Closed: an ending added to
 * `TakeEnding` fails to compile in every table until it has words.
 */
export type TakeEndingWords = {
  readonly [Ending in Exclude<TakeEnding, "blocked">]: string
} & { readonly blocked: (reason: RecordingFailure) => string }

/** The shared words, which a screen's table may start from. */
export const TAKE_ENDING_WORDS: TakeEndingWords = {
  ...VOICE_NOTE_SAID,
  blocked: (reason) => RECORDING_FAILURE_COPY[reason],
}

/** How `ended` is said in `words`. */
export function takeEndingSaid(
  words: TakeEndingWords,
  ended: TakeEnded
): string {
  if (ended.ending === "blocked") return words.blocked(ended.reason ?? "failed")
  return words[ended.ending]
}

export type TakeKitSnapshot = {
  readonly take: TakeKitView
  /** The last take to end, kept until the next one ends. */
  readonly ended: TakeEnded | null
  /** Why the microphone refuses, while it does. */
  readonly blocked: RecordingFailure | null
}

export type TakeKit = {
  /** The same object while nothing changed. */
  readonly getSnapshot: () => TakeKitSnapshot
  readonly subscribe: (listener: () => void) => () => void
  /** D1's gesture: starts a take answering `answers`, or stops the one under way. */
  readonly tap: (answers: string) => void
  /** Starts a take answering `answers`; nothing while one is under way. */
  readonly start: (answers: string) => void
  /** Stops the take under way and keeps it. */
  readonly stop: () => void
  /** The screen went: a take under way is kept. */
  readonly leave: () => void
}

export type TakeKitPorts = {
  readonly startRecording: StartRecording
  /** Milliseconds since the epoch. */
  readonly now: () => number
  /**
   * Keeps a take's audio under an id of its own, then says how it went,
   * once. The kit records the ending; this decides only what is kept.
   */
  readonly keep: (
    take: Take,
    answers: string,
    done: (result: KeepResult) => void
  ) => void
  /** Defaults to the phone's one microphone. */
  readonly owner?: MicOwner | undefined
  /** Defaults to `takeRunner`'s own. */
  readonly deadlines?: TakeDeadlines | undefined
  /** How often the level and elapsed time are read while recording. */
  readonly tickMs?: number | undefined
}

const TICK_MS = 200

/**
 * Runs `stepTakeKit` over the ports: it holds the microphone through
 * `takeRunner`, hands a finished take to `keep`, and decides nothing.
 */
export function takeKit(ports: TakeKitPorts, limits: TakeLimits): TakeKit {
  let state = initialTakeKit
  const listeners = new Set<() => void>()
  const snapshotOf = (): TakeKitSnapshot => ({
    take: takeKitView(state, limits),
    ended: state.ended,
    blocked: state.note.kind === "blocked" ? state.note.reason : null,
  })
  let snapshot = snapshotOf()

  const dispatch = (event: TakeKitEvent): void => {
    const next = stepTakeKit(state, event, limits)
    if (next.state !== state) {
      state = next.state
      snapshot = snapshotOf()
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) {
      if (effect.type === "keep") {
        let answered = false
        ports.keep(effect.take, effect.answers, (result) => {
          if (answered) return
          answered = true
          dispatch({ type: "kept", result })
        })
      } else {
        runner.run(effect)
      }
    }
  }

  const runner = takeRunner(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      tickMs: ports.tickMs ?? TICK_MS,
      deadlines: ports.deadlines,
      owner: ports.owner,
    },
    dispatch
  )

  return {
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    tap: (answers) => dispatch({ type: "tap", answers }),
    start: (answers) => dispatch({ type: "start", answers }),
    stop: () => dispatch({ type: "stop" }),
    leave: () => dispatch({ type: "left" }),
  }
}
