/**
 * The take pattern: its step, its runtime on the shared
 * simulated microphone, and the property family. The pattern embeds the
 * take kit's step, so VC2 and VC3 (`lib/properties.ts`) are checked on every
 * generated trace of the scenario family over pattern screens, as they are
 * over kits; what the pattern adds (play one take at a time, never while
 * recording; a kept redo supersedes exactly the take it was asked to) is a
 * property over every order of its events.
 */
import { microphoneOwner } from "@voice-capture/lib/owner"
import { simulatedPlayer } from "@voice-capture/lib/pattern-testing"
import type { ObservedEnding } from "@voice-capture/lib/properties"
import type {
  ScenarioBuild,
  ScenarioPhone,
  ScenarioScreen,
} from "@voice-capture/lib/scenario"
import {
  assertTakeProperties,
  memoryKeep,
  SCENARIO_BOUNDS,
} from "@voice-capture/lib/scenario"
import {
  simulatedMicrophone,
  SPEAKING,
} from "@voice-capture/lib/simulated-microphone"
import { TAKE_ENDING_WORDS, takeEndingSaid } from "@voice-capture/lib/take-kit"
import type {
  TakePattern,
  TakePatternEffect,
  TakePatternEvent,
  TakePatternOptions,
  TakePatternState,
} from "@voice-capture/lib/take-pattern"
import {
  initialTakePattern,
  stepTakePattern,
  takePattern,
} from "@voice-capture/lib/take-pattern"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const OPTIONS: TakePatternOptions = {
  takes: { per: "one" },
  limits: SCENARIO_BOUNDS.limits,
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
  clock: "elapsed",
}

const take = {
  blob: new Blob(["abc"]),
  mimeType: "audio/webm",
  durationMs: 4_000,
}

function run(
  events: ReadonlyArray<TakePatternEvent>,
  from: TakePatternState = initialTakePattern
): { state: TakePatternState; effects: Array<TakePatternEffect> } {
  let state = from
  const effects: Array<TakePatternEffect> = []
  for (const event of events) {
    const next = stepTakePattern(state, event, OPTIONS)
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects }
}

const tap = (supersedes: string | null = null): TakePatternEvent => ({
  type: "tap",
  answers: "card-1",
  supersedes,
})

/** A take tapped, recorded for 4 s and stopped, up to its keep. */
const recorded = (supersedes: string | null): Array<TakePatternEvent> => [
  tap(supersedes),
  { type: "micOpened", at: 0 },
  { type: "ticked", now: 4_000, level: 0.3 },
  tap(),
  { type: "taken", take },
]

describe("the take pattern's step", () => {
  it("keeps a redo with the take it supersedes, then supersedes nothing further (D2)", () => {
    const { state, effects } = run([
      ...recorded("t1"),
      { type: "kept", result: { outcome: "kept", id: "t2" } },
    ])
    expect(effects.filter((effect) => effect.type === "keep")).toEqual([
      { type: "keep", take, answers: "card-1", supersedes: "t1" },
    ])
    expect(state.kit.ended).toMatchObject({ ending: "kept", id: "t2" })
    expect(state.supersedes).toBeNull()
  })

  it("supersedes nothing when the redo ends unkept", () => {
    const { state, effects } = run([
      tap("t1"),
      { type: "micOpened", at: 0 },
      tap(),
      { type: "taken", take: { ...take, durationMs: 100 } },
    ])
    expect(effects.some((effect) => effect.type === "keep")).toBe(false)
    expect(state.kit.ended?.ending).toBe("short")
    expect(state.supersedes).toBeNull()
  })

  it("plays one take at a time, and a second tap on it stops it", () => {
    const { state, effects } = run([
      { type: "play", id: "t1" },
      { type: "loaded", play: 1, audio: take.blob },
      { type: "play", id: "t2" },
      { type: "loaded", play: 2, audio: take.blob },
      { type: "play", id: "t2" },
    ])
    expect(effects.map((effect) => effect.type)).toEqual([
      "loadAudio",
      "playAudio",
      "stopAudio",
      "loadAudio",
      "playAudio",
      "stopAudio",
    ])
    expect(state.playback).toEqual({ kind: "quiet" })
  })

  it("lets a late read for an earlier play go by", () => {
    const { state, effects } = run([
      { type: "play", id: "t1" },
      { type: "play", id: "t2" },
      { type: "loaded", play: 1, audio: take.blob },
    ])
    expect(effects.map((effect) => effect.type)).toEqual([
      "loadAudio",
      "loadAudio",
    ])
    expect(state.playback).toEqual({ kind: "loading", id: "t2" })
  })

  it("says a take whose audio can't be read, until the next play", () => {
    const unread = run([
      { type: "play", id: "t1" },
      { type: "loaded", play: 1, audio: null },
    ])
    expect(unread.state.unplayable).toBe("t1")
    expect(unread.state.playback).toEqual({ kind: "quiet" })
    expect(
      run([{ type: "play", id: "t2" }], unread.state).state.unplayable
    ).toBeNull()
  })

  it("stops what plays when a take starts, and plays nothing while one is under way", () => {
    const playing = run([
      { type: "play", id: "t1" },
      { type: "loaded", play: 1, audio: take.blob },
    ]).state
    const { state, effects } = run([tap(), { type: "play", id: "t1" }], playing)
    expect(effects.map((effect) => effect.type)).toEqual([
      "stopAudio",
      "openMic",
    ])
    expect(state.playback).toEqual({ kind: "quiet" })
  })

  it("sets a take aside, and stops it first if it plays (D3)", () => {
    const playing = run([
      { type: "play", id: "t1" },
      { type: "loaded", play: 1, audio: take.blob },
    ]).state
    const { state, effects } = run(
      [{ type: "letGo", id: "t1", place: "phone" }],
      playing
    )
    expect(effects).toEqual([
      { type: "stopAudio" },
      { type: "setAside", id: "t1" },
    ])
    expect(state.setAside).toEqual({ id: "t1", place: "phone" })
  })

  it("lets nothing go while a take is under way", () => {
    const { effects } = run([tap(), { type: "letGo", id: "t1", place: "home" }])
    expect(effects.some((effect) => effect.type === "setAside")).toBe(false)
  })
})

