import { describe, expect, it } from "vitest"

import type { Application, Course, Outcome } from "@/lib/jobs/model"
import type { Row } from "@/lib/jobs/record-view"
import {
  countStands,
  matching,
  PIVOT_ROWS,
  pivotRows,
  rowOf,
  sortRows,
  standOf,
} from "@/lib/jobs/record-view"

import { digest } from "./fixture"

const [PICK] = digest("2026-10-01").picks

/** An application picked on `day` from `company`, standing by `course`. */
function row(day: string, company: string, course: Course): Row {
  const application: Application = {
    day,
    pick: {
      ...PICK,
      id: `${company}-${day}`,
      posting: { ...PICK.posting, company },
    },
    progress: { kind: "done", result: "submitted" },
    outcomes: [],
  }
  return rowOf(application, course)
}

const waiting = (since: string, reached: Outcome | null = null): Course => ({
  kind: "waiting",
  since,
  reached,
  next: [],
})

const ended = (
  since: string,
  by: "offer" | "rejected" | "no-reply-30d"
): Course => ({
  kind: "ended",
  since,
  by,
  on: since,
  reached: null,
  next: [],
})

describe("standOf", () => {
  it("names each course in one word", () => {
    expect(standOf({ kind: "applying" })).toBe("applying")
    expect(standOf({ kind: "unsent", result: "closed" })).toBe("unsent")
    expect(standOf(waiting("2026-10-01"))).toBe("waiting")
    // Viewed is not a reply.
    expect(standOf(waiting("2026-10-01", "viewed"))).toBe("waiting")
    expect(standOf(waiting("2026-10-01", "screen"))).toBe("heard")
    expect(standOf(ended("2026-10-01", "offer"))).toBe("offer")
    expect(standOf(ended("2026-10-01", "rejected"))).toBe("rejected")
    expect(standOf(ended("2026-10-01", "no-reply-30d"))).toBe("silent")
  })
})

describe("sortRows", () => {
  const rows = [
    row("2026-10-05", "beta", ended("2026-10-06", "rejected")),
    row("2026-10-01", "Acme", waiting("2026-10-02")),
    row("2026-10-08", "acme", waiting("2026-10-09", "screen")),
    row("2026-10-09", "Cobalt", { kind: "unsent", result: "gave-up" }),
  ]
  const order = (sort: Parameters<typeof sortRows>[1]): ReadonlyArray<string> =>
    sortRows(rows, sort).map((r) => r.application.pick.id)

  it("sorts by the day sent, newest or oldest first", () => {
    expect(order("newest")).toEqual([
      "Cobalt-2026-10-09",
      "acme-2026-10-08",
      "beta-2026-10-05",
      "Acme-2026-10-01",
    ])
    expect(order("oldest")).toEqual([...order("newest")].reverse())
  })

  it("puts the open ones first, longest waiting first, then the rest newest first", () => {
    expect(order("waiting")).toEqual([
      "Acme-2026-10-01",
      "acme-2026-10-08",
      "Cobalt-2026-10-09",
      "beta-2026-10-05",
    ])
  })

  it("sorts companies A to Z whatever their case, newest first within one", () => {
    expect(order("company")).toEqual([
      "acme-2026-10-08",
      "Acme-2026-10-01",
      "beta-2026-10-05",
      "Cobalt-2026-10-09",
    ])
  })

  it("finds a company or a title, any case, and counts how they stand", () => {
    expect(matching(rows, "  ACME ")).toHaveLength(2)
    expect(matching(rows, PICK.posting.title.toUpperCase())).toHaveLength(4)
    expect(matching(rows, "")).toBe(rows)
    expect(countStands(rows)).toEqual({
      waiting: 1,
      heard: 1,
      offer: 0,
      rejected: 1,
      silent: 0,
      applying: 0,
      unsent: 1,
    })
  })
})

describe("pivotRows", () => {
  it("groups by week and month newest first, counting how each stands", () => {
    const rows = [
      row("2026-10-27", "A", waiting("2026-10-27")),
      row("2026-10-27", "B", ended("2026-10-30", "rejected")),
      row("2026-10-20", "C", waiting("2026-10-21", "interview")),
      row("2026-09-30", "D", ended("2026-09-30", "no-reply-30d")),
    ]
    expect(
      pivotRows(rows, "week").map((g) => [g.key, g.total, g.counts.rejected])
    ).toEqual([
      ["2026-10-26", 2, 1],
      ["2026-10-19", 1, 0],
      ["2026-09-28", 1, 0],
    ])
    expect(pivotRows(rows, "month").map((g) => [g.key, g.total])).toEqual([
      ["2026-10", 3],
      ["2026-09", 1],
    ])
  })

  it("puts the companies applied to most first, and folds the rest past the limit", () => {
    const rows = Array.from({ length: PIVOT_ROWS + 2 }, (_, i) =>
      row(
        `2026-10-${String(i + 1).padStart(2, "0")}`,
        `Co${i}`,
        waiting("2026-10-01")
      )
    ).concat([row("2026-10-20", "Co9", waiting("2026-10-20"))])
    const groups = pivotRows(rows, "company")
    expect(groups).toHaveLength(PIVOT_ROWS)
    expect(groups[0]).toMatchObject({ key: "Co9", total: 2 })
    expect(groups.at(-1)).toMatchObject({ key: null, total: 3 })
    expect(groups.reduce((n, g) => n + g.total, 0)).toBe(rows.length)
  })
})
