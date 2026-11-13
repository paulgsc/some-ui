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

/** A move of `take` from `from` (seen at move number `seq`) to `to`. */
const move = (
  id: string,
  from: TakeStation,
  to: TakeStation,
  seq: number,
  take = "take-1",
  at = "2026-11-13T10:00:00Z"
): StationMove => ({
  move: id,
  take,
  from,
  to,
  at,
  seq,
  labels: null,
  comment: null,
})

const moved = (
  state: ConveyorState,
  ...made: ReadonlyArray<StationMove>
): ConveyorState =>
  made.reduce(
    (next, one) => stepConveyor(next, { kind: "moved", move: one }),
    state
  )

const oven = { station: "in-the-oven", stationSeq: 0 } as const

describe("the stations", () => {
  it("start In the oven, and the phone moves only to Cooking, Ready for pickup and Canned", () => {
    expect(FIRST_STATION).toBe("in-the-oven")
    expect(MOVABLE_STATIONS).toEqual(["cooking", "ready-for-pickup", "canned"])
    expect(TAKE_STATIONS).toHaveLength(5)
  })
})

describe("stepConveyor", () => {
  it("keeps every move, oldest first, owed until home answers", () => {
    const a = move("m1", "in-the-oven", "cooking", 0)
    const b = move("m2", "cooking", "ready-for-pickup", 1)
    const state = moved(INITIAL_CONVEYOR, a, b)
    expect(movesOwed(state)).toEqual([a, b])
    const held = stepConveyor(state, { kind: "held", move: "m1" })
    expect(movesOwed(held)).toEqual([b])
    expect(held.moves).toHaveLength(2)
  })

  it("keeps a move made twice once, and never takes back home's answer", () => {
    const a = move("m1", "in-the-oven", "cooking", 0)
    expect(moved(INITIAL_CONVEYOR, a, a).moves).toHaveLength(1)
    const held = stepConveyor(moved(INITIAL_CONVEYOR, a), {
      kind: "held",
      move: "m1",
    })
    expect(stepConveyor(held, { kind: "refused", move: "m1" })).toBe(held)
    expect(stepConveyor(held, { kind: "held", move: "nope" })).toBe(held)
  })

  it("takes with an unkept move only the later moves made along its chain", () => {
    const a = move("m1", "in-the-oven", "cooking", 0)
    const b = move("m2", "cooking", "canned", 1)
    const c = move("m3", "canned", "ready-for-pickup", 2)
    const fromHome = move("m4", "canned", "ready-for-pickup", 5)
    const other = move("m5", "in-the-oven", "canned", 0, "take-2")
    const state = stepConveyor(
      moved(INITIAL_CONVEYOR, a, b, c, fromHome, other),
      { kind: "refused", move: "m1" }
    )
    expect(movesOwed(state)).toEqual([fromHome, other])
  })
})

