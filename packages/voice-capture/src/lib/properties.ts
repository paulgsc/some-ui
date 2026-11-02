/**
 * What every trace of takes on a phone keeps, as a monitor: a pure step
 * over what can be observed (each screen's take, the microphone, the audio
 * kept), returning the properties a trace broke. The property suite
 * (`@some-ui/voice-capture/testing`'s `runTakeScenario`) runs it over
 * generated traces of the real kit; CHECKS (CK3, #2369) can run the same
 * step over the phone's own trace.
 *
 * **VC2: every take that starts ends once, and its ending has words.**
 *
 * - _Claim:_ a take started through the take kit, or through
 *   `voiceNoteRuntime` or www's `lib/takes-desk`, reaches exactly one
 *   ending (`TakeEnding`), within the take's deadlines (VC1) and its cap,
 *   and every ending has a sentence (`TakeEndingWords`) in the snapshot a
 *   screen reads. On Rust Rounds' card it is on screen; each other screen
 *   joins when it moves to the take pattern (MIC4–MIC6).
 * - _Family:_ every trace of the scenario family (`takeScenarios`): taps
 *   (a start, a stop, a spurious second tap), leaving, the page hidden or
 *   shown, one to three screens, and per opening the microphone's answer
 *   (opens at once, late, past its deadline or never; refuses for each
 *   reason), its level, its length and bytes, and its finish (at once,
 *   late, past its deadline, never, failing), the keep's answer, and the
 *   clock running past the cap.
 * - _Proof:_ `take-kit.test.ts` ("VC2", "VC3") runs this monitor over
 *   generated traces of the real `takeKit`; www's
 *   `lib/takes-desk/__tests__/runtime.test.ts` ("VC2", "VC3") over the real
 *   desk; www's `lib/rust-rounds/index.test.tsx` over Rust Rounds on the
 *   real desk and the simulated microphone; `TakeEndingWords` and
 *   `VOICE_NOTE_SAID` are `Record`s over every ending. `voiceNoteRuntime`
 *   dispatches the same `stepVoiceNote` the kit embeds, so it is covered
 *   through the step until MIC5 moves its screens. The simulated
 *   microphone those run on is held to the real one by
 *   `tests/real-microphone` (MIC9): named cases on the real `micRecorder`
 *   in Chromium, which fail when the two end a case differently.
 *
 * **VC3: the phone's microphone is held by at most one take, only while
 * that take is under way, and audio is kept only for a take that was
 * kept.**
 *
 * - _Claim:_ at every quiet point of a trace (nothing left to run until
 *   the clock moves), at most one stream is open, and none is open and the
 *   phone's owner is free unless some screen has a take under way; once
 *   everything has ended, the audio kept is exactly that of the takes that
 *   ended `kept`. A second screen's start while a take holds the
 *   microphone ends `blocked`, `elsewhere`.
 * - _Tolerance:_ between quiet points, a microphone that opens after its
 *   take was let go is open until the same run of callbacks discards it.
 * - _Family:_ VC2's.
 * - _Proof:_ VC2's tests, which check every property on every trace.
 */
import { assertNever } from "@some-ui/core-utils"

import type { TakeEnding } from "./voice-note"

/** An ending as a screen says it. */
export type ObservedEnding = {
  readonly seq: number
  readonly ending: TakeEnding
  /** The kept take's id, when `ending` is `kept`. */
  readonly id: string | null
  /** The sentence the screen says for it. */
  readonly said: string
  /**
   * The screen left the take's item, and says nothing about it on purpose
   * (www's takes desk after `reset`): the one ending `silent` exempts.
   */
  readonly hushed?: boolean
}

export type TakeObservation =
  /** A screen's take changed. */
  | {
      readonly kind: "screen"
      readonly at: number
      readonly screen: string
      readonly underway: boolean
      readonly ended: ObservedEnding | null
    }
  /** Nothing is left to run until the clock moves. */
  | {
      readonly kind: "quiet"
      readonly at: number
      /** Streams the microphone has open. */
      readonly open: number
      /** Who the phone's owner says holds the microphone. */
      readonly holder: string | null
    }
  /** Everything has had time to end: every deadline and cap has passed. */
  | {
      readonly kind: "settled"
      readonly at: number
      readonly open: number
      readonly holder: string | null
      /** The ids whose audio is kept. */
      readonly audio: ReadonlyArray<string>
    }

