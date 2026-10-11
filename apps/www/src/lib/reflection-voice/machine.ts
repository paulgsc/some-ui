/**
 * One voice reflection, start to kept: the shared take (`@some-ui/voice-capture`,
 * which the soundbites page runs too) and then the save. `step(state, event)`
 * returns the next state and the effects to run, and does nothing else
 * (docs/monorepo-boundaries.md, "Inside a React package: the component is not
 * the coordinator"); `./runtime` runs them.
 *
 * - **One take at a time.** A second "start" while one is under way changes
 *   nothing.
 * - **What was said is kept.** Closing the sheet or leaving the session
 *   mid-take finishes it and keeps it, as the soundbites page does.
 * - **A microphone that opens too late is let go.** If the person left while
 *   it was opening, its arrival is discarded, never recorded.
 */
import { assertNever } from "@some-ui/core-utils"
import {
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@some-ui/soundbites/contract"
import type {
  RecordingFailure,
  Take,
  TakeEffect,
  TakePhase,
  TakeSignal,
  TakeStep,
} from "@some-ui/voice-capture"
import {
  discardTake,
  finishTake,
  openTake,
  stepTake,
} from "@some-ui/voice-capture"

const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS }

/** How the last take ended, said once beside the button. */
export type Outcome = "kept" | "short" | "full" | "failed"

export type VoiceState =
  | { readonly kind: "idle"; readonly last: Outcome | null }
  | { readonly kind: "blocked"; readonly reason: RecordingFailure }
  | {
      readonly kind: "taking"
      readonly phase: TakePhase
      readonly atMs: number | null
    }
  | { readonly kind: "saving" }

export type VoiceEvent =
  | { type: "start"; atMs: number | null }
  | { type: "stop" }
  | { type: "left" }
  | TakeSignal
  | { type: "saved"; outcome: Outcome }

export type VoiceEffect =
  | TakeEffect
  | { type: "save"; take: Take; atMs: number | null }

export const initialVoice: VoiceState = { kind: "idle", last: null }

type Next = { state: VoiceState; effects: ReadonlyArray<VoiceEffect> }

const stay = (state: VoiceState): Next => ({ state, effects: [] })

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

export function step(state: VoiceState, event: VoiceEvent): Next {
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
      return after(stepTake(phase, event, LIMITS), atMs)
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
