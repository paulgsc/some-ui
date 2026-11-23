/**
 * @vitest-environment node
 *
 * The board's step (C1117, C1118, C1160, C1161): filters and orders close
 * the menu, a pick follows the train to its page and never touches the
 * owner's filter, sliding stays on the line, and the list holds at most
 * TRAINS_MAX trains, TRAINS_PER_PAGE to a page.
 */
import { describe, expect, it } from "vitest"

import type { Board } from "@/lib/cooking/board"
import {
  activeOf,
  INITIAL_BOARD,
  narrowed,
  ordered,
  pagesOf,
  shown,
  stepBoard,
  TRAINS_MAX,
  TRAINS_PER_PAGE,
} from "@/lib/cooking/board"
import { trainsOf } from "@/lib/cooking/model"

import { copies, FACTS, RUN, trainOf } from "./fixtures"

const trains = trainsOf(RUN, FACTS)
const step = (b: Board, e: Parameters<typeof stepBoard>[1]): Board =>
  stepBoard(b, e, trains, "G2")

describe("the board", () => {
  it("lists the owner's trains first, then the longest waiting", () => {
    expect(shown(INITIAL_BOARD, trains).map((t) => t.id)).toEqual([
      "G2",
      "G7",
      "G1",
      "G3",
      "G5",
    ])
  })

  it("closes the menu on a filter or an order, and says the list is narrowed", () => {
    const open = step(INITIAL_BOARD, { kind: "menu", open: true })
    const you = step(open, { kind: "filtered", filter: "you" })
    expect(you.menu).toBe(false)
    expect(narrowed(you)).toBe(true)
    expect(shown(you, trains).map((t) => t.id)).toEqual(["G2", "G7"])
  })

  it("follows a picked stop to its train's page, and never changes the filter", () => {
    const many = copies(trainOf("G5"), 8)
    const picked = stepBoard(
      INITIAL_BOARD,
      { kind: "picked", train: "G17", stop: 0 },
      many,
      null
    )
    expect(picked).toMatchObject({
      selected: "G17",
      open: "G17",
      page: 1,
      active: { G17: 0 },
    })
    const narrowedBoard = { ...INITIAL_BOARD, filter: "you" as const }
    const hidden = step(narrowedBoard, { kind: "picked", train: "G5", stop: 0 })
    expect(hidden).toMatchObject({ filter: "you", selected: "G5", page: 0 })
  })

  it("slides the card along the selected train, never off its line", () => {
    const g2 = trainOf("G2")
    expect(activeOf(INITIAL_BOARD, g2)).toBe(g2.current)
    let b = step(INITIAL_BOARD, { kind: "slid", by: 1 })
    b = step(b, { kind: "slid", by: 1 })
    expect(activeOf(b, g2)).toBe(g2.stops.length - 1)
    for (let i = 0; i < 9; i += 1) b = step(b, { kind: "slid", by: -1 })
    expect(activeOf(b, g2)).toBe(0)
  })

  it("holds at most the cap, a page at a time", () => {
    const many = copies(trainOf("G5"), TRAINS_MAX + 3)
    expect(ordered(INITIAL_BOARD, many)).toHaveLength(TRAINS_MAX)
    expect(pagesOf(INITIAL_BOARD, many)).toBe(
      Math.ceil(TRAINS_MAX / TRAINS_PER_PAGE)
    )
    expect(
      stepBoard(INITIAL_BOARD, { kind: "paged", page: 99 }, many, null).page
    ).toBe(2)
  })
})
