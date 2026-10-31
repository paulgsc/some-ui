/**
 * The scenario family (MIC1, #2371): every trace of a person, a page and a
 * microphone that the takes on a phone must survive, as a fast-check
 * arbitrary, and the runner that plays one trace against real screens and
 * checks every property (`../lib/properties.ts`, VC2 and VC3) on it.
 *
 * The owner's cases are points in it: the happy path (tap, speak, tap),
 * many screens, never stopping (the cap ends it, kept), silence (level 0),
 * a spurious cancel (a second tap while the microphone opens), and a
 * microphone that is late, never answers or refuses.
 *
 * The runner moves time only through `advance`, the test's fake clock
 * (vitest's `vi.advanceTimersByTimeAsync`), so nothing here depends on a
 * test framework.
 */
import { assertNever } from "@some-ui/core-utils"
import fc from "fast-check"

import type { MicOwner } from "./owner"
import { microphoneOwner } from "./owner"
import type {
  ObservedEnding,
  TakeMonitor,
  TakeObservation,
  TakeViolation,
} from "./properties"
import { initialTakeMonitor, stepTakeMonitor } from "./properties"
import type { RecordingFailure, StartRecording } from "./recorder"
import type { MicScript, SimulatedMicrophone } from "./simulated-microphone"
import { simulatedMicrophone } from "./simulated-microphone"
import type { TakeDeadlines, TakeLimits } from "./take"
import type {
  KeepResult,
  TakeEndingWords,
  TakeKit,
  TakeKitPorts,
} from "./take-kit"
import { TAKE_ENDING_WORDS, takeEndingSaid } from "./take-kit"

/** What the person and the page do, one at a time. */
export type ScenarioStep =
  /** A tap on a screen's take button: start, or stop. */
  | { readonly type: "tap"; readonly screen: number }
  /** The screen goes away. */
  | { readonly type: "leave"; readonly screen: number }
  /** The page is hidden: every screen goes away, as each screen does. */
  | { readonly type: "hide" }
  /** The page comes back. */
  | { readonly type: "show" }
  /** Time passes: level ticks, deadlines, the cap. */
  | { readonly type: "wait"; readonly ms: number }

/** How the screen's keep answers one take. */
export type KeepScript = {
  readonly outcome: KeepResult["outcome"]
  readonly ms: number
}

export type TakeScenario = {
  readonly screens: number
  /** The microphone's answer to each opening, in order. */
  readonly mic: ReadonlyArray<MicScript>
  /** The keep's answer to each take kept, in order (`kitScreens`). */
  readonly keeps: ReadonlyArray<KeepScript>
  readonly steps: ReadonlyArray<ScenarioStep>
}

/** The kit's limits and deadlines the family is drawn against. */
export type ScenarioBounds = {
  readonly limits: TakeLimits
  readonly deadlines: TakeDeadlines
  readonly tickMs: number
}

/** A take is 60 s at most, at least half a second; the phone's own deadlines. */
export const SCENARIO_BOUNDS: ScenarioBounds = {
  limits: { minMs: 500, maxMs: 60_000 },
  deadlines: { openMs: 60_000, finishMs: 15_000 },
  tickMs: 200,
}

const REASONS: ReadonlyArray<RecordingFailure> = [
  "denied",
  "busy",
  "unsupported",
  "failed",
]

/** A span of time: at once, a moment, a while, or past a deadline. */
function span(bound: number): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constant(0) },
    { weight: 4, arbitrary: fc.integer({ min: 1, max: 2_000 }) },
    { weight: 2, arbitrary: fc.integer({ min: 2_000, max: bound - 1 }) },
    { weight: 1, arbitrary: fc.integer({ min: bound, max: bound + 5_000 }) }
  )
}

function micScripts(bounds: ScenarioBounds): fc.Arbitrary<MicScript> {
  const { openMs, finishMs } = bounds.deadlines
  return fc.record({
    open: fc.oneof(
      {
        weight: 6,
        arbitrary: span(openMs).map((ms) => ({ kind: "after" as const, ms })),
      },
      { weight: 1, arbitrary: fc.constant({ kind: "never" as const }) },
      {
        weight: 2,
        arbitrary: fc.record({
          kind: fc.constant("refuse" as const),
          reason: fc.constantFrom(...REASONS),
          ms: fc.integer({ min: 0, max: 2_000 }),
        }),
      }
    ),
    finish: fc.oneof(
      {
        weight: 6,
        arbitrary: span(finishMs).map((ms) => ({ kind: "after" as const, ms })),
      },
      { weight: 1, arbitrary: fc.constant({ kind: "never" as const }) },
      {
        weight: 1,
        arbitrary: fc
          .integer({ min: 0, max: 2_000 })
          .map((ms) => ({ kind: "fail" as const, ms })),
      }
    ),
    // Silence (MIC8's case) as often as speech.
    level: fc.constantFrom(0, 0.3),
    durationMs: fc.option(fc.integer({ min: 0, max: 1_000 }), {
      nil: undefined,
    }),
    bytes: fc.constantFrom(0, 5, 5, 5),
  })
}