describe("stationOf", () => {
  const cooking = {
    station: "cooking",
    stationAt: "2026-11-13T12:00:00Z",
    stationSeq: 3,
  } as const

  it("is In the oven for a take nobody moved, and none for a take on no conveyor or from a home before it", () => {
    expect(stationOf("take-1", oven, INITIAL_CONVEYOR)).toEqual({
      station: "in-the-oven",
      at: null,
      seq: 0,
      going: false,
      missed: null,
    })
    expect(stationOf("take-1", { station: null }, INITIAL_CONVEYOR)).toBeNull()
    expect(stationOf("take-1", {}, INITIAL_CONVEYOR)).toBeNull()
  })

  it("is home's word once home is as far on as the phone's move, whatever the clocks say", () => {
    // Made at a later hour, but from move 2: home's move 3 is newer.
    const late = moved(
      INITIAL_CONVEYOR,
      move("m1", "cooking", "canned", 2, "take-1", "2030-01-01T00:00:00Z")
    )
    expect(stationOf("take-1", cooking, late)).toMatchObject({
      station: "cooking",
      seq: 3,
      going: false,
    })
  })

  it("is the phone's move while it is ahead of home's, going until home keeps it", () => {
    // Made at an earlier hour, but from move 3: it is move 4.
    const ahead = moved(
      INITIAL_CONVEYOR,
      move(
        "m1",
        "cooking",
        "ready-for-pickup",
        3,
        "take-1",
        "1999-01-01T00:00:00Z"
      )
    )
    expect(stationOf("take-1", cooking, ahead)).toEqual({
      station: "ready-for-pickup",
      at: "1999-01-01T00:00:00Z",
      seq: 4,
      going: true,
      missed: null,
    })
    const held = stepConveyor(ahead, { kind: "held", move: "m1" })
    expect(stationOf("take-1", cooking, held)?.going).toBe(false)
  })

  it("says the first move home didn't keep, until home moves on past it", () => {
    const refused = stepConveyor(
      moved(INITIAL_CONVEYOR, move("m1", "cooking", "canned", 3)),
      { kind: "refused", move: "m1" }
    )
    expect(stationOf("take-1", cooking, refused)).toMatchObject({
      station: "cooking",
      missed: { to: "canned", why: "refused" },
    })
    expect(
      stationOf("take-1", { ...cooking, stationSeq: 4 }, refused)?.missed
    ).toBeNull()
  })

  it("shows where home said a stale move found the take, and since when if home says so", () => {
    const stale = stepConveyor(
      moved(INITIAL_CONVEYOR, move("m1", "in-the-oven", "cooking", 0)),
      { kind: "stale", move: "m1", there: { station: "cooking", seq: 3 } }
    )
    expect(stationOf("take-1", oven, stale)).toEqual({
      station: "cooking",
      at: null,
      seq: 3,
      going: false,
      missed: { to: "cooking", why: "stale" },
    })
    expect(stationOf("take-1", cooking, stale)?.at).toBe(cooking.stationAt)
    // Home moved on again since: its word, and nothing missed.
    expect(
      stationOf("take-1", { station: "canned", stationSeq: 4 }, stale)
    ).toMatchObject({ station: "canned", missed: null })
  })

  it("says a move dropped as off the conveyor", () => {
    const off = stepConveyor(
      moved(INITIAL_CONVEYOR, move("m1", "in-the-oven", "cooking", 0)),
      { kind: "off", move: "m1" }
    )
    expect(stationOf("take-1", oven, off)?.missed).toEqual({
      to: "cooking",
      why: "off",
    })
  })

  it("shows the phone's move from a home before the conveyor, and nothing for a station it doesn't know", () => {
    const state = moved(
      INITIAL_CONVEYOR,
      move("m1", "in-the-oven", "cooking", 0)
    )
    expect(stationOf("take-1", {}, state)?.station).toBe("cooking")
    expect(
      stationOf(
        "take-1",
        { stationAt: "2026-11-13T12:00:00Z", stationSeq: 4 },
        state
      )
    ).toBeNull()
  })
})

describe("homeStationOf", () => {
  it("reads home's station and number, none for an idea's answer, and drops one it doesn't know", () => {
    expect(
      homeStationOf({ station: "canned", stationAt: "x", stationSeq: 2 })
    ).toEqual({ station: "canned", stationAt: "x", stationSeq: 2 })
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

  it("makes the move asked from the move number seen, trimming what rides along", () => {
    expect(
      moveOf(
        {
          take: "t",
          from: "in-the-oven",
          seq: 0,
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
        seq: 0,
        labels: ["like it", "rough"],
        comment: null,
      },
    })
    const kept = moveOf(
      { take: "t", from: "cooking", seq: 1, to: "canned" },
      "m",
      at
    )
    expect(kept.kind === "move" && kept.move.labels).toBeNull()
    const blank = moveOf(
      { take: "t", from: "cooking", seq: 1, to: "canned", labels: [" ", ""] },
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
    const base = { take: "t", from: "cooking", seq: 1 } as const
    expect(why({ ...base, to: "cooking" })).toBe("here")
    expect(why({ ...base, to: "picked-up" })).toBe("pickup")
    expect(why({ ...base, from: "picked-up", to: "canned" })).toBe("final")
    expect(why({ ...base, to: "in-the-oven" })).toBe("oven")
    expect(why({ ...base, from: "canned", to: "cooking" })).toBeNull()
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
    // Home keeps no control character (a tab or a line break) in either.
    expect(why({ ...base, to: "canned", comment: "two\nlines" })).toBe(
      "comment"
    )
    expect(why({ ...base, to: "canned", labels: ["tab\there"] })).toBe("labels")
  })
})

describe("parseConveyor", () => {
  it("reads back what it keeps, a stale move's place included, and nothing else", () => {
    const state = stepConveyor(
      moved(INITIAL_CONVEYOR, move("m1", "in-the-oven", "cooking", 0)),
      { kind: "stale", move: "m1", there: { station: "canned", seq: 2 } }
    )
    expect(parseConveyor(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(parseConveyor({ moves: [{ move: "m1" }] })).toBeNull()
    expect(
      parseConveyor({ moves: [{ ...state.moves[0], seq: "1" }] })
    ).toBeNull()
    expect(
      parseConveyor({ moves: [{ ...state.moves[0], there: "canned" }] })
    ).toBeNull()
    expect(parseConveyor(null)).toBeNull()
  })
})
