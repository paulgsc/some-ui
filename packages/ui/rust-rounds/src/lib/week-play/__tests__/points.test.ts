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

  it("are shown all, unsaid or said, as asked or the unsaid first", () => {
    const points = [1, 2, 3, 4].map((n) => ({
      n,
      to: `p${n}`,
      said: n % 2 === 0,
    }))
    const ns = (filter: PointFilter, order: PointOrder): Array<number> =>
      pointsShown(points, filter, order).map(({ n }) => n)
    expect(ns("all", "asked")).toEqual([1, 2, 3, 4])
    expect(ns("all", "unsaid-first")).toEqual([1, 3, 2, 4])
    expect(ns("unsaid", "asked")).toEqual([1, 3])
    expect(ns("said", "asked")).toEqual([2, 4])
    expect(pointCounts(points)).toEqual({ all: 4, said: 2, unsaid: 2 })
  })
})