function steps(screens: number): fc.Arbitrary<ScenarioStep> {
  const screen = fc.integer({ min: 0, max: screens - 1 })
  return fc.oneof(
    {
      weight: 6,
      arbitrary: screen.map((at) => ({ type: "tap" as const, screen: at })),
    },
    {
      weight: 1,
      arbitrary: screen.map((at) => ({ type: "leave" as const, screen: at })),
    },
    { weight: 1, arbitrary: fc.constant({ type: "hide" as const }) },
    { weight: 1, arbitrary: fc.constant({ type: "show" as const }) },
    {
      weight: 6,
      arbitrary: fc
        .oneof(
          fc.integer({ min: 0, max: 400 }),
          fc.integer({ min: 400, max: 5_000 }),
          fc.integer({ min: 5_000, max: 80_000 })
        )
        .map((ms) => ({ type: "wait" as const, ms })),
    }
  )
}

/** Every trace of the family, for one to `maxScreens` screens. */
export function takeScenarios(
  options: {
    readonly bounds?: ScenarioBounds | undefined
    readonly maxScreens?: number | undefined
    readonly maxSteps?: number | undefined
  } = {}
): fc.Arbitrary<TakeScenario> {
  const bounds = options.bounds ?? SCENARIO_BOUNDS
  return fc.integer({ min: 1, max: options.maxScreens ?? 3 }).chain((screens) =>
    fc.record({
      screens: fc.constant(screens),
      mic: fc.array(micScripts(bounds), { maxLength: 12 }),
      keeps: fc.array(
        fc.record({
          outcome: fc.constantFrom<KeepResult["outcome"]>(
            "kept",
            "kept",
            "kept",
            "full",
            "failed"
          ),
          ms: fc.integer({ min: 0, max: 1_000 }),
        }),
        { maxLength: 12 }
      ),
      steps: fc.array(steps(screens), {
        minLength: 1,
        maxLength: options.maxSteps ?? 24,
      }),
    })
  )
}

/** A screen as the runner drives and watches it. */
export type ScenarioScreen = {
  readonly tap: () => void
  readonly leave: () => void
  readonly subscribe: (listener: () => void) => () => void
  readonly underway: () => boolean
  readonly ended: () => ObservedEnding | null
}

/** What a phone under test is built from: one microphone, one owner. */
export type ScenarioPhone = {
  readonly startRecording: StartRecording
  readonly owner: MicOwner
  readonly now: () => number
  readonly bounds: ScenarioBounds
  /** The keep's answers, in order, for screens that use the runner's keep. */
  readonly keeps: ReadonlyArray<KeepScript>
}

export type ScenarioBuild = {
  readonly screens: ReadonlyArray<ScenarioScreen>
  /** The ids whose audio is kept. */
  readonly audio: () => ReadonlyArray<string>
}

/** The kit as a scenario screen, saying each ending in `words`. */
export function kitScreen(
  kit: TakeKit,
  answers: string,
  words: TakeEndingWords = TAKE_ENDING_WORDS
): ScenarioScreen {
  return {
    tap: () => kit.tap(answers),
    leave: () => kit.leave(),
    subscribe: kit.subscribe,
    underway: () => kit.getSnapshot().take.kind !== "idle",
    ended: (): ObservedEnding | null => {
      const { ended } = kit.getSnapshot()
      if (ended === null) return null
      return {
        seq: ended.seq,
        ending: ended.ending,
        id: ended.id,
        said: takeEndingSaid(words, ended),
      }
    },
  }
}

/**
 * A keep that holds audio in memory and answers as `keeps` say, in order;
 * kept once they run out.
 */
export function memoryKeep(keeps: ReadonlyArray<KeepScript>): {
  readonly keep: TakeKitPorts["keep"]
  readonly audio: () => ReadonlyArray<string>
} {
  const queue = [...keeps]
  const audio = new Set<string>()
  let next = 0
  return {
    keep: (_take, _answers, done): void => {
      const script = queue.shift() ?? { outcome: "kept", ms: 0 }
      setTimeout(() => {
        if (script.outcome !== "kept") {
          done({ outcome: script.outcome })
          return
        }
        next += 1
        const id = `take-${next}`
        audio.add(id)
        done({ outcome: "kept", id })
      }, script.ms)
    },
    audio: () => [...audio],
  }
}

/** `count` kits on one phone, each keeping in memory. */
export function kitScreens(
  makeKit: (ports: TakeKitPorts, limits: TakeLimits) => TakeKit,
  count: number
): (phone: ScenarioPhone) => ScenarioBuild {
  return (phone) => {
    const kept = memoryKeep(phone.keeps)
    const screens = Array.from({ length: count }, (_, at) =>
      kitScreen(
        makeKit(
          {
            startRecording: phone.startRecording,
            now: phone.now,
            keep: kept.keep,
            owner: phone.owner,
            deadlines: phone.bounds.deadlines,
            tickMs: phone.bounds.tickMs,
          },
          phone.bounds.limits
        ),
        `screen-${at}`
      )
    )
    return { screens, audio: kept.audio }
  }
}

