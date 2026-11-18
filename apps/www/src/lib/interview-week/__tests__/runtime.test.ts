/**
 * The interview week on the phone (IW5), end to end on the simulated
 * microphone and the real take pattern: a take per question and per read
 * waits on the phone, named by IW1's refs, until the week is sent together; a
 * read's take starts only once its cue has counted down, and anything else
 * calls the cue off; the week stays open after a send, and a week past its
 * deadline sends nothing.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CUE_SECONDS } from "@/lib/interview-week/cue"
import type { InterviewWeekRun } from "@/lib/interview-week/runtime"
import { createInterviewWeek } from "@/lib/interview-week/runtime"
import type { InterviewSent } from "@/lib/interview-week/spec"
import { interviewSent } from "@/lib/interview-week/store"

import { fakePorts } from "./fixture"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-17T18:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

const pass = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

type Phone = {
  readonly run: InterviewWeekRun
  readonly simulated: SimulatedPattern
  readonly release: ReturnType<typeof vi.fn>
  readonly hide: () => void
}

function phone(
  storage: KeyedStorage,
  over: {
    now?: () => number
    homeHolds?: (sent: InterviewSent) => boolean
  } = {}
): Phone {
  const seen = new Set<(hidden: boolean) => void>()
  const { ports, simulated } = fakePorts({
    storage,
    ...over,
    onVisibility: (listener) => {
      seen.add(listener)
      listener(false)
      return (): void => {
        seen.delete(listener)
      }
    },
  })
  const release = vi.fn(ports.takes.release)
  const run = createInterviewWeek({
    ...ports,
    takes: { ...ports.takes, release },
  })
  run.attach()
  const hide = (): void => {
    for (const listener of seen) listener(true)
  }
  return { run, simulated, release, hide }
}

/** Says a question: a tap, talk, a tap. */
async function answer(on: Phone, item: string): Promise<void> {
  on.run.dispatch({ type: "tap", item })
  await pass(2_000)
  on.run.dispatch({ type: "tap", item })
  await pass()
}

/** Reads a card: a tap, the cue, talk, a tap. */
async function read(on: Phone, item: string): Promise<void> {
  on.run.dispatch({ type: "tap", item })
  await pass(CUE_SECONDS * 1000)
  await pass(2_000)
  on.run.dispatch({ type: "tap", item })
  await pass()
}

const lines = (on: Phone): Array<string> =>
  on.simulated.store
    .getSnapshot()
    .map((take) => take.answers)
    .sort()

const waiting = (on: Phone): Array<string> =>
  on.simulated.store
    .getSnapshot()
    .filter(({ waits }) => waits === true)
    .map((take) => take.answers)
    .sort()

