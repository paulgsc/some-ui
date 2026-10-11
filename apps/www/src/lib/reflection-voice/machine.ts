/**
 * One voice reflection, start to kept, as a state machine: `step(state,
 * event)` returns the next state and the effects to run, and does nothing
 * else (docs/monorepo-boundaries.md, "Inside a React package: the component
 * is not the coordinator"). `./runtime` runs the effects against the
 * microphone and the stores and feeds the results back in as events.
 *
 * - **One take at a time.** Opening, recording, finishing and saving are arms
 *   of one union; a second "start" while one is under way changes nothing.
 * - **What was said is kept.** Closing the sheet or leaving the session
 *   mid-take finishes it and keeps it, as the soundbites page does; only a
 *   take shorter than `SOUNDBITE_MIN_MS` (a stray tap) is let go.
 * - **A microphone that opens too late is let go.** If the person left while
 *   it was opening, its arrival is discarded, never recorded.
 * - **It stops itself at `SOUNDBITE_MAX_MS`**, and is kept.
 */
import {
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@some-ui/soundbites/contract"
import type { RecordingFailure, Take } from "@some-ui/voice-capture"

/** How the last take ended, said once beside the button. */
export type Outcome = "kept" | "short" | "full" | "failed"

export type VoiceState =
  | { readonly kind: "idle"; readonly last: Outcome | null }
  | { readonly kind: "opening"; readonly atMs: number | null }
  | {
      readonly kind: "recording"
      readonly atMs: number | null
      readonly startedAt: number
      readonly elapsedMs: number
    }
  | { readonly kind: "finishing"; readonly atMs: number | null }
  | { readonly kind: "saving" }
  | { readonly kind: "blocked"; readonly reason: RecordingFailure }

export type VoiceEvent =
  | { type: "start"; atMs: number | null }
  | { type: "micOpened"; at: number }
  | { type: "micFailed"; reason: RecordingFailure }
  | { type: "ticked"; now: number }
  | { type: "stop"; now: number }
  | { type: "left" }
  | { type: "taken"; take: Take }
  | { type: "takeFailed" }
  | { type: "saved"; outcome: Outcome }

export type VoiceEffect =
  | { type: "openMic" }
  | { type: "startClock" }
  | { type: "stopClock" }
  | { type: "finishTake" }
  | { type: "discardTake" }
  | { type: "save"; take: Take; atMs: number | null }

export const initialVoice: VoiceState = { kind: "idle", last: null }

type Next = { state: VoiceState; effects: Array<VoiceEffect> }

const stay = (state: VoiceState): Next => ({ state, effects: [] })

export function step(state: VoiceState, event: VoiceEvent): Next {
  switch (state.kind) {
    case "idle":
    case "blocked": {
      if (event.type === "start")
        return {
          state: { kind: "opening", atMs: event.atMs },
          effects: [{ type: "openMic" }],
        }
      // Opened after the person left: never record it.
      if (event.type === "micOpened")
        return { state, effects: [{ type: "discardTake" }] }
      return stay(state)
    }
    case "opening": {
      if (event.type === "micOpened")
        return {
          state: {
            kind: "recording",
            atMs: state.atMs,
            startedAt: event.at,
            elapsedMs: 0,
          },
          effects: [{ type: "startClock" }],
        }
      if (event.type === "micFailed")
        return stay({ kind: "blocked", reason: event.reason })
      if (event.type === "left") return stay({ kind: "idle", last: null })
      return stay(state)
    }
    case "recording": {
      if (event.type === "ticked") {
        const elapsedMs = event.now - state.startedAt
        if (elapsedMs >= SOUNDBITE_MAX_MS) return finish(state.atMs)
        return stay({ ...state, elapsedMs })
      }
      if (event.type === "stop" || event.type === "left") {
        if (
          event.type === "stop" &&
          event.now - state.startedAt < SOUNDBITE_MIN_MS
        )
          return {
            state: { kind: "idle", last: "short" },
            effects: [{ type: "stopClock" }, { type: "discardTake" }],
          }
        return finish(state.atMs)
      }
      return stay(state)
    }
    case "finishing": {
      if (event.type === "taken") {
        if (event.take.durationMs < SOUNDBITE_MIN_MS)
          return stay({ kind: "idle", last: "short" })
        return {
          state: { kind: "saving" },
          effects: [{ type: "save", take: event.take, atMs: state.atMs }],
        }
      }
      if (event.type === "takeFailed")
        return stay({ kind: "idle", last: "failed" })
      return stay(state)
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

function finish(atMs: number | null): Next {
  return {
    state: { kind: "finishing", atMs },
    effects: [{ type: "stopClock" }, { type: "finishTake" }],
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled voice state: ${JSON.stringify(value)}`)
}
