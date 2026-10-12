/**
 * One voice note, start to kept: the shared take (`./take`) and then the
 * save, as www's voice reflections and its scene notes both record.
 * `stepVoiceNote(state, event, limits)` returns the next state and the
 * effects to run, and does nothing else (docs/monorepo-boundaries.md,
 * "Inside a React package: the component is not the coordinator"); each
 * caller's runtime runs them and decides what a save keeps.
 *
 * - **One take at a time.** A second "start" while one is under way changes
 *   nothing.
 * - **What was said is kept.** Closing the sheet or leaving the session
 *   mid-take finishes it and keeps it, as the soundbites page does.
 * - **A microphone that opens too late is let go.** If the person left while
 *   it was opening, its arrival is discarded, never recorded.
 */
import { assertNever } from "@some-ui/core-utils"

import type { RecordingFailure, Take } from "./recorder"
import type {
  TakeEffect,
  TakeLimits,
  TakePhase,
  TakeSignal,
  TakeStep,
} from "./take"
import { discardTake, finishTake, openTake, stepTake } from "./take"

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

export type VoiceNoteEffect =
  | TakeEffect
  | { type: "save"; take: Take; atMs: number | null }

export const initialVoiceNote: VoiceNoteState = { kind: "idle", last: null }

type Next = { state: VoiceNoteState; effects: ReadonlyArray<VoiceNoteEffect> }

const stay = (state: VoiceNoteState): Next => ({ state, effects: [] })

/** Where a take's step leaves the voice reflection. */
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
