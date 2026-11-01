/**
 * The cases the real recorder runs in Chromium (MIC9, #2379), each a
 * scenario of the family (`takeScenarios`) played twice: once with the real
 * `micRecorder` hearing a clip as Chromium's microphone, once with the
 * simulated microphone scripted as that clip (`CLIP_SCRIPTS`). The suite
 * fails when the two end differently, which is what keeps the simulated one
 * honest.
 *
 * Shared by the page (`page/main.ts`), which plays them, and the spec,
 * which checks what came back.
 */
import type { TakeEnding } from "@voice-capture/index"
import type {
  MicScript,
  ScenarioStep,
  TakeScenario,
} from "@voice-capture/testing"

/** The clips under `clips/`, one per Chromium launch. */
export type Clip = "speech" | "silence"

/** How long each clip runs (`clips/make-clips.ts`). */
export const CLIP_MS = 2_000

/**
 * The simulated microphone as each clip: opens after a moment, as
 * Chromium's fake device does, hears talking (`SPEAKING`'s level) or
 * nothing, and hands back bytes at once.
 */
export const CLIP_SCRIPTS: Readonly<Record<Clip, MicScript>> = {
  speech: {
    open: { kind: "after", ms: 50 },
    finish: { kind: "after", ms: 0 },
    level: 0.3,
    bytes: 5,
  },
  silence: {
    open: { kind: "after", ms: 50 },
    finish: { kind: "after", ms: 0 },
    level: 0,
    bytes: 5,
  },
}

export type TakeCase = {
  readonly name: string
  readonly clip: Clip
  readonly steps: ReadonlyArray<ScenarioStep>
  /** How each take ends, in order, on both microphones. */
  readonly ends: ReadonlyArray<TakeEnding>
  /** The real take's checks: about the clip's length, heard or not. */
  readonly take?: { readonly heard: boolean } | undefined
}

const TAP: ScenarioStep = { type: "tap", screen: 0 }
const wait = (ms: number): ScenarioStep => ({ type: "wait", ms })

export const TAKE_CASES: ReadonlyArray<TakeCase> = [
  {
    name: "a take of talking is kept, with its bytes, its length and its peak",
    clip: "speech",
    steps: [TAP, wait(CLIP_MS), TAP, wait(1_000)],
    ends: ["kept"],
    take: { heard: true },
  },
  {
    name: "a take of silence is kept and said unheard",
    clip: "silence",
    steps: [TAP, wait(CLIP_MS), TAP, wait(1_000)],
    ends: ["kept"],
    take: { heard: false },
  },
  {
    name: "a stop before the microphone opens ends early",
    clip: "speech",
    steps: [TAP, TAP, wait(1_000)],
    ends: ["early"],
  },
  {
    name: "a page hidden mid-take keeps the take",
    clip: "speech",
    steps: [TAP, wait(1_000), { type: "hide" }, wait(1_000), { type: "show" }],
    ends: ["kept"],
  },
]

/**
 * The case as a scenario, on one screen. Its `mic` is empty: each run
 * brings its own microphone (`page.ts`), the simulated one answering every
 * opening as the clip's script.
 */
export function scenarioOf(take: TakeCase): TakeScenario {
  return { screens: 1, mic: [], keeps: [], steps: take.steps }
}

/** A take as the microphone handed it over. */
export type TakeSeen = {
  readonly bytes: number
  readonly mimeType: string
  readonly durationMs: number
  /** The audio's own length, decoded; null where it does not decode. */
  readonly decodedMs: number | null
  /** The loudest measured level the kit read; null while none was measured. */
  readonly peak: number | null
}

/** One case played on one microphone. */
export type SideRun = {
  /** Each ending, in order, as the screen said it. */
  readonly endings: ReadonlyArray<{
    readonly ending: TakeEnding
    readonly said: string
  }>
  /** VC2 and VC3 (`src/lib/properties.ts`), as the trace broke them. */
  readonly violations: ReadonlyArray<string>
  readonly takes: ReadonlyArray<TakeSeen>
  /** Streams still open once everything has ended. */
  readonly open: number
}

export type CaseRun = {
  readonly real: SideRun & {
    /** Every track the real microphone handed out, by `readyState`. */
    readonly tracks: ReadonlyArray<MediaStreamTrackState>
  }
  readonly simulated: SideRun
  /** `HEARD_FLOOR`, as the page was built with it. */
  readonly floor: number
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- augmenting `Window` needs an interface
  interface Window {
    /** Set by `page.ts`: plays the case named on both microphones. */
    playTakeCase?: (name: string) => Promise<CaseRun>
  }
}
