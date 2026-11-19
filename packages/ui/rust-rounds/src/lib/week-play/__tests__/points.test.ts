/**
 * A ticket's points as its card lists them (RR24): an item per point, named
 * by its ticket and number, and the filter and order the card offers.
 */
import type { PointFilter, PointOrder } from "@rust-rounds/lib/week-play/points"
import {
  itemOf,
  pointCounts,
  pointItem,
  pointsShown,
  ticketPoints,
  weekItems,
} from "@rust-rounds/lib/week-play/points"
import { describe, expect, it } from "vitest"

const TICKETS = [
  { id: "QM-1", speakTo: ["a", "b", "c"] },
  { id: "QM-2", speakTo: ["d", "e"] },
]

describe("a ticket's points", () => {
  it("are items of their own after their ticket's, and read back as ticket and point", () => {
    expect(weekItems(TICKETS, false)).toEqual(["QM-1", "QM-2"])
    expect(weekItems(TICKETS, true)).toEqual([
      "QM-1",
      "QM-1:1",
      "QM-1:2",
      "QM-1:3",
      "QM-2",
      "QM-2:1",
      "QM-2:2",
    ])
    expect(itemOf(pointItem("QM-1", 3))).toEqual({ ticket: "QM-1", point: 3 })
    expect(itemOf("QM-1")).toEqual({ ticket: "QM-1", point: null })
  })

  it("are shown all, with a take or with none, as asked or those with none first, the open one always", () => {
    const points = [1, 2, 3, 4].map((n) => ({
      n,
      to: `p${n}`,
      taken: n % 2 === 0,
    }))
    const ns = (
      filter: PointFilter,
      order: PointOrder,
      open = 1
    ): Array<number> =>
      pointsShown(points, filter, order, open).map(({ n }) => n)
    expect(ns("all", "asked")).toEqual([1, 2, 3, 4])
    expect(ns("all", "none-first")).toEqual([1, 3, 2, 4])
    expect(ns("none", "asked")).toEqual([1, 3])
    expect(ns("taken", "asked")).toEqual([1, 2, 4])
    expect(ns("none", "asked", 2)).toEqual([1, 2, 3])
    expect(pointCounts(points)).toEqual({ all: 4, taken: 2, none: 2 })
  })

  it("count each point answered by a take of the whole ticket", () => {
    const own = (n: number): boolean => n === 2
    expect(
      ticketPoints(["a", "b", "c"], own, false).map(({ taken }) => taken)
    ).toEqual([false, true, false])
    expect(pointCounts(ticketPoints(["a", "b", "c"], own, true))).toEqual({
      all: 3,
      taken: 3,
      none: 0,
    })
  })
})
