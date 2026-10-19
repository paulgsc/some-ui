import type {
  Play,
  PlayInput,
  StepContext,
} from "@leetype/lib/leetype/incident-play/model"
import {
  medianSelectionMs,
  startPlay,
  step,
} from "@leetype/lib/leetype/incident-play/model"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import type { SessionEvent } from "@leetype/lib/leetype/session-log/model"
import { ledgerOf } from "@leetype/lib/leetype/session-log/model"
import { SessionFileSchema } from "@leetype/types/session-file"
import { describe, expect, it } from "vitest"

// Variant B: s01 info → s02 round 1 (correct → s05 pointer; else s03
// placement → "Read now" s04 return) → s06 round 2 … s14 the take → s21 end.
const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const T0 = Date.parse("2026-10-18T20:00:00.000Z")

function clock(median: number | null = null): {
  ctx: (after: number) => StepContext
} {
  let id = 0
  return {
    ctx: (after): StepContext => ({
      at: T0 + after,
      newId: () => `e${String(++id)}`,
      medianMs: median,
      hiddenMs: 0,
    }),
  }
}

/** Plays `inputs` in turn, one second apart, collecting every event. */
function playThrough(
  inputs: ReadonlyArray<PlayInput>,
  options: {
    median?: number | null
    form?: "full" | "short"
    gapMs?: number
  } = {}
): { play: Play; events: Array<SessionEvent> } {
  const { ctx } = clock(options.median ?? null)
  const gap = options.gapMs ?? 1000
  const started = startPlay(
    {
      fileName: "t1-01",
      file: FILE,
      session: "s1",
      form: options.form ?? "full",
    },
    ctx(0)
  )
  let play = started.play
  const events = [...started.events]
  inputs.forEach((input, index) => {
    const stepped = step(play, input, ctx((index + 1) * gap))
    play = stepped.play
    events.push(...stepped.events)
  })
  return { play, events }
}

const START = { type: "act", action: 0 } as const
const WRONG = { type: "pick", option: 1 } as const
const RIGHT = { type: "pick", option: 0 } as const
const ON = { type: "continue" } as const

