/** @vitest-environment node */
import { describe, expect, it } from "vitest"

import type {
  ConveyorState,
  StationMove,
  TakeStation,
} from "@/lib/take-conveyor/model"
import {
  COMMENT_CHARS,
  FIRST_STATION,
  homeStationOf,
  INITIAL_CONVEYOR,
  LABEL_CHARS,
  LABELS_MAX,
  labelsOf,
  MOVABLE_STATIONS,
  moveOf,
  movesOwed,
  parseConveyor,
  stationOf,
  stepConveyor,
  TAKE_STATIONS,
} from "@/lib/take-conveyor/model"

const move = (
  id: string,
  to: TakeStation,
  at: string,
  take = "take-1",
  from: TakeStation = "in-the-oven"
): StationMove => ({
  move: id,
  take,
  from,
  to,
  at,
  labels: null,
  comment: null,
})

const moved = (state: ConveyorState, made: StationMove): ConveyorState =>
  stepConveyor(state, { kind: "moved", move: made })

describe("the stations", () => {
  it("start In the oven, and the phone moves only to Cooking, Ready for pickup and Canned", () => {
    expect(FIRST_STATION).toBe("in-the-oven")
    expect(MOVABLE_STATIONS).toEqual(["cooking", "ready-for-pickup", "canned"])
    expect(TAKE_STATIONS).toHaveLength(5)
  })
})

describe("stepConveyor", () => {
  it("keeps every move, oldest first, owed until home answers", () => {
    const a = move("m1", "cooking", "2026-11-13T10:00:00Z")
    const b = move("m2", "ready-for-pickup", "2026-11-13T11:00:00Z")
    const state = moved(moved(INITIAL_CONVEYOR, a), b)
    expect(movesOwed(state)).toEqual([a, b])
    const held = stepConveyor(state, { kind: "held", move: "m1" })
    expect(movesOwed(held)).toEqual([b])
    expect(held.moves).toHaveLength(2)
    const stale = stepConveyor(held, {
      kind: "stale",
      move: "m2",
      there: null,
    })
    expect(movesOwed(stale)).toEqual([])
    expect(stale.moves).toHaveLength(2)
  })

  it("keeps a move made twice once, and never takes back home's answer", () => {
    const a = move("m1", "cooking", "2026-11-13T10:00:00Z")
    expect(moved(moved(INITIAL_CONVEYOR, a), a).moves).toHaveLength(1)
    const held = stepConveyor(moved(INITIAL_CONVEYOR, a), {
      kind: "held",
      move: "m1",
    })
    expect(stepConveyor(held, { kind: "refused", move: "m1" })).toBe(held)
    expect(stepConveyor(held, { kind: "held", move: "nope" })).toBe(held)
  })
})

describe("stationOf", () => {
  const home = { station: "cooking" as const, stationAt: "2026-11-13T12:00Z" }

  it("is In the oven for a take nobody moved, and none for a take on no conveyor or from a home before it", () => {
    expect(
      stationOf("take-1", { station: "in-the-oven" }, INITIAL_CONVEYOR)
    ).toEqual({
      station: "in-the-oven",
      at: null,
      going: false,
      missed: null,
    })
    expect(stationOf("take-1", { station: null }, INITIAL_CONVEYOR)).toBeNull()
    expect(stationOf("take-1", {}, INITIAL_CONVEYOR)).toBeNull()
  })

  it("is home's word when the phone made no later move", () => {
    const earlier = moved(
      INITIAL_CONVEYOR,
      move("m1", "ready-for-pickup", "2026-11-13T11:00:00Z")
    )
    expect(stationOf("take-1", home, earlier)).toEqual({
      station: "cooking",
      at: home.stationAt,
      going: false,
      missed: null,
    })
  })

  it("is the phone's later move, going until home keeps it", () => {
    const later = moved(
      INITIAL_CONVEYOR,
      move("m1", "ready-for-pickup", "2026-11-13T13:00:00Z")
    )
    expect(stationOf("take-1", home, later)).toEqual({
      station: "ready-for-pickup",
      at: "2026-11-13T13:00:00Z",
      going: true,
      missed: null,
    })
    const held = stepConveyor(later, { kind: "held", move: "m1" })
    expect(stationOf("take-1", home, held)?.going).toBe(false)
  })

  it("shows home's word with the move home didn't keep, until a later word", () => {
    const state = stepConveyor(
      moved(
        moved(
          INITIAL_CONVEYOR,
          move("m0", "canned", "2026-11-13T13:00Z", "another")
        ),
        move("m1", "ready-for-pickup", "2026-11-13T13:00:00Z")
      ),
      { kind: "stale", move: "m1", there: null }
    )
    expect(stationOf("take-1", home, state)).toEqual({
      station: "cooking",
      at: home.stationAt,
      going: false,
      missed: { to: "ready-for-pickup", why: "stale" },
    })
    expect(
      stationOf(
        "take-1",
        { station: "canned", stationAt: "2026-11-13T14:00Z" },
        state
      )?.missed
    ).toBeNull()
  })
})

