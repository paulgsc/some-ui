/**
 * The take kit: its step, the phone's one microphone, and the
 * property suite. VC2 and VC3 (`lib/properties.ts`) are checked on every
 * generated trace of the scenario family, over the real `takeKit` on the
 * shared simulated microphone, with the owner's cases as named points.
 */
import { microphoneOwner } from "@voice-capture/lib/owner"
import type { ScenarioStep, TakeScenario } from "@voice-capture/lib/scenario"
import {
  assertTakeProperties,
  kitScreens,
  runTakeScenario,
  SCENARIO_BOUNDS,
  takeScenarios,
} from "@voice-capture/lib/scenario"
import type { MicScript } from "@voice-capture/lib/simulated-microphone"
import {
  simulatedMicrophone,
  SPEAKING,
} from "@voice-capture/lib/simulated-microphone"
import type { TakeKitState } from "@voice-capture/lib/take-kit"
import {
  HEARD_FLOOR,
  initialTakeKit,
  stepTakeKit,
  TAKE_ENDING_WORDS,
  takeEndingSaid,
  takeKit,
} from "@voice-capture/lib/take-kit"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const LIMITS = SCENARIO_BOUNDS.limits

function run(
  events: Array<Parameters<typeof stepTakeKit>[1]>,
  from: TakeKitState = initialTakeKit
): { state: TakeKitState; effects: Array<string> } {
  let state = from
  const effects: Array<string> = []
  for (const event of events) {
    const next = stepTakeKit(state, event, LIMITS)
    state = next.state
    effects.push(...next.effects.map((effect) => effect.type))
  }
  return { state, effects }
}

const take = {
  blob: new Blob(["abc"]),
  mimeType: "audio/webm",
  durationMs: 4_000,
}

describe("the take kit's step", () => {
  it("starts on a tap and stops on the next, keeping the take under the keep's id", () => {
    const { state, effects } = run([
      { type: "tap", answers: "card-3" },
      { type: "micOpened", at: 0 },
      { type: "tap", answers: "card-3" },
      { type: "taken", take },
      { type: "kept", result: { outcome: "kept", id: "n1" } },
    ])
    expect(effects).toEqual([
      "openMic",
      "startClock",
      "stopClock",
      "finishTake",
      "keep",
    ])
    expect(state.ended).toEqual({
      seq: 1,
      answers: "card-3",
      ending: "kept",
      id: "n1",
      reason: null,
      unheard: false,
    })
  })

  it.each([
    { peak: 0, metered: true, unheard: true, why: "silence, measured" },
    { peak: 0.04, metered: true, unheard: true, why: "below the floor" },
    { peak: HEARD_FLOOR, metered: true, unheard: false, why: "at the floor" },
    { peak: 0.6, metered: true, unheard: false, why: "speech" },
    { peak: 0, metered: false, unheard: false, why: "no meter running" },
    { peak: 0, metered: undefined, unheard: false, why: "unknown meter" },
  ])(
    "keeps a take whose loudest level is $peak (metered: $metered), unheard: $unheard ($why) (D4)",
    ({ peak, metered, unheard }) => {
      const { state } = run([
        { type: "tap", answers: "card-3" },
        { type: "micOpened", at: 0 },
        { type: "ticked", now: 200, level: peak / 2, metered },
        { type: "ticked", now: 400, level: peak, metered },
        { type: "ticked", now: 600, level: 0, metered },
        { type: "tap", answers: "card-3" },
        { type: "taken", take },
        { type: "kept", result: { outcome: "kept", id: "n1" } },
      ])
      expect(state.ended).toMatchObject({ ending: "kept", unheard })
      expect(takeEndingSaid(TAKE_ENDING_WORDS, state.ended!)).toBe(
        unheard ? TAKE_ENDING_WORDS.unheard : TAKE_ENDING_WORDS.kept
      )
    }
  )

  it("counts only the take under way: a quiet take after a loud one is unheard (D4)", () => {
    const loud = run([
      { type: "tap", answers: "a" },
      { type: "micOpened", at: 0 },
      { type: "ticked", now: 200, level: 0.7, metered: true },
      { type: "tap", answers: "a" },
      { type: "taken", take },
      { type: "kept", result: { outcome: "kept", id: "n1" } },
    ])
    const { state } = run(
      [
        { type: "tap", answers: "b" },
        { type: "micOpened", at: 1_000 },
        { type: "ticked", now: 1_200, level: 0.03, metered: true },
        { type: "tap", answers: "b" },
        { type: "taken", take },
        { type: "kept", result: { outcome: "kept", id: "n2" } },
      ],
      loud.state
    )
    expect(state.ended).toMatchObject({ seq: 2, id: "n2", unheard: true })
  })

  it("records one ending per take, with what it answered", () => {
    const { state } = run([
      { type: "start", answers: "a" },
      { type: "stop" },
      { type: "start", answers: "b" },
      { type: "start", answers: "c" },
      { type: "micFailed", reason: "elsewhere" },
    ])
    expect(state.ended).toEqual({
      seq: 2,
      answers: "b",
      ending: "blocked",
      id: null,
      reason: "elsewhere",
      unheard: false,
    })
  })

  it("keeps the same state for an event that changes nothing", () => {
    expect(stepTakeKit(initialTakeKit, { type: "stop" }, LIMITS).state).toBe(
      initialTakeKit
    )
  })
})