describe("an incident session's steps", () => {
  it("starts on the file's first screen, declaring its length", () => {
    const { play, events } = playThrough([])
    expect(play.screen).toBe("s01")
    expect(events).toEqual([
      expect.objectContaining({
        type: "started",
        file: "t1-01",
        form: "full",
        declaredMinutes: 10,
      }),
    ])
    expect(playThrough([], { form: "short" }).events[0]).toMatchObject({
      declaredMinutes: 5,
    })
  })

  it("reveals the worked confirmation after a correct pick and offers the pointer", () => {
    const { play, events } = playThrough([START, RIGHT])
    expect(play.reveal).toMatchObject({
      answer: { response: "correct", slow: false },
      struggled: false,
      confirmation: true,
    })
    expect(events.at(-1)).toMatchObject({
      type: "picked",
      screen: "s02",
      option:
        FILE.screens.s02?.type === "choice"
          ? FILE.screens.s02.options[0]?.label
          : "",
      ms: 1000,
    })

    const on = playThrough([START, RIGHT, ON])
    expect(on.play.screen).toBe("s05")
    expect(on.play.placement).toEqual({ round: "s02", as: "pointer" })
    expect(on.events.at(-1)).toMatchObject({
      type: "placed",
      screen: "s02",
      reading: "s05",
      as: "pointer",
    })
    expect(on.events.some((event) => event.type === "parked")).toBe(false)
  })

  it("after a struggle shows no answer, places the reading and parks the round", () => {
    const wrong = playThrough([START, WRONG])
    expect(wrong.play.reveal).toMatchObject({
      answer: { response: "incorrect", slow: false },
      struggled: true,
      confirmation: false,
    })
    const placed = playThrough([START, WRONG, ON])
    expect(placed.play.screen).toBe("s03")
    expect(placed.events.slice(-2)).toEqual([
      expect.objectContaining({
        type: "placed",
        screen: "s02",
        reading: "s03",
        as: "placement",
      }),
      expect.objectContaining({ type: "parked", screen: "s02" }),
    ])
    const abstained = playThrough([START, { type: "pick", option: 4 }])
    expect(abstained.play.reveal).toMatchObject({
      answer: { response: "abstained" },
      struggled: true,
    })
  })

  it("keeps the worked confirmation one action away, and records taking it", () => {
    const { play, events } = playThrough([
      START,
      WRONG,
      { type: "show-confirmation" },
    ])
    expect(play.reveal?.confirmation).toBe(true)
    expect(events.at(-1)).toMatchObject({
      type: "confirmation-taken",
      screen: "s02",
    })
  })

  it("returns the parked round with new numbers once its reading is read, and lets it go when solved", () => {
    const { play, events } = playThrough([START, WRONG, ON, START, RIGHT])
    expect(events.slice(-2)).toEqual([
      expect.objectContaining({
        type: "reading",
        reading: "s03",
        action: "read",
      }),
      expect.objectContaining({
        type: "returned",
        screen: "s02",
        variant: "s04",
        asked: false,
        answer: { response: "correct", slow: false },
      }),
    ])
    expect(play.reveal?.returnOf).toBe("s02")
    expect(ledgerOf(events, "s1").parked).toEqual([])
  })

  it("lets the learner ask for the return before reading, and records that it was asked", () => {
    const { play, events } = playThrough([
      START,
      WRONG,
      ON,
      { type: "ask-return" },
      WRONG,
    ])
    expect(play.screen).toBe("s04")
    expect(events.at(-1)).toMatchObject({
      type: "returned",
      screen: "s02",
      asked: true,
      answer: { response: "incorrect" },
    })
    expect(events.some((event) => event.type === "reading")).toBe(false)
    expect(ledgerOf(events, "s1").parked).toEqual([
      { file: "t1-01", screen: "s02", reading: "s03" },
    ])
  })

  it("counts a pick slower than twice the median as a struggle, and goes where a slow pick goes", () => {
    const slow = playThrough([START, RIGHT, ON], { median: 400, gapMs: 1000 })
    expect(slow.events).toContainEqual(
      expect.objectContaining({
        type: "picked",
        answer: { response: "correct", slow: true },
      })
    )
    expect(slow.play.screen).toBe("s03")
    expect(slow.events).toContainEqual(
      expect.objectContaining({ type: "parked", screen: "s02" })
    )
    // No median yet: never slow, however long the pick took.
    const unjudged = playThrough([START, RIGHT], {
      median: null,
      gapMs: 60_000,
    })
    expect(unjudged.play.reveal?.struggled).toBe(false)
  })

  it("skips from the first incident to the take in the short form", () => {
    const { play } = playThrough(
      [START, RIGHT, ON, { type: "act", action: 2 }],
      { form: "short" }
    )
    expect(play.screen).toBe("s14")
  })

  it("leaves at a round boundary, never in the middle of a reveal", () => {
    const midReveal = playThrough([START, WRONG, { type: "leave" }])
    expect(midReveal.play.ended).toBeNull()
    const left = playThrough([START, { type: "leave" }])
    expect(left.play.ended).toBe("left")
    expect(left.events.at(-1)).toMatchObject({
      type: "ended",
      screen: "s02",
      how: "left",
    })
    // Nothing after the end is recorded.
    expect(step(left.play, START, clock().ctx(9000)).events).toEqual([])
  })

  it("ends as declared on reaching the end screen, and a passed take is a struggle that places", () => {
    const { play, events } = playThrough([
      START,
      RIGHT,
      ON,
      { type: "act", action: 2 },
      RIGHT,
      ON,
      { type: "act", action: 2 },
      RIGHT,
      ON,
      { type: "act", action: 2 },
      { type: "pick", option: 0 },
      ON,
      { type: "pass" },
      { type: "ticked", ticks: [] },
      { type: "act", action: 2 },
    ])
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "spoken",
        screen: "s15",
        answer: { as: "passed" },
      })
    )
    expect(events).toContainEqual(
      expect.objectContaining({ type: "placed", screen: "s15", reading: "s18" })
    )
    expect(play.screen).toBe("s21")
    expect(play.ended).toBe("declared")
    expect(events.at(-1)).toMatchObject({ type: "ended", how: "declared" })
  })
})

describe("medianSelectionMs", () => {
  const picked = (
    ms: number,
    response: "correct" | "abstained"
  ): SessionEvent => ({
    id: String(ms),
    at: "2026-10-18T20:00:00.000Z",
    session: "s",
    type: "picked",
    file: "f",
    screen: "r",
    option: "o",
    ms,
    answer: response === "abstained" ? { response } : { response, slow: false },
  })

  it("has no median before five selections, and never counts an abstention", () => {
    const four = [100, 200, 300, 400].map((ms) => picked(ms, "correct"))
    expect(medianSelectionMs(four)).toBeNull()
    expect(medianSelectionMs([...four, picked(9, "abstained")])).toBeNull()
    expect(medianSelectionMs([...four, picked(500, "correct")])).toBe(300)
    expect(
      medianSelectionMs([
        ...four,
        picked(500, "correct"),
        picked(600, "correct"),
      ])
    ).toBe(350)
  })
})
