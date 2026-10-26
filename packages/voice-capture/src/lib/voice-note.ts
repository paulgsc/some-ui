/**
 * One voice note, start to kept: the shared take (`./take`) and then the
 * save. `stepVoiceNote(state, event, limits)` returns the next state and the
 * effects to run, and does nothing else (docs/monorepo-boundaries.md,
 * "Inside a React package: the component is not the coordinator");
 * `voiceNoteRuntime` runs them, and its caller decides what a save keeps.
 *
 * - **One take at a time.** A second "start" while one is under way changes
 *   nothing.
 * - **What was said is kept.** Closing the sheet or leaving the session
 *   mid-take finishes it and keeps it, as the soundbites page does.
 * - **A microphone that opens too late is let go.** If the person left while
 *   it was opening, its arrival is discarded, never recorded.
 */
import { assertNever } from "@some-ui/core-utils"

import type { BlobShelf } from "./blob-shelf"
import { ShelfFullError } from "./blob-shelf"
import type { RecordingFailure, StartRecording, Take } from "./recorder"
import { RECORDING_FAILURE_COPY } from "./recorder"
import type {
  TakeEffect,
  TakeLimits,
  TakePhase,
  TakeSignal,
  TakeStep,
} from "./take"
import { discardTake, finishTake, openTake, stepTake, takeRunner } from "./take"

/** How the last take ended, said once beside the button. */
export type VoiceNoteOutcome = "kept" | "short" | "full" | "failed"

export type VoiceNoteState =
  | { readonly kind: "idle"; readonly last: VoiceNoteOutcome | null }
  | { readonly kind: "blocked"; readonly reason: RecordingFailure }
  | {
      readonly kind: "taking"
      readonly phase: TakePhase
      readonly atMs: number | null
    }
  | { readonly kind: "saving" }

export type VoiceNoteEvent =
  | { type: "start"; atMs: number | null }
  | { type: "stop" }
  | { type: "left" }
  | TakeSignal
  | { type: "saved"; outcome: VoiceNoteOutcome }

type VoiceNoteEffect =
  | TakeEffect
  | { type: "save"; take: Take; atMs: number | null }

export const initialVoiceNote: VoiceNoteState = { kind: "idle", last: null }

type Next = { state: VoiceNoteState; effects: ReadonlyArray<VoiceNoteEffect> }

const stay = (state: VoiceNoteState): Next => ({ state, effects: [] })

/** Where a take's step leaves the voice note. */
function after(next: TakeStep, atMs: number | null): Next {
  const { effects } = next
  switch (next.kind) {
    case "taking": {
      return { state: { kind: "taking", phase: next.phase, atMs }, effects }
    }
    case "kept": {
      return {
        state: { kind: "saving" },
        effects: [...effects, { type: "save", take: next.take, atMs }],
      }
    }
    case "short":
    case "failed": {
      return { state: { kind: "idle", last: next.kind }, effects }
    }
    case "blocked": {
      return { state: { kind: "blocked", reason: next.reason }, effects }
    }
    case "discarded": {
      return { state: { kind: "idle", last: null }, effects }
    }
    default: {
      return assertNever(next)
    }
  }
}

export function stepVoiceNote(
  state: VoiceNoteState,
  event: VoiceNoteEvent,
  limits: TakeLimits
): Next {
  switch (state.kind) {
    case "idle":
    case "blocked": {
      if (event.type === "start") return after(openTake(), event.atMs)
      // Opened after the take was let go: never record it.
      if (event.type === "micOpened")
        return { state, effects: [{ type: "discardTake" }] }
      return stay(state)
    }
    case "taking": {
      const { phase, atMs } = state
      if (event.type === "start" || event.type === "saved") return stay(state)
      if (event.type === "stop" || event.type === "left")
        return after(
          phase.kind === "opening" ? discardTake(phase) : finishTake(phase),
          atMs
        )
      return after(stepTake(phase, event, limits), atMs)
    }
    case "saving": {
      if (event.type === "saved")
        return stay({ kind: "idle", last: event.outcome })
      return stay(state)
    }
    default: {
      return assertNever(state)
    }
  }
}