describe("one take at a time per phone", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("refuses a second screen's take while one records, in words, and lets the first go on", async () => {
    const mic = simulatedMicrophone({ now: Date.now })
    const owner = microphoneOwner()
    const keep = vi.fn()
    const kit = (): ReturnType<typeof takeKit> =>
      takeKit(
        { startRecording: mic.startRecording, now: Date.now, keep, owner },
        LIMITS
      )
    const first = kit()
    const second = kit()
    first.tap("first")
    await vi.advanceTimersByTimeAsync(0)
    expect(first.getSnapshot().take.kind).toBe("recording")
    second.tap("second")
    await vi.advanceTimersByTimeAsync(0)
    expect(second.getSnapshot().ended).toMatchObject({
      ending: "blocked",
      reason: "elsewhere",
    })
    expect(second.getSnapshot().blocked).toBe("elsewhere")
    expect(mic.asked()).toBe(1)
    expect(owner.holder()).toBe("take")
    await vi.advanceTimersByTimeAsync(2_000)
    first.tap("first")
    await vi.advanceTimersByTimeAsync(0)
    expect(keep).toHaveBeenCalledOnce()
    expect(owner.holder()).toBeNull()
    second.tap("second")
    await vi.advanceTimersByTimeAsync(0)
    expect(second.getSnapshot().take.kind).toBe("recording")
  })

  it("frees the microphone at once when a take is stopped while it opens", async () => {
    const mic = simulatedMicrophone({ now: Date.now })
    mic.script({ ...SPEAKING, open: { kind: "cue" } })
    const owner = microphoneOwner()
    const kit = takeKit(
      {
        startRecording: mic.startRecording,
        now: Date.now,
        keep: vi.fn(),
        owner,
      },
      LIMITS
    )
    kit.tap("x")
    kit.tap("x")
    expect(kit.getSnapshot().ended?.ending).toBe("early")
    expect(owner.holder()).toBeNull()
    mic.answer("open")
    await vi.advanceTimersByTimeAsync(0)
    expect(mic.open()).toBe(0)
    expect(mic.discarded()).toBe(1)
  })

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "leaves no stream open when stopped %i microtasks after the microphone opened",
    async (ticks) => {
      const mic = simulatedMicrophone({ now: Date.now })
      mic.script({ ...SPEAKING, open: { kind: "cue" } })
      const owner = microphoneOwner()
      const kit = takeKit(
        {
          startRecording: mic.startRecording,
          now: Date.now,
          keep: (_, __, done) => done({ outcome: "kept", id: "k" }),
          owner,
        },
        LIMITS
      )
      kit.tap("x")
      mic.answer("open")
      for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve()
      kit.tap("x")
      await vi.advanceTimersByTimeAsync(LIMITS.maxMs)
      expect(kit.getSnapshot().take.kind).toBe("idle")
      expect(mic.open()).toBe(0)
      expect(owner.holder()).toBeNull()
    }
  )
})