/** How long any take may take to end: the open wait, the cap, the finish wait, a keep. */
export function boundOf(bounds: ScenarioBounds): number {
  const { limits, deadlines, tickMs } = bounds
  return (
    deadlines.openMs + limits.maxMs + tickMs + deadlines.finishMs + 1_000 + 1
  )
}

export type ScenarioRun = {
  readonly violations: ReadonlyArray<TakeViolation>
  readonly mic: SimulatedMicrophone
  /** Takes started, and endings said, across the screens. */
  readonly started: number
  readonly ended: number
}

/**
 * Plays `scenario` against the screens `build` makes on one simulated
 * microphone and one owner, then lets every deadline pass, and returns the
 * properties the trace broke (none, when it holds).
 */
export async function runTakeScenario(
  scenario: TakeScenario,
  harness: {
    readonly build: (phone: ScenarioPhone) => ScenarioBuild
    /** Moves the test's fake clock, running what falls due. */
    readonly advance: (ms: number) => Promise<unknown>
    readonly now: () => number
    readonly bounds?: ScenarioBounds | undefined
  }
): Promise<ScenarioRun> {
  const bounds = harness.bounds ?? SCENARIO_BOUNDS
  const bound = { boundMs: boundOf(bounds) }
  const mic = simulatedMicrophone({ now: harness.now })
  mic.script(...scenario.mic)
  const owner = microphoneOwner()
  const built = harness.build({
    startRecording: mic.startRecording,
    owner,
    now: harness.now,
    bounds,
    keeps: scenario.keeps,
  })

  let monitor: TakeMonitor = initialTakeMonitor
  const violations: Array<TakeViolation> = []
  let started = 0
  let ended = 0
  const observe = (observation: TakeObservation): void => {
    const next = stepTakeMonitor(monitor, observation, bound)
    monitor = next.monitor
    violations.push(...next.violations)
  }
  const unsubscribe = built.screens.map((screen, at) => {
    let was = { underway: screen.underway(), seq: screen.ended()?.seq ?? 0 }
    return screen.subscribe(() => {
      const now = {
        underway: screen.underway(),
        seq: screen.ended()?.seq ?? 0,
      }
      if (now.underway === was.underway && now.seq === was.seq) return
      if (!was.underway && now.underway) started += 1
      if (now.seq !== was.seq) ended += 1
      was = now
      observe({
        kind: "screen",
        at: harness.now(),
        screen: `screen-${at}`,
        underway: now.underway,
        ended: screen.ended(),
      })
    })
  })
  const quiet = async (ms: number): Promise<void> => {
    await harness.advance(ms)
    observe({
      kind: "quiet",
      at: harness.now(),
      open: mic.open(),
      holder: owner.holder(),
    })
  }

  for (const step of scenario.steps) {
    switch (step.type) {
      case "tap": {
        built.screens[step.screen]?.tap()
        break
      }
      case "leave": {
        built.screens[step.screen]?.leave()
        break
      }
      case "hide": {
        for (const screen of built.screens) screen.leave()
        break
      }
      case "show":
      case "wait": {
        break
      }
      default: {
        assertNever(step)
      }
    }
    await quiet(step.type === "wait" ? step.ms : 0)
  }
  // Every take started has had every deadline and the cap to end.
  await quiet(bound.boundMs)
  await quiet(bound.boundMs)
  observe({
    kind: "settled",
    at: harness.now(),
    open: mic.open(),
    holder: owner.holder(),
    audio: built.audio(),
  })
  for (const stop of unsubscribe) stop()
  return { violations, mic, started, ended }
}

/**
 * The property suite over any screen: plays `numRuns` generated traces
 * against what `build` makes for each, and fails with the first trace that
 * breaks a property, shrunk. `reset` runs before each trace (clearing the
 * test's timers, say).
 */
export async function assertTakeProperties(
  harness: {
    readonly build: (screens: number) => (phone: ScenarioPhone) => ScenarioBuild
    readonly advance: (ms: number) => Promise<unknown>
    readonly now: () => number
    readonly reset?: (() => void) | undefined
    readonly bounds?: ScenarioBounds | undefined
  },
  options: {
    readonly numRuns?: number | undefined
    readonly maxScreens?: number | undefined
  } = {}
): Promise<void> {
  await fc.assert(
    fc.asyncProperty(
      takeScenarios({ bounds: harness.bounds, maxScreens: options.maxScreens }),
      async (scenario) => {
        harness.reset?.()
        const result = await runTakeScenario(scenario, {
          ...harness,
          build: harness.build(scenario.screens),
        })
        if (result.violations.length > 0) {
          throw new Error(
            `broke ${result.violations
              .map(({ property, detail }) => `${property} (${detail})`)
              .join(", ")}`
          )
        }
        if (result.ended !== result.started) {
          throw new Error(
            `${result.started} takes started, ${result.ended} ended`
          )
        }
      }
    ),
    { numRuns: options.numRuns ?? 100 }
  )
}
