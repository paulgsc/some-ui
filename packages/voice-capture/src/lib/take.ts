/**
 * One take, opening the microphone to a kept recording, as pure rules any
 * machine embeds (the soundbites page's, a voice reflection's): which phase
 * it is in, what each signal from the microphone and the clock does to it,
 * and when it ends and how. The embedding machine keeps everything else (what
 * a take is for, where it is kept, whether the page is on screen) and runs
 * the effects through `takeRunner`.
 *
 * - A take stops itself at `maxMs`, and is finished, not thrown away.
 * - A take shorter than `minMs`, or one that came back with no bytes (a
 *   recorder that ran but wrote nothing), ends `short`: nothing to keep.
 * - Finishing keeps what was said; discarding keeps nothing.
 */
import { assertNever } from "@some-ui/core-utils"
import type { ForeignFailure, ForeignPort } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import type {
  Recording,
  RecordingFailure,
  StartRecording,
  Take,
} from "./recorder"
import { RecordingError } from "./recorder"

export type TakeLimits = { readonly minMs: number; readonly maxMs: number }

export type TakePhase =
  | { readonly kind: "opening" }
  | {
      readonly kind: "recording"
      readonly startedAt: number
      readonly elapsed: number
      readonly level: number
    }
  /** Stopped; waiting for the recorder to hand the take over. */
  | { readonly kind: "finishing" }

/** What the microphone and the clock report, through `takeRunner`. */
export type TakeSignal =
  | { readonly type: "micOpened"; readonly at: number }
  | { readonly type: "micFailed"; readonly reason: RecordingFailure }
  | { readonly type: "ticked"; readonly now: number; readonly level: number }
  | { readonly type: "taken"; readonly take: Take }
  | { readonly type: "takeFailed" }

export type TakeEffect =
  | { readonly type: "openMic" }
  | { readonly type: "startClock" }
  | { readonly type: "stopClock" }
  | { readonly type: "finishTake" }
  | { readonly type: "discardTake" }

export type TakeStep = {
  readonly effects: ReadonlyArray<TakeEffect>
} & (
  | { readonly kind: "taking"; readonly phase: TakePhase }
  | { readonly kind: "kept"; readonly take: Take }
  | { readonly kind: "short" }
  | { readonly kind: "failed" }
  | { readonly kind: "blocked"; readonly reason: RecordingFailure }
  | { readonly kind: "discarded" }
)

const taking = (
  phase: TakePhase,
  effects: ReadonlyArray<TakeEffect> = []
): TakeStep => ({ kind: "taking", phase, effects })

/** A new take: the microphone is asked for. */
export function openTake(): TakeStep {
  return taking({ kind: "opening" }, [{ type: "openMic" }])
}

/** Stop and keep what was said; only a recording take has anything. */
export function finishTake(phase: TakePhase): TakeStep {
  if (phase.kind !== "recording") return taking(phase)
  return taking({ kind: "finishing" }, [
    { type: "stopClock" },
    { type: "finishTake" },
  ])
}

/**
 * Stop and keep nothing. A microphone still opening is the embedding
 * machine's to let go when it arrives: answer its `micOpened` with
 * `{ type: "discardTake" }` once this take is no longer wanted.
 */
export function discardTake(phase: TakePhase): TakeStep {
  if (phase.kind === "recording")
    return {
      kind: "discarded",
      effects: [{ type: "stopClock" }, { type: "discardTake" }],
    }
  if (phase.kind === "opening") return { kind: "discarded", effects: [] }
  return taking(phase)
}

export function stepTake(
  phase: TakePhase,
  signal: TakeSignal,
  limits: TakeLimits
): TakeStep {
  switch (signal.type) {
    case "micOpened": {
      if (phase.kind !== "opening") return taking(phase)
      return taking(
        { kind: "recording", startedAt: signal.at, elapsed: 0, level: 0 },
        [{ type: "startClock" }]
      )
    }
    case "micFailed": {
      if (phase.kind !== "opening") return taking(phase)
      return { kind: "blocked", reason: signal.reason, effects: [] }
    }
    case "ticked": {
      if (phase.kind !== "recording") return taking(phase)
      const ms = signal.now - phase.startedAt
      const ticked = {
        ...phase,
        elapsed: Math.min(ms, limits.maxMs),
        level: signal.level,
      }
      return ms >= limits.maxMs ? finishTake(ticked) : taking(ticked)
    }
    case "taken": {
      if (phase.kind !== "finishing") return taking(phase)
      const { take } = signal
      if (take.durationMs < limits.minMs || take.blob.size === 0)
        return { kind: "short", effects: [] }
      return { kind: "kept", take, effects: [] }
    }
    case "takeFailed": {
      if (phase.kind !== "finishing") return taking(phase)
      return { kind: "failed", effects: [] }
    }
    default: {
      return assertNever(signal)
    }
  }
}

