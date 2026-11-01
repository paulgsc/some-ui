/**
 * A spoken answer on the take pattern (MIC4, #2374), over the simulated
 * microphone every screen's tests share (`spoken-take/__tests__/phone`), on
 * faked timers: tap to record, the take kept is the answer, Redo's in its
 * place, and Let go withdraws it.
 */
import { IncidentPlayRuntime } from "@leetype/lib/leetype/incident-play"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type { SpokenTakes } from "@leetype/lib/leetype/spoken-take"
import { phoneTakes } from "@leetype/lib/leetype/spoken-take/__tests__/phone"
import { rubricText, SessionFileSchema } from "@leetype/types/session-file"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { SPEAKING } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const TAKE = FILE.screens.s15
const RUBRIC = TAKE?.type === "record" ? rubricText(TAKE) : []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** The microphone's timers run `ms` on. */
const settle = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

/** Taps a take on, talks `ms`, taps it off, and lets it be kept. */
async function answerAloud(
  runtime: IncidentPlayRuntime,
  ms: number
): Promise<void> {
  runtime.tapTake()
  await settle(ms)
  runtime.tapTake()
  await settle()
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
  it("is taken on the microphone, then ticked, and goes on when strong", async () => {
    const takes = phoneTakes()
    const { runtime, log } = atTheTake(takes)

    await answerAloud(runtime, 41_000)
    expect(takes.mic.asked()).toBe(1)
    expect(takes.store.getSnapshot()).toEqual([
      expect.objectContaining({ id: "take-1", answers: "t1-01#s15" }),
    ])
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

  it("shows the take's button, time against the cap, and once kept its row", async () => {
    const takes = phoneTakes()
    const { runtime } = atTheTake(takes)
    expect(runtime.getSnapshot().take?.item.button).toEqual({
      kind: "ready",
      again: false,
    })
    runtime.tapTake()
    await settle(2_000)
    expect(runtime.getSnapshot().take?.item.button).toMatchObject({
      kind: "recording",
      elapsedMs: 2_000,
      capMs: 60_000,
    })
    runtime.tapTake()
    await settle()
    const item = runtime.getSnapshot().take?.item
    expect(item?.current).toEqual([
      expect.objectContaining({
        take: expect.objectContaining({ id: "take-1", place: "phone" }),
        canPlay: true,
        canRedo: true,
        canLetGo: true,
      }),
    ])
    runtime.playTake("take-1")
    await settle()
    expect(takes.player.playing()).toBe(1)
  })

  it("takes a Redo's take as the answer, keeping the earlier one (D2)", async () => {
    const takes = phoneTakes()
    const { runtime, log } = atTheTake(takes)
    await answerAloud(runtime, 10_000)
    const shown = log
      .getSnapshot()
      .log.filter((event) => event.type === "rubric-shown").length
    await answerAloud(runtime, 20_000)
    expect(runtime.getSnapshot().play?.spoken).toEqual({
      as: "recorded",
      take: "take-2",
      seconds: 20,
    })
    expect(takes.store.getSnapshot()).toEqual([
      expect.objectContaining({ id: "take-1", standing: "earlier" }),
      expect.objectContaining({ id: "take-2", standing: "current" }),
    ])
    // The rubric was already in view: shown once.
    expect(
      log.getSnapshot().log.filter((event) => event.type === "rubric-shown")
    ).toHaveLength(shown)
    runtime.dispatch({ type: "ticked", ticks: RUBRIC })
    expect(takes.note).toHaveBeenCalledWith(
      expect.objectContaining({ take: "take-2" })
    )
  })

  it("lets a recorded answer's take go, kept, and the answer with it (D3)", async () => {
    const takes = phoneTakes()
    const { runtime } = atTheTake(takes)
    await answerAloud(runtime, 10_000)
    runtime.letGoTake("take-1", "phone")
    expect(runtime.getSnapshot().play?.spoken).toBeNull()
    expect(takes.store.getSnapshot()).toEqual([
      expect.objectContaining({ id: "take-1", standing: "set-aside" }),
    ])
    expect(runtime.getSnapshot().take?.item).toMatchObject({
      button: { kind: "ready", again: false },
      said: { kind: "setAside", place: "phone" },
      current: [],
    })
    // Answered again, aloud.
    await answerAloud(runtime, 5_000)
    expect(runtime.getSnapshot().play?.spoken).toMatchObject({
      as: "recorded",
      take: "take-2",
    })
  })

  it("is weak with fewer ticks than asked, and places its reading", () => {
    const takes = phoneTakes()
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

  it("answers nothing with a take that lands after the learner moved on", async () => {
    const takes = phoneTakes()
    const { runtime } = atTheTake(takes)
    takes.mic.script({ ...SPEAKING, finish: { kind: "after", ms: 10_000 } })
    runtime.tapTake()
    await settle(5_000)
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
    await settle(10_000)
    expect(takes.store.getSnapshot()).toHaveLength(1)
    expect(runtime.getSnapshot().play?.spoken).toBeNull()
    // Nor is its ending said on this visit.
    expect(runtime.getSnapshot().take?.item).toMatchObject({
      button: { kind: "ready", again: false },
      said: null,
      current: [],
    })
    expect(takes.note).not.toHaveBeenCalled()

    // Recording again: the new take is this answer.
    await answerAloud(runtime, 7_000)
    expect(runtime.getSnapshot().play?.spoken).toMatchObject({
      as: "recorded",
      take: "take-2",
    })
  })

  it("still answers the record screen after the surface mounts twice", async () => {
    const takes = phoneTakes()
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
    await answerAloud(runtime, 30_000)
    expect(runtime.getSnapshot().play?.spoken).toMatchObject({
      as: "recorded",
      take: "take-1",
    })
  })

  it("says so when the phone could not keep what an answer said", () => {
    const takes = { ...phoneTakes(), note: vi.fn(() => false) }
    const { runtime } = atTheTake(takes)
    runtime.dispatch({
      type: "answered",
      answer: { as: "typed", text: "a typed answer" },
    })
    runtime.dispatch({ type: "ticked", ticks: RUBRIC })
    expect(runtime.getSnapshot().problem).toMatch(/could not keep/)
  })
})