describe("the interview week on the phone (IW5)", () => {
  it("keeps a read's take waiting, named by IW1's refs, until the week goes together", async () => {
    const storage = inMemoryStorage()
    const on = phone(storage)
    expect(on.run.bundle.getSnapshot().screen).toBe("intro")
    on.run.dispatch({ type: "go", index: 1 })
    await answer(on, "conflict")
    await read(on, "read:epic-2931")
    expect(lines(on)).toEqual(["2026-w47:conflict", "2026-w47:read:epic-2931"])
    // The question's first take went home on its own (IW8); the read's waits.
    expect(on.release).toHaveBeenCalledTimes(1)
    expect(waiting(on)).toEqual(["2026-w47:read:epic-2931"])

    on.run.dispatch({ type: "review" })
    on.run.dispatch({ type: "send" })

    const [sent] = interviewSent(storage).list() ?? []
    expect(sent).toMatchObject({
      week: "2026-w47",
      answers: [{ question: "conflict" }],
      reads: [{ card: "epic-2931" }],
      passed: ["walk-me-through", "why-now", "decision-c266"],
      passedReads: ["invariant-rs1"],
    })
    expect(on.release).toHaveBeenCalledTimes(2)
    expect(waiting(on)).toEqual([])
    expect(on.run.bundle.getSnapshot().screen).toBe("sent")
  })

  it("starts a read's take only once its cue has counted down", async () => {
    const on = phone(inMemoryStorage())
    on.run.dispatch({ type: "go", index: 4 })
    on.run.dispatch({ type: "tap", item: "read:epic-2931" })
    await pass((CUE_SECONDS - 1) * 1000)
    expect(on.run.cue.getSnapshot().kind).toBe("counting")
    expect(on.run.bundle.getSnapshot().busy).toBe(false)
    await pass(1000)
    expect(on.run.cue.getSnapshot().kind).toBe("idle")
    expect(on.run.bundle.getSnapshot().busy).toBe(true)
  })

  it("puts a read's card on screen before its cue, from the look over too", async () => {
    const on = phone(inMemoryStorage())
    on.run.dispatch({ type: "go", index: 0 })
    on.run.dispatch({ type: "review" })
    on.run.dispatch({ type: "tap", item: "read:invariant-rs1" })
    expect(on.run.bundle.getSnapshot()).toMatchObject({
      screen: "cards",
      index: 5,
    })
    expect(on.run.cue.getSnapshot()).toMatchObject({
      kind: "counting",
      item: "read:invariant-rs1",
    })
    await pass(CUE_SECONDS * 1000)
    expect(on.run.bundle.getSnapshot().busy).toBe(true)
  })

  it("calls the cue off, recording nothing, on a tap again, a swipe or the screen hidden", async () => {
    const on = phone(inMemoryStorage())
    on.run.dispatch({ type: "go", index: 4 })
    const item = "read:epic-2931"

    on.run.dispatch({ type: "tap", item })
    on.run.dispatch({ type: "tap", item })
    expect(on.run.cue.getSnapshot().kind).toBe("idle")

    on.run.dispatch({ type: "tap", item })
    on.run.dispatch({ type: "swipe", to: "next" })
    expect(on.run.cue.getSnapshot().kind).toBe("idle")
    expect(on.run.bundle.getSnapshot().index).toBe(5)

    on.run.dispatch({ type: "tap", item: "read:invariant-rs1" })
    on.hide()
    expect(on.run.cue.getSnapshot().kind).toBe("idle")

    await pass(CUE_SECONDS * 2000)
    expect(on.run.bundle.getSnapshot().busy).toBe(false)
    expect(lines(on)).toEqual([])
  })

  it("stays open after a send: a card said again goes with what home holds of the rest", async () => {
    const storage = inMemoryStorage()
    const on = phone(storage, { homeHolds: () => true })
    on.run.dispatch({ type: "go", index: 0 })
    await answer(on, "walk-me-through")
    await answer(on, "why-now")
    on.run.dispatch({ type: "review" })
    on.run.dispatch({ type: "send" })
    on.run.dispatch({ type: "back" })
    await pass(60_000)

    on.run.dispatch({ type: "go", index: 2 })
    await answer(on, "why-now")
    on.run.dispatch({ type: "review" })
    on.run.dispatch({ type: "send" })

    const sends = interviewSent(storage).list() ?? []
    expect(sends).toHaveLength(2)
    const [first, second] = sends
    expect(second.answers.map(({ question }) => question)).toEqual([
      "walk-me-through",
      "why-now",
    ])
    expect(second.answers[0].take).toBe(first.answers[0].take)
    expect(second.answers[1].take).not.toBe(first.answers[1].take)
    expect(on.run.atHome.getSnapshot().holds?.at).toBe(second.at)
  })

  it("sends nothing once the week has closed", async () => {
    const storage = inMemoryStorage()
    vi.setSystemTime(new Date("2026-11-23T09:00:00Z"))
    const on = phone(storage)
    on.run.dispatch({ type: "go", index: 0 })
    await answer(on, "conflict")
    on.run.dispatch({ type: "review" })
    expect(on.run.machine.missing(on.run.bundle.getSnapshot())).toBe("closed")
    on.run.dispatch({ type: "send" })
    expect(interviewSent(storage).list()).toEqual([])
  })
})

