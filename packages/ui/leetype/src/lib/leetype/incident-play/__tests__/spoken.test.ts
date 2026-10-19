import { IncidentPlayRuntime } from "@leetype/lib/leetype/incident-play"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type {
  SpokenTakes,
  SpokenTakeSnapshot,
} from "@leetype/lib/leetype/spoken-take"
import { SessionFileSchema } from "@leetype/types/session-file"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const TAKE = FILE.screens.s15
const RUBRIC = TAKE?.type === "record" ? TAKE.rubric : []

/** A microphone the test lands takes on. */
function fakeTakes(): SpokenTakes & {
  land: (id: string, durationMs: number) => void
} {
  let snapshot: SpokenTakeSnapshot = {
    recording: false,
    said: null,
    last: null,
    full: false,
    notesFull: false,
  }
  const listeners = new Set<() => void>()
  const publish = (next: SpokenTakeSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => void listeners.delete(listener)
    },
    start: vi.fn(() => publish({ ...snapshot, recording: true })),
    stop: vi.fn(),
    reset: vi.fn(() => publish({ ...snapshot, last: null })),
    note: vi.fn(() => true),
    land: (id, durationMs): void =>
      publish({ ...snapshot, recording: false, last: { id, durationMs } }),
  }
}

/** Plays variant B's short form to its take on s15. */
function atTheTake(takes: SpokenTakes): {
  runtime: IncidentPlayRuntime
  log: ReturnType<typeof createSessionLogStore>
} {
  const log = createSessionLogStore(memoryStorage())
  let id = 0
  const runtime = new IncidentPlayRuntime({
    log,
    now: (): number => 0,
    newId: (): string => `id${String(++id)}`,
    takes,
  })
  runtime.attach()
  runtime.start({ fileName: "t1-01", file: FILE, form: "short" })
  runtime.dispatch({ type: "act", action: 0 })
  runtime.dispatch({ type: "pick", option: 0 })
  runtime.dispatch({ type: "continue" })
  runtime.dispatch({ type: "act", action: 2 })
  runtime.dispatch({ type: "pick", option: 0 })
  expect(runtime.getSnapshot().play?.screen).toBe("s15")
  return { runtime, log }
}

describe("a spoken answer", () => {
  it("is taken on the microphone, then ticked, and goes on when strong", () => {
    const takes = fakeTakes()
    const { runtime, log } = atTheTake(takes)
    expect(takes.reset).toHaveBeenCalled()

    runtime.record()
    expect(takes.start).toHaveBeenCalledWith({ file: "t1-01", screen: "s15" })
    takes.land("take-1", 41_000)
    expect(runtime.getSnapshot().play?.spoken).toEqual({
      as: "recorded",
      take: "take-1",
      seconds: 41,
    })

    runtime.dispatch({
      type: "ticked",
      ticks: [RUBRIC[0] ?? "", RUBRIC[2] ?? "", "not on the rubric"],
    })
    expect(log.getSnapshot().log.at(-2)).toMatchObject({
      type: "spoken",
      screen: "s15",
      answer: {
        as: "recorded",
        seconds: 41,
        ticks: [RUBRIC[0], RUBRIC[2]],
        strong: true,
      },
    })
    expect(takes.note).toHaveBeenCalledWith({
      take: "take-1",
      file: "t1-01",
      screen: "s15",
      prompt: TAKE?.type === "record" ? TAKE.prompt : "",
      rubric: RUBRIC,
      ticks: [RUBRIC[0], RUBRIC[2]],
      typed: null,
    })
    expect(runtime.getSnapshot().play?.screen).toBe("s21")
  })

  it("is weak with fewer ticks than asked, and places its reading", () => {
    const takes = fakeTakes()
    const { runtime, log } = atTheTake(takes)
    runtime.dispatch({
      type: "answered",
      answer: { as: "typed", text: "a typed answer on the bus" },
    })
    expect(runtime.getSnapshot().play?.spoken).toMatchObject({ as: "typed" })
    // Leaving now would lose the answer before its rubric.
    runtime.dispatch({ type: "leave" })
    expect(runtime.getSnapshot().play?.ended).toBeNull()

    runtime.dispatch({ type: "ticked", ticks: [RUBRIC[1] ?? ""] })
    expect(log.getSnapshot().log.slice(-3)).toEqual([
      expect.objectContaining({
        type: "spoken",
        answer: { as: "typed", ticks: [RUBRIC[1]], strong: false },
      }),
      expect.objectContaining({
        type: "placed",
        screen: "s15",
        reading: "s18",
        as: "placement",
      }),
      expect.objectContaining({ type: "parked", screen: "s15" }),
    ])
    expect(takes.note).toHaveBeenCalledWith(
      expect.objectContaining({
        take: null,
        typed: "a typed answer on the bus",
      })
    )
  })

  it("answers nothing with a take that lands after the learner moved on", () => {
    const takes = fakeTakes()
    const { runtime } = atTheTake(takes)
    runtime.record()
    runtime.dispatch({ type: "pass" })
    // A pass shows the rubric before going on (Def. 9.5).
    expect(runtime.getSnapshot().play?.spoken).toEqual({ as: "passed" })
    expect(runtime.getSnapshot().play?.screen).toBe("s15")
    runtime.dispatch({ type: "ticked", ticks: [] })
    expect(runtime.getSnapshot().play?.screen).toBe("s18")
    // Back on the same take, by "Say it again": the old take lands late.
    runtime.dispatch({
      type: "take-parked",
      round: "s15",
      reading: "s18",
      take: "round",
      asked: true,
    })
    expect(runtime.getSnapshot().play?.screen).toBe("s15")
    takes.land("late", 5_000)
    expect(runtime.getSnapshot().play?.spoken).toBeNull()
    expect(takes.note).not.toHaveBeenCalled()

    // Recording again: the late take is still the port's last, and is not
    // taken for this answer; the new one is.
    runtime.record()
    expect(runtime.getSnapshot().play?.spoken).toBeNull()
    takes.land("fresh", 7_000)
    expect(runtime.getSnapshot().play?.spoken).toMatchObject({
      as: "recorded",
      take: "fresh",
    })
  })

  it("still answers the record screen after the surface mounts twice", () => {
    const takes = fakeTakes()
    const log = createSessionLogStore(memoryStorage())
    let id = 0
    const runtime = new IncidentPlayRuntime({
      log,
      now: (): number => 0,
      newId: (): string => `id${String(++id)}`,
      takes,
    })
    // React's StrictMode: mount, clean up, mount again.
    runtime.attach()()
    runtime.attach()
    runtime.start({ fileName: "t1-01", file: FILE, form: "short" })
    for (const input of [
      { type: "act", action: 0 },
      { type: "pick", option: 0 },
      { type: "continue" },
      { type: "act", action: 2 },
      { type: "pick", option: 0 },
    ] as const) {
      runtime.dispatch(input)
    }
    runtime.record()
    takes.land("take-1", 30_000)
    expect(runtime.getSnapshot().play?.spoken).toMatchObject({
      as: "recorded",
      take: "take-1",
    })
  })

  it("says so when the phone could not keep what an answer said", () => {
    const takes = { ...fakeTakes(), note: vi.fn(() => false) }
    const { runtime } = atTheTake(takes)
    runtime.dispatch({
      type: "answered",
      answer: { as: "typed", text: "a typed answer" },
    })
    runtime.dispatch({ type: "ticked", ticks: RUBRIC })
    expect(runtime.getSnapshot().problem).toMatch(/could not keep/)
  })
})