/** The owner's cases, as points in the family. */
const CASES: ReadonlyArray<{
  readonly name: string
  readonly screens?: number
  readonly mic?: ReadonlyArray<MicScript>
  readonly steps: ReadonlyArray<ScenarioStep>
  readonly ends: ReadonlyArray<string>
}> = [
  {
    name: "the happy path: tap, speak, tap",
    steps: [
      { type: "tap", screen: 0 },
      { type: "wait", ms: 4_000 },
      { type: "tap", screen: 0 },
    ],
    ends: ["kept"],
  },
  {
    name: "many screens: the second is refused while the first records",
    screens: 3,
    steps: [
      { type: "tap", screen: 0 },
      { type: "wait", ms: 1_000 },
      { type: "tap", screen: 1 },
      { type: "tap", screen: 2 },
      { type: "wait", ms: 1_000 },
      { type: "tap", screen: 0 },
    ],
    ends: ["blocked", "blocked", "kept"],
  },
  {
    name: "never stops: the cap ends it, kept",
    steps: [{ type: "tap", screen: 0 }],
    ends: ["kept"],
  },
  {
    name: "silence: kept (D4; MIC8 says it)",
    mic: [{ ...SPEAKING, level: 0 }],
    steps: [
      { type: "tap", screen: 0 },
      { type: "wait", ms: 3_000 },
      { type: "tap", screen: 0 },
    ],
    ends: ["kept"],
  },
  {
    name: "a spurious cancel: a second tap while the microphone opens",
    mic: [{ ...SPEAKING, open: { kind: "after", ms: 800 } }],
    steps: [
      { type: "tap", screen: 0 },
      { type: "wait", ms: 100 },
      { type: "tap", screen: 0 },
    ],
    ends: ["early"],
  },
  {
    name: "a late microphone, past its deadline",
    mic: [{ ...SPEAKING, open: { kind: "after", ms: 61_000 } }],
    steps: [{ type: "tap", screen: 0 }],
    ends: ["blocked"],
  },
  {
    name: "a microphone that never answers",
    mic: [{ ...SPEAKING, open: { kind: "never" } }],
    steps: [{ type: "tap", screen: 0 }],
    ends: ["blocked"],
  },
  {
    name: "a refused microphone",
    mic: [{ ...SPEAKING, open: { kind: "refuse", reason: "denied", ms: 10 } }],
    steps: [{ type: "tap", screen: 0 }],
    ends: ["blocked"],
  },
  {
    name: "the page hidden mid-take: kept",
    steps: [
      { type: "tap", screen: 0 },
      { type: "wait", ms: 2_000 },
      { type: "hide" },
      { type: "show" },
    ],
    ends: ["kept"],
  },
]

describe("VC2, VC3: every trace of the family keeps every property", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // A microphone past its deadline is reported (VC1); not this test's to read.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const harness = (screens: number): Parameters<typeof runTakeScenario>[1] => ({
    build: kitScreens(takeKit, screens),
    advance: (ms) => vi.advanceTimersByTimeAsync(ms),
    now: Date.now,
  })

  it.each(CASES)("$name", async ({ screens = 1, mic = [], steps, ends }) => {
    const endings: Array<string> = []
    const build = kitScreens(takeKit, screens)
    const result = await runTakeScenario(
      { screens, mic, keeps: [], steps },
      {
        ...harness(screens),
        build: (phone) => {
          const built = build(phone)
          for (const screen of built.screens) {
            let seen = 0
            screen.subscribe(() => {
              const ended = screen.ended()
              if (ended !== null && ended.seq > seen) {
                seen = ended.seq
                endings.push(ended.ending)
              }
            })
          }
          return built
        },
      }
    )
    expect(result.violations).toEqual([])
    expect([...endings].sort()).toEqual([...ends].sort())
  })

  it("holds on every generated trace", async () => {
    await assertTakeProperties(
      {
        build: (screens) => kitScreens(takeKit, screens),
        advance: (ms) => vi.advanceTimersByTimeAsync(ms),
        now: Date.now,
        reset: () => vi.clearAllTimers(),
      },
      { numRuns: 150 }
    )
  })

  it("would catch screens that each own a microphone", async () => {
    // A mutant: every kit with an owner of its own.
    const failure = await fc.check(
      fc.asyncProperty(
        takeScenarios({ maxScreens: 3 }).filter(({ screens }) => screens > 1),
        async (scenario: TakeScenario) => {
          vi.clearAllTimers()
          const result = await runTakeScenario(scenario, {
            ...harness(scenario.screens),
            build: kitScreens(
              (ports, limits) =>
                takeKit({ ...ports, owner: microphoneOwner() }, limits),
              scenario.screens
            ),
          })
          return result.violations.length === 0
        }
      ),
      { numRuns: 300 }
    )
    expect(failure.failed).toBe(true)
  })
})