describe("a question's ladder on the phone (IW8)", () => {
  it("lets each question's first take go home on its own, and only that one", async () => {
    const storage = inMemoryStorage()
    const on = phone(storage)
    on.run.dispatch({ type: "go", index: 1 })
    await answer(on, "conflict")
    const [first] = on.simulated.store.getSnapshot()
    expect(on.release).toHaveBeenCalledWith([first.id])

    await pass(60_000)
    await answer(on, "conflict")
    const takes = on.simulated.store.getSnapshot()
    // The second take replaces the first on screen and waits for Send;
    // the first, already gone home, is kept, never dropped.
    expect(takes.map(({ id }) => id)).toContain(first.id)
    expect(waiting(on)).toEqual(["2026-w47:conflict"])
    expect(on.release).toHaveBeenCalledTimes(1)
    expect(on.run.ladder.getSnapshot().first).toEqual({ conflict: first.id })
  })

  it("deletes before Send only what never left: a question's first take stays", async () => {
    const on = phone(inMemoryStorage())
    on.run.dispatch({ type: "go", index: 1 })
    await answer(on, "conflict")
    const [first] = on.simulated.store.getSnapshot()
    await pass(60_000)
    await answer(on, "conflict")
    expect(on.release).toHaveBeenCalledWith([first.id])
    expect(waiting(on)).toEqual(["2026-w47:conflict"])

    on.run.dispatch({ type: "review" })
    on.run.dispatch({ type: "askDeleteAll" })
    on.run.dispatch({ type: "confirmed" })
    await pass()
    expect(on.simulated.store.getSnapshot().map(({ id }) => id)).toEqual([
      first.id,
    ])
  })

  it("asks again for a first take that didn't go, and keeps its mark across a reload", async () => {
    const storage = inMemoryStorage()
    const { ports } = fakePorts({ storage })
    let refuse = true
    const release = vi.fn((ids: ReadonlyArray<string>) =>
      refuse ? false : ports.takes.release(ids)
    )
    const run = createInterviewWeek({
      ...ports,
      takes: { ...ports.takes, release },
    })
    run.attach()
    run.dispatch({ type: "go", index: 0 })
    run.dispatch({ type: "tap", item: "why-now" })
    await pass(2_000)
    run.dispatch({ type: "tap", item: "why-now" })
    await pass()
    const marked = run.ladder.getSnapshot().first["why-now"]
    expect(marked).toBeDefined()
    expect(release).toHaveBeenLastCalledWith([marked])

    refuse = false
    run.dispatch({ type: "playAll" })
    await pass()
    expect(release).toHaveBeenLastCalledWith([marked])
    expect(
      ports.takes.takes.getSnapshot().find(({ id }) => id === marked)?.waits
    ).toBeUndefined()

    const again = createInterviewWeek(ports)
    expect(again.ladder.getSnapshot().first["why-now"]).toBe(marked)
  })

  it("asks a refused first take again on the next change, never in its own echo", async () => {
    const { ports, simulated } = fakePorts({ storage: inMemoryStorage() })
    // As the phone's desk does: a refused release still publishes the takes.
    const listeners = new Set<() => void>()
    let shown = simulated.store.getSnapshot()
    const publish = (): void => {
      for (const listener of listeners) listener()
    }
    simulated.store.subscribe(() => {
      shown = simulated.store.getSnapshot()
      publish()
    })
    const release = vi.fn((): boolean => {
      shown = [...shown]
      publish()
      return false
    })
    const run = createInterviewWeek({
      ...ports,
      takes: {
        ...ports.takes,
        takes: {
          getSnapshot: () => shown,
          subscribe: (listener) => {
            listeners.add(listener)
            return (): void => {
              listeners.delete(listener)
            }
          },
        },
        release,
      },
    })
    run.attach()
    run.dispatch({ type: "go", index: 0 })
    run.dispatch({ type: "tap", item: "why-now" })
    await pass(2_000)
    const before = release.mock.calls.length
    run.dispatch({ type: "tap", item: "why-now" })
    await pass()
    expect(release.mock.calls.length - before).toBeLessThan(5)
  })

  it("marks a take kept after the whole week was left with the rung it was asked on", async () => {
    const storage = inMemoryStorage()
    const { ports, simulated } = fakePorts({ storage })
    const run = createInterviewWeek(ports)
    const detach = run.attach()
    run.focus("conflict")
    run.dispatchOn("cues")({ type: "tap", item: "conflict" })
    await pass(2_000)
    detach()
    await pass()
    const [take] = simulated.store.getSnapshot()
    const again = createInterviewWeek(ports)
    again.attach()
    expect(again.ladder.getSnapshot().rungs).toEqual({ [take.id]: "cues" })
  })

  it("marks a take with the rung it was said on, and a read aloud after its cue", async () => {
    const on = phone(inMemoryStorage())
    const leave = on.run.focus("conflict")
    expect(on.run.bundle.getSnapshot()).toMatchObject({
      screen: "cards",
      index: 1,
    })
    const cues = on.run.dispatchOn("cues")
    cues({ type: "tap", item: "conflict" })
    await pass(2_000)
    cues({ type: "tap", item: "conflict" })
    await pass()

    const aloud = on.run.dispatchOn("aloud")
    aloud({ type: "tap", item: "conflict" })
    expect(on.run.cue.getSnapshot().kind).toBe("counting")
    await pass(CUE_SECONDS * 1000)
    await pass(2_000)
    aloud({ type: "tap", item: "conflict" })
    await pass()

    const [oldest, newest] = [...on.simulated.store.getSnapshot()].sort(
      (a, b) => a.recordedAt.localeCompare(b.recordedAt)
    )
    expect(on.run.ladder.getSnapshot().rungs).toEqual({
      [oldest.id]: "cues",
      [newest.id]: "aloud",
    })
    leave()
    expect(on.run.bundle.getSnapshot().screen).toBe("intro")
  })

  it("stops and keeps a take under way when its page goes, then steps back", async () => {
    const on = phone(inMemoryStorage())
    const leave = on.run.focus("why-now")
    on.run.dispatchOn("own")({ type: "tap", item: "why-now" })
    await pass(2_000)
    expect(on.run.bundle.getSnapshot().busy).toBe(true)
    leave()
    await pass()
    expect(on.run.bundle.getSnapshot()).toMatchObject({
      screen: "intro",
      busy: false,
    })
    expect(lines(on)).toEqual(["2026-w47:why-now"])
    const [take] = on.simulated.store.getSnapshot()
    expect(on.run.ladder.getSnapshot().rungs).toEqual({ [take.id]: "own" })
  })
})