/** How a take ended, in a sentence said once beside the button. */
export const VOICE_NOTE_SAID: Readonly<Record<VoiceNoteOutcome, string>> = {
  kept: "Kept.",
  short: "Too short to keep. Tap, talk, then tap again.",
  full: "There's no room for another voice note.",
  failed: "Couldn't keep that one. Try again.",
}

/** A voice note's take as a screen shows it. */
export type TakeView =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "recording"; elapsedMs: number }
  | { kind: "keeping" }

export function takeView(state: VoiceNoteState): TakeView {
  if (state.kind === "saving") return { kind: "keeping" }
  if (state.kind !== "taking") return { kind: "idle" }
  const { phase } = state
  if (phase.kind === "opening") return { kind: "opening" }
  if (phase.kind === "recording") {
    return { kind: "recording", elapsedMs: phase.elapsed }
  }
  return { kind: "keeping" }
}

/**
 * What is said beside the button: why no take can start, or how the last
 * one ended, unless `quiet` (something since made it moot).
 */
export function voiceNoteSaid(
  state: VoiceNoteState,
  quiet: boolean
): string | null {
  if (state.kind === "blocked") return RECORDING_FAILURE_COPY[state.reason]
  return state.kind === "idle" && state.last !== null && !quiet
    ? VOICE_NOTE_SAID[state.last]
    : null
}

/**
 * Keeps a take as a voice note: its audio on `audio` first, then its entry,
 * through `list`, so an entry always has its audio; an entry that cannot be
 * listed takes its audio back out. `saved` hears how it ended. `saving`
 * marks the audio in flight, so a sweep leaves it be.
 */
export function shelveTake(
  ports: {
    audio: BlobShelf
    saving: (id: string, inFlight: boolean) => void
  },
  id: string,
  take: Take,
  list: () => boolean,
  saved: (outcome: VoiceNoteOutcome) => void
): void {
  ports.saving(id, true)
  ports.audio.put(id, take.blob).then(
    () => {
      ports.saving(id, false)
      const listed = list()
      // Ignored: audio no note names is cleared by its owner's sweep.
      if (!listed) ports.audio.remove([id]).catch(() => undefined)
      saved(listed ? "kept" : "failed")
    },
    (error: unknown) => {
      ports.saving(id, false)
      saved(error instanceof ShelfFullError ? "full" : "failed")
    }
  )
}

export type VoiceNoteRuntime = {
  getSnapshot: () => VoiceNoteState
  subscribe: (listener: () => void) => () => void
  /** `atMs`: where in what is being noted the take starts, if anywhere. */
  start: (atMs: number | null) => void
  stop: () => void
  /** The screen closed: a take under way is kept. */
  leave: () => void
}

const TICK_MS = 200

/**
 * Runs `stepVoiceNote` against the microphone and the clock: holds the
 * recording, turns each effect into a call on a port and each result into an
 * event. It decides nothing, and leaves the save to `save`, which says how
 * it ended.
 */
export function voiceNoteRuntime(
  ports: {
    startRecording: StartRecording
    /** Milliseconds since the epoch. */
    now: () => number
    save: (
      take: Take,
      atMs: number | null,
      saved: (outcome: VoiceNoteOutcome) => void
    ) => void
  },
  limits: TakeLimits
): VoiceNoteRuntime {
  let state: VoiceNoteState = initialVoiceNote
  const listeners = new Set<() => void>()

  const dispatch = (event: VoiceNoteEvent): void => {
    const next = stepVoiceNote(state, event, limits)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) {
      if (effect.type === "save") {
        ports.save(effect.take, effect.atMs, (outcome) =>
          dispatch({ type: "saved", outcome })
        )
      } else {
        take.run(effect)
      }
    }
  }

  const take = takeRunner(
    { startRecording: ports.startRecording, now: ports.now, tickMs: TICK_MS },
    dispatch
  )

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    start: (atMs) => dispatch({ type: "start", atMs }),
    stop: () => dispatch({ type: "stop" }),
    leave: () => dispatch({ type: "left" }),
  }
}