const events = fc.oneof(
  fc.option(fc.constantFrom("t1", "t2"), { nil: null }).map(
    (supersedes): TakePatternEvent => ({
      type: "tap",
      answers: "card-1",
      supersedes,
    })
  ),
  fc
    .constantFrom("t1", "t2")
    .map((id): TakePatternEvent => ({ type: "play", id })),
  fc.constant<TakePatternEvent>({ type: "stopPlaying" }),
  fc
    .constantFrom("t1", "t2")
    .map((id): TakePatternEvent => ({ type: "letGo", id, place: "phone" })),
  fc.constant<TakePatternEvent>({ type: "left" }),
  fc.record({
    type: fc.constant("loaded" as const),
    play: fc.integer({ min: 0, max: 6 }),
    audio: fc.constantFrom(take.blob, null),
  }),
  fc
    .integer({ min: 0, max: 6 })
    .map((play): TakePatternEvent => ({ type: "played", play })),
  fc.constant<TakePatternEvent>({ type: "micOpened", at: 0 }),
  fc.constant<TakePatternEvent>({ type: "micFailed", reason: "denied" }),
  fc
    .integer({ min: 0, max: 70_000 })
    .map((now): TakePatternEvent => ({ type: "ticked", now, level: 0.3 })),
  fc.constant<TakePatternEvent>({ type: "taken", take }),
  fc.constant<TakePatternEvent>({ type: "takeFailed" }),
  fc.constantFrom<TakePatternEvent>(
    { type: "kept", result: { outcome: "kept", id: "t9" } },
    { type: "kept", result: { outcome: "failed" } }
  )
)

describe("what the pattern adds holds over every order of its events", () => {
  it("never plays while a take is under way, and keeps a take with what its tap superseded", () => {
    fc.assert(
      fc.property(fc.array(events, { maxLength: 40 }), (trace) => {
        let state = initialTakePattern
        let startedWith: string | null = null
        for (const event of trace) {
          const wasUnderway =
            state.kit.note.kind === "taking" || state.kit.note.kind === "saving"
          const next = stepTakePattern(state, event, OPTIONS)
          if (event.type === "tap" && !wasUnderway) {
            startedWith = event.supersedes
          }
          for (const effect of next.effects) {
            if (effect.type === "keep") {
              expect(effect.supersedes).toBe(startedWith)
            }
            if (effect.type === "playAudio" || effect.type === "loadAudio") {
              expect(wasUnderway).toBe(false)
            }
          }
          state = next.state
          const underway =
            state.kit.note.kind === "taking" || state.kit.note.kind === "saving"
          if (underway) expect(state.playback).toEqual({ kind: "quiet" })
          if (!underway) expect(state.supersedes).toBeNull()
        }
      }),
      { numRuns: 500 }
    )
  })
})

