import {
  clock,
  ON,
  playerFor,
  RIGHT,
  WRONG,
} from "@leetype/lib/leetype/incident-play/__tests__/play-through"
import {
  medianSelectionMs,
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
const playThrough = playerFor(FILE, "t1-01")

const START = { type: "act", action: 0 } as const

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

  it("counts a pick slower than twice the median as a struggle, whether correct or not", () => {
    for (const option of [RIGHT, WRONG]) {
      const slow = playThrough([START, option, ON], {
        median: 400,
        gapMs: 1000,
      })
      expect(slow.events).toContainEqual(
        expect.objectContaining({
          type: "picked",
          answer: {
            response: option === RIGHT ? "correct" : "incorrect",
            slow: true,
          },
        })
      )
      expect(slow.events).toContainEqual(
        expect.objectContaining({ type: "parked", screen: "s02" })
      )
    }
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

/**
 * LTY2 (#2332, canon Def. 9.4, Rem. 9.6, Rem. 11.11): a revealed pick goes on
 * to the round's `onHesitate` only when it is correct and slow, and otherwise
 * to its own option's `next`, so a slow incorrect pick takes the incorrect
 * response's follow-up and Def. 9.4's three responses stay three in routing.
 *
 * The Family, enumerated below on round 1 (s02) of variant B: the response
 * (correct, incorrect, abstained) × slow (more than twice the median, or
 * not; an abstention carries no slowness, however long it took) × whether
 * the round authors an `onHesitate`, here one distinct from every option's
 * `next`, so each route is told apart.
 */
describe("LTY2: only a slow correct pick goes to onHesitate", () => {
  const withHesitate = (onHesitate: string | undefined): typeof FILE => {
    const raw = structuredClone(FILE)
    const round = raw.screens.s02
    if (round?.type === "choice") {
      if (onHesitate === undefined) delete round.onHesitate
      else round.onHesitate = onHesitate
    }
    return SessionFileSchema.parse(raw)
  }
  const responses = [
    { response: "correct", option: 0, next: "s05" },
    { response: "incorrect", option: 1, next: "s03" },
    { response: "abstained", option: 4, next: "s03" },
  ] as const
  const family = responses.flatMap((one) =>
    [true, false].flatMap((slow) =>
      [true, false].map((authored) => ({ ...one, slow, authored }))
    )
  )

  it.each(family)(
    "response: $response, slow: $slow, onHesitate authored: $authored",
    ({ response, option, next, slow, authored }) => {
      const file = withHesitate(authored ? "s07" : undefined)
      // The pick takes 1000 ms; it is slow past twice a 400 ms median.
      const { play, events } = playThrough(
        [START, { type: "pick", option }, ON],
        { file, median: slow ? 400 : 600, gapMs: 1000 }
      )
      const hesitated = response === "correct" && slow
      expect(play.screen).toBe(hesitated && authored ? "s07" : next)
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "picked",
          answer: response === "abstained" ? { response } : { response, slow },
        })
      )
      const struggled = response !== "correct" || slow
      expect(events.some((event) => event.type === "parked")).toBe(struggled)
    }
  )
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