export type TakeProperty =
  /** VC3: the microphone held while no take is under way. */
  | "held-idle"
  /** VC3: two streams open at once. */
  | "two-held"
  /** VC2: a take that started never ended. */
  | "no-ending"
  /** VC2: an ending with no take, or two for one. */
  | "extra-ending"
  /** VC2: an ending with no words. */
  | "silent"
  /** VC2: an ending past the deadlines and the cap. */
  | "late"
  /** VC3: audio kept for a take that did not end kept, or the reverse. */
  | "kept-mismatch"

export type TakeViolation = {
  readonly property: TakeProperty
  readonly at: number
  readonly detail: string
}

type ScreenWatch = {
  readonly underway: boolean
  /** When the take under way started, until it ends. */
  readonly startedAt: number | null
  readonly seq: number
}

export type TakeMonitor = {
  readonly screens: Readonly<Record<string, ScreenWatch>>
  /** Ids of takes that ended `kept`. */
  readonly kept: ReadonlyArray<string>
}

export const initialTakeMonitor: TakeMonitor = { screens: {}, kept: [] }

/** How long a take may take to end, from its start: every deadline and the cap. */
export type TakeBound = { readonly boundMs: number }

const IDLE: ScreenWatch = { underway: false, startedAt: null, seq: 0 }

export function stepTakeMonitor(
  monitor: TakeMonitor,
  observation: TakeObservation,
  bound: TakeBound
): {
  readonly monitor: TakeMonitor
  readonly violations: ReadonlyArray<TakeViolation>
} {
  const violations: Array<TakeViolation> = []
  const broke = (property: TakeProperty, detail: string): void => {
    violations.push({ property, at: observation.at, detail })
  }
  const { at } = observation
  const busy = Object.values(monitor.screens).some((each) => each.underway)

  switch (observation.kind) {
    case "screen": {
      const was = monitor.screens[observation.screen] ?? IDLE
      let { startedAt } = was
      let kept = monitor.kept
      if (!was.underway && observation.underway) {
        if (startedAt !== null)
          broke("no-ending", `${observation.screen}: started again unended`)
        startedAt = at
      }
      const seq = observation.ended?.seq ?? 0
      if (observation.ended !== null && seq !== was.seq) {
        const { ending, said, id, hushed } = observation.ended
        if (seq !== was.seq + 1 || startedAt === null)
          broke("extra-ending", `${observation.screen}: ending ${seq}`)
        if (hushed !== true && said.trim() === "")
          broke("silent", `${observation.screen}: ${ending}`)
        if (startedAt !== null && at - startedAt > bound.boundMs)
          broke("late", `${observation.screen}: ${ending} ${at - startedAt}ms`)
        if (ending === "kept" && id !== null) kept = [...kept, id]
        startedAt = null
      }
      return {
        monitor: {
          screens: {
            ...monitor.screens,
            [observation.screen]: {
              underway: observation.underway,
              startedAt,
              seq,
            },
          },
          kept,
        },
        violations,
      }
    }
    case "quiet":
    case "settled": {
      if (!busy && (observation.open > 0 || observation.holder !== null))
        broke(
          "held-idle",
          `${observation.open} open, held by ${observation.holder ?? "none"}`
        )
      if (observation.open > 1) broke("two-held", `${observation.open} open`)
      if (observation.kind === "settled") {
        for (const [screen, watch] of Object.entries(monitor.screens)) {
          if (watch.underway || watch.startedAt !== null)
            broke("no-ending", `${screen}: never ended`)
        }
        const audio = [...observation.audio].sort()
        const kept = [...monitor.kept].sort()
        if (audio.join() !== kept.join())
          broke("kept-mismatch", `audio ${audio.join()} kept ${kept.join()}`)
      }
      return { monitor, violations }
    }
    default: {
      return assertNever(observation)
    }
  }
}