describe("the take pattern's runtime, on the simulated microphone", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("redoes a take: keeps the new one superseding the old, and stops what plays first", async () => {
    const mic = simulatedMicrophone({ now: Date.now })
    const kept: Array<{ answers: string; supersedes: string | null }> = []
    const player = simulatedPlayer()
    const pattern = takePattern(
      {
        startRecording: mic.startRecording,
        now: Date.now,
        owner: microphoneOwner(),
        keep: (_take, answers, supersedes, done) => {
          kept.push({ answers, supersedes })
          done({ outcome: "kept", id: "t2" })
        },
        setAside: vi.fn(),
        audio: () => Promise.resolve(take.blob),
        player,
      },
      OPTIONS
    )
    pattern.play("t1")
    await vi.advanceTimersByTimeAsync(0)
    expect(pattern.getSnapshot().playback).toEqual({
      kind: "playing",
      id: "t1",
    })
    expect(player.playing()).toBe(1)
    pattern.tap("card-1", "t1")
    expect(player.playing()).toBe(0)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(pattern.getSnapshot().take.kind).toBe("recording")
    expect(pattern.getSnapshot().supersedes).toBe("t1")
    pattern.tap("card-1")
    await vi.advanceTimersByTimeAsync(0)
    expect(kept).toEqual([{ answers: "card-1", supersedes: "t1" }])
    expect(pattern.getSnapshot().ended).toMatchObject({
      ending: "kept",
      id: "t2",
    })
    expect(mic.open()).toBe(0)
  })

  it("sets a take aside through the screen's store", () => {
    const setAside = vi.fn()
    const pattern = takePattern(
      {
        startRecording: simulatedMicrophone({ now: Date.now }).startRecording,
        now: Date.now,
        owner: microphoneOwner(),
        keep: vi.fn(),
        setAside,
        audio: () => Promise.resolve(null),
        player: simulatedPlayer(),
      },
      OPTIONS
    )
    pattern.letGo("t1", "home")
    expect(setAside).toHaveBeenCalledWith("t1")
    expect(pattern.getSnapshot().setAside).toEqual({ id: "t1", place: "home" })
  })

  it("says a take whose audio is gone", async () => {
    const pattern = takePattern(
      {
        startRecording: simulatedMicrophone({ now: Date.now }).startRecording,
        now: Date.now,
        owner: microphoneOwner(),
        keep: vi.fn(),
        setAside: vi.fn(),
        audio: () => Promise.reject(new Error("gone")),
        player: simulatedPlayer(),
      },
      OPTIONS
    )
    pattern.play("t1")
    await vi.advanceTimersByTimeAsync(0)
    expect(pattern.getSnapshot().unplayable).toBe("t1")
  })
})

/** A pattern as a scenario screen, each tap on its item's take button. */
function patternScreen(pattern: TakePattern, answers: string): ScenarioScreen {
  return {
    tap: () => pattern.tap(answers),
    leave: () => pattern.leave(),
    subscribe: pattern.subscribe,
    underway: () => pattern.getSnapshot().take.kind !== "idle",
    ended: (): ObservedEnding | null => {
      const { ended } = pattern.getSnapshot()
      if (ended === null) return null
      return {
        seq: ended.seq,
        ending: ended.ending,
        id: ended.id,
        said: takeEndingSaid(TAKE_ENDING_WORDS, ended),
      }
    },
  }
}

function patternScreens(
  count: number
): (phone: ScenarioPhone) => ScenarioBuild {
  return (phone) => {
    const kept = memoryKeep(phone.keeps)
    const screens = Array.from({ length: count }, (_, at) =>
      patternScreen(
        takePattern(
          {
            startRecording: phone.startRecording,
            now: phone.now,
            owner: phone.owner,
            deadlines: phone.bounds.deadlines,
            tickMs: phone.bounds.tickMs,
            keep: (recorded, answers, _supersedes, done) =>
              kept.keep(recorded, answers, done),
            setAside: () => undefined,
            audio: () => Promise.resolve(null),
            player: simulatedPlayer(),
          },
          { ...OPTIONS, limits: phone.bounds.limits }
        ),
        `screen-${at}`
      )
    )
    return { screens, audio: kept.audio }
  }
}

describe("VC2, VC3: every trace of the family keeps every property on pattern screens", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // A microphone past its deadline is reported (VC1); not this test's to read.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("holds on every generated trace", async () => {
    await assertTakeProperties(
      {
        build: patternScreens,
        advance: (ms) => vi.advanceTimersByTimeAsync(ms),
        now: Date.now,
        reset: () => vi.clearAllTimers(),
      },
      { numRuns: 100 }
    )
  })

  it("keeps the shortest take a screen asked for, under its own cap", async () => {
    const mic = simulatedMicrophone({ now: Date.now })
    mic.script(SPEAKING)
    const pattern = takePattern(
      {
        startRecording: mic.startRecording,
        now: Date.now,
        owner: microphoneOwner(),
        keep: (_take, _answers, _supersedes, done) =>
          done({ outcome: "kept", id: "t1" }),
        setAside: vi.fn(),
        audio: () => Promise.resolve(null),
        player: simulatedPlayer(),
      },
      { ...OPTIONS, limits: { minMs: 500, maxMs: 5_000 } }
    )
    pattern.tap("card-1")
    await vi.advanceTimersByTimeAsync(6_000)
    expect(pattern.getSnapshot().ended).toMatchObject({ ending: "kept" })
    expect(mic.open()).toBe(0)
  })
})
