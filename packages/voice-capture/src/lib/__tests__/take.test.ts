import { addFailureSink } from "@some-ui/intent-kit"
import type { Recording, Take } from "@voice-capture/lib/recorder"
import { RecordingError } from "@voice-capture/lib/recorder"
import type { TakePhase, TakeSignal } from "@voice-capture/lib/take"
import {
  discardTake,
  finishTake,
  openTake,
  stepTake,
  takeRunner,
} from "@voice-capture/lib/take"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const LIMITS = { minMs: 1_000, maxMs: 60_000 }
const recording: TakePhase = {
  kind: "recording",
  startedAt: 0,
  elapsed: 0,
  level: 0,
}

function take(durationMs: number, bytes = "abc"): Take {
  return { blob: new Blob([bytes]), mimeType: "audio/webm", durationMs }
}

describe("a take", () => {
  it("opens the microphone, then records from when it opened", () => {
    expect(openTake()).toEqual({
      kind: "taking",
      phase: { kind: "opening" },
      effects: [{ type: "openMic" }],
    })
    expect(
      stepTake({ kind: "opening" }, { type: "micOpened", at: 5 }, LIMITS)
    ).toEqual({
      kind: "taking",
      phase: { kind: "recording", startedAt: 5, elapsed: 0, level: 0 },
      effects: [{ type: "startClock" }],
    })
  })

  it("stops itself at the limit, keeping what was said", () => {
    expect(
      stepTake(recording, { type: "ticked", now: 60_000, level: 0.5 }, LIMITS)
    ).toEqual({
      kind: "taking",
      phase: { kind: "finishing" },
      effects: [{ type: "stopClock" }, { type: "finishTake" }],
    })
  })

  it("keeps a take long enough and not empty, and nothing else", () => {
    const finishing: TakePhase = { kind: "finishing" }
    expect(
      stepTake(finishing, { type: "taken", take: take(5_000) }, LIMITS).kind
    ).toBe("kept")
    expect(
      stepTake(finishing, { type: "taken", take: take(999) }, LIMITS).kind
    ).toBe("short")
    expect(
      stepTake(finishing, { type: "taken", take: take(5_000, "") }, LIMITS).kind
    ).toBe("short")
  })

  it("finishes only a take that is recording, and discards one opening too", () => {
    expect(finishTake({ kind: "opening" })).toMatchObject({ kind: "taking" })
    expect(discardTake(recording)).toEqual({
      kind: "discarded",
      effects: [{ type: "stopClock" }, { type: "discardTake" }],
    })
    expect(discardTake({ kind: "opening" })).toEqual({
      kind: "discarded",
      effects: [{ type: "discardTake" }],
    })
  })
})

/**
 * VC1: every wait on the microphone settles within its deadline, over each
 * way the recorder port can answer: open never, late or refused, and finish
 * never or late.
 */
describe("VC1: the microphone answers in bounded time", () => {
  const DEADLINES = { openMs: 20, finishMs: 20 }
  const never = <T>(): Promise<T> => new Promise<T>(() => undefined)
  let unsink: () => void = () => undefined
  let reported: Array<string> = []

  beforeEach(() => {
    reported = []
    unsink = addFailureSink((failure) => {
      reported.push(failure.error.summary)
    })
  })
  afterEach(() => unsink())

  function run(startRecording: () => Promise<Recording>): {
    signals: Array<TakeSignal>
    runner: ReturnType<typeof takeRunner>
  } {
    const signals: Array<TakeSignal> = []
    const runner = takeRunner(
      { startRecording, now: () => 0, tickMs: 1_000, deadlines: DEADLINES },
      (signal) => signals.push(signal)
    )
    return { signals, runner }
  }

  const recorder = (finish: () => Promise<Take>): Recording => ({
    level: () => 0,
    finish,
    discard: vi.fn(),
  })

  it("fails the take when the microphone never opens, and says so", async () => {
    const { signals, runner } = run(never)
    runner.run({ type: "openMic" })
    await vi.waitFor(() =>
      expect(signals).toEqual([{ type: "micFailed", reason: "failed" }])
    )
    expect(reported).toHaveLength(1)
  })

  it("lets go of a microphone that opens after its deadline", async () => {
    const late = recorder(() => Promise.resolve(take(2_000)))
    let open: (r: Recording) => void = () => undefined
    const { signals, runner } = run(
      () => new Promise((resolve) => (open = resolve))
    )
    runner.run({ type: "openMic" })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    open(late)
    await vi.waitFor(() => expect(late.discard).toHaveBeenCalledOnce())
    expect(signals).toEqual([{ type: "micFailed", reason: "failed" }])
  })

  it("passes on the microphone's own refusal, which it reports itself", async () => {
    const { signals, runner } = run(() =>
      Promise.reject(new RecordingError("denied"))
    )
    runner.run({ type: "openMic" })
    await vi.waitFor(() =>
      expect(signals).toEqual([{ type: "micFailed", reason: "denied" }])
    )
    expect(reported).toEqual([])
  })

  it("fails the take when a recording never gives back what it heard", async () => {
    const { signals, runner } = run(() => Promise.resolve(recorder(never)))
    runner.run({ type: "openMic" })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    runner.run({ type: "finishTake" })
    await vi.waitFor(() =>
      expect(signals.at(-1)).toEqual({ type: "takeFailed" })
    )
  })

  it("fails the take when a recording gives back what it heard after its deadline, and keeps none of it", async () => {
    let give: (said: Take) => void = () => undefined
    const { signals, runner } = run(() =>
      Promise.resolve(
        recorder(() => new Promise((resolve) => (give = resolve)))
      )
    )
    runner.run({ type: "openMic" })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    runner.run({ type: "finishTake" })
    await vi.waitFor(() =>
      expect(signals.at(-1)).toEqual({ type: "takeFailed" })
    )
    give(take(2_000))
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(signals.filter((signal) => signal.type === "taken")).toEqual([])
  })

  it("keeps a recording that gives back what it heard in time", async () => {
    const said = take(2_000)
    const { signals, runner } = run(() =>
      Promise.resolve(recorder(() => Promise.resolve(said)))
    )
    runner.run({ type: "openMic" })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    runner.run({ type: "finishTake" })
    await vi.waitFor(() =>
      expect(signals.at(-1)).toEqual({ type: "taken", take: said })
    )
  })
})