/**
 * How long the microphone may take to open: Android's prompt the first
 * time waits on a person, so a long while, but not for ever.
 */
const OPEN_DEADLINE_MS = 60_000

const FINISH_DEADLINE_MS = 15_000

/** How long `takeRunner` waits on the microphone; tests shorten it. */
export type TakeDeadlines = {
  readonly openMs: number
  readonly finishMs: number
}

/**
 * The microphone as `callForeign` meets it. Its refusals are its own to
 * report (`recorder.ts`); a deadline is this runner's, so only that is
 * reported here.
 */
const MICROPHONE: ForeignPort = {
  name: "microphone (a take)",
  classify: (error) =>
    error instanceof ForeignDeadlineError
      ? {
          kind: "unreachable",
          retryable: true,
          summary: "The microphone didn't answer in time.",
        }
      : {
          kind: "unknown",
          retryable: true,
          summary: "The microphone didn't work.",
        },
  report: (failure: ForeignFailure) => {
    if (failure.error.cause instanceof ForeignDeadlineError) {
      reportFailure(failure)
    }
  },
}

/**
 * Runs a take's effects against the microphone and the clock: holds the
 * recording and the interval, and reports each result as a `TakeSignal`.
 * Which signals still matter is the machine's to decide.
 *
 * VC1: every wait on the microphone settles within its deadline
 * (`OPEN_DEADLINE_MS`, `FINISH_DEADLINE_MS`), as `micFailed` or
 * `takeFailed` when it doesn't answer, and a microphone that opens after
 * its deadline is let go at once, never left recording.
 */
export function takeRunner(
  ports: {
    startRecording: StartRecording
    /** Milliseconds since the epoch. */
    now: () => number
    tickMs: number
    /** Defaults `OPEN_DEADLINE_MS` and `FINISH_DEADLINE_MS`. */
    deadlines?: TakeDeadlines | undefined
  },
  signal: (signal: TakeSignal) => void
): { run: (effect: TakeEffect) => void } {
  let recording: Recording | null = null
  let clock: ReturnType<typeof setInterval> | null = null
  const stopClock = (): void => {
    if (clock !== null) clearInterval(clock)
    clock = null
  }

  return {
    run(effect): void {
      switch (effect.type) {
        case "openMic": {
          const call = callForeign<Recording>({
            port: MICROPHONE,
            deadlineMs: ports.deadlines?.openMs ?? OPEN_DEADLINE_MS,
            start: async (late) => {
              const opened = await ports.startRecording()
              // Opened after its deadline: nothing waits for it any more.
              if (late.aborted) opened.discard()
              return opened
            },
          })
          void call.outcome.then((outcome) => {
            if (outcome.status === "succeeded") {
              recording?.discard()
              recording = outcome.value
              signal({ type: "micOpened", at: ports.now() })
            } else if (outcome.status === "failed") {
              const { cause } = outcome.error
              signal({
                type: "micFailed",
                reason:
                  cause instanceof RecordingError ? cause.reason : "failed",
              })
            }
          })
          return
        }
        case "startClock": {
          stopClock()
          clock = setInterval(
            () =>
              signal({
                type: "ticked",
                now: ports.now(),
                level: recording?.level() ?? 0,
              }),
            ports.tickMs
          )
          return
        }
        case "stopClock": {
          stopClock()
          return
        }
        case "finishTake": {
          const finishing = recording
          recording = null
          if (finishing === null) {
            signal({ type: "takeFailed" })
            return
          }
          const call = callForeign<Take>({
            port: MICROPHONE,
            deadlineMs: ports.deadlines?.finishMs ?? FINISH_DEADLINE_MS,
            start: () => finishing.finish(),
          })
          void call.outcome.then((outcome) =>
            signal(
              outcome.status === "succeeded"
                ? { type: "taken", take: outcome.value }
                : { type: "takeFailed" }
            )
          )
          return
        }
        case "discardTake": {
          recording?.discard()
          recording = null
          return
        }
        default: {
          assertNever(effect)
        }
      }
    },
  }
}