describe("a move home didn't keep (review of #2944)", () => {
  it("takes the phone's later moves of the same take with it, and says the first", () => {
    const a = move("m1", "cooking", "2026-11-13T10:00:00Z")
    const b = move("m2", "canned", "2026-11-13T10:05:00Z", "take-1", "cooking")
    const other = move("m3", "canned", "2026-11-13T10:06:00Z", "take-2")
    const state = stepConveyor(
      moved(moved(moved(INITIAL_CONVEYOR, a), b), other),
      { kind: "refused", move: "m1" }
    )
    expect(movesOwed(state)).toEqual([other])
    expect(stationOf("take-1", { station: "in-the-oven" }, state)).toEqual({
      station: "in-the-oven",
      at: null,
      going: false,
      missed: { to: "cooking", why: "refused" },
    })
  })

  it("shows where home said a stale move found the take", () => {
    const state = stepConveyor(
      moved(
        INITIAL_CONVEYOR,
        move("m1", "ready-for-pickup", "2026-11-13T10:00:00Z")
      ),
      { kind: "stale", move: "m1", there: "canned" }
    )
    expect(stationOf("take-1", { station: "in-the-oven" }, state)).toEqual({
      station: "canned",
      at: null,
      going: false,
      missed: { to: "ready-for-pickup", why: "stale" },
    })
  })

  it("shows the phone's move from a home before the conveyor, which says nothing", () => {
    const state = moved(
      INITIAL_CONVEYOR,
      move("m1", "cooking", "2026-11-13T10:00:00Z")
    )
    expect(stationOf("take-1", {}, state)?.station).toBe("cooking")
  })
})

describe("homeStationOf", () => {
  it("reads home's station, none for an idea's answer, and drops one it doesn't know", () => {
    expect(homeStationOf({ station: "canned", stationAt: "x" })).toEqual({
      station: "canned",
      stationAt: "x",
    })
    expect(homeStationOf({ station: null }).station).toBeNull()
    expect(homeStationOf({ station: "elsewhere" }).station).toBeUndefined()
    expect(homeStationOf({}).station).toBeUndefined()
  })
})

describe("labelsOf", () => {
  it("splits on commas, and none typed keeps the take's", () => {
    expect(labelsOf("keeper, brand")).toEqual(["keeper", "brand"])
    expect(labelsOf("  ,  ")).toBeNull()
    expect(labelsOf("")).toBeNull()
  })
})

describe("moveOf", () => {
  const at = "2026-11-13T10:00:00.000Z"

  it("makes the move asked, trimming what rides along", () => {
    expect(
      moveOf(
        {
          take: "t",
          from: "in-the-oven",
          to: "cooking",
          labels: [" like it ", "", "like it", "rough"],
          comment: "  ",
        },
        "m1",
        at
      )
    ).toEqual({
      kind: "move",
      move: {
        move: "m1",
        take: "t",
        from: "in-the-oven",
        to: "cooking",
        at,
        labels: ["like it", "rough"],
        comment: null,
      },
    })
    const kept = moveOf({ take: "t", from: "cooking", to: "canned" }, "m", at)
    expect(kept.kind === "move" && kept.move.labels).toBeNull()
    // Blank labels keep the take's, as none typed does.
    const blank = moveOf(
      { take: "t", from: "cooking", to: "canned", labels: [" ", ""] },
      "m",
      at
    )
    expect(blank.kind === "move" && blank.move.labels).toBeNull()
  })

  it("refuses where it is, Picked up, a picked-up take, In the oven, and more than home keeps", () => {
    const why = (asked: Parameters<typeof moveOf>[0]): unknown => {
      const made = moveOf(asked, "m", at)
      return made.kind === "refused" ? made.why : null
    }
    const base = { take: "t", from: "cooking" } as const
    expect(why({ ...base, to: "cooking" })).toBe("here")
    expect(why({ ...base, to: "picked-up" })).toBe("pickup")
    expect(why({ take: "t", from: "picked-up", to: "canned" })).toBe("final")
    expect(why({ ...base, to: "in-the-oven" })).toBe("oven")
    expect(why({ take: "t", from: "canned", to: "cooking" })).toBeNull()
    expect(
      why({
        ...base,
        to: "ready-for-pickup",
        labels: Array.from({ length: LABELS_MAX + 1 }, (_, i) => `l${i}`),
      })
    ).toBe("labels")
    expect(
      why({ ...base, to: "canned", labels: ["x".repeat(LABEL_CHARS + 1)] })
    ).toBe("labels")
    expect(
      why({ ...base, to: "canned", comment: "x".repeat(COMMENT_CHARS + 1) })
    ).toBe("comment")
    expect(
      why({ ...base, to: "canned", comment: "x".repeat(COMMENT_CHARS) })
    ).toBeNull()
    // Home keeps no control character (a line break) in either.
    expect(why({ ...base, to: "canned", comment: "two\nlines" })).toBe(
      "comment"
    )
    expect(why({ ...base, to: "canned", labels: ["tab\there"] })).toBe("labels")
  })
})

describe("parseConveyor", () => {
  it("reads back what it keeps, and nothing else", () => {
    const state = moved(
      INITIAL_CONVEYOR,
      move("m1", "cooking", "2026-11-13T10:00:00Z")
    )
    expect(parseConveyor(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(parseConveyor({ moves: [{ move: "m1" }] })).toBeNull()
    expect(
      parseConveyor({ moves: [{ ...state.moves[0], to: "oven" }] })
    ).toBeNull()
    expect(parseConveyor(null)).toBeNull()
  })
})
