import {
  cellOf,
  chartOf,
  dueAt,
  recordOf,
  roleAt,
  weeksBetween,
} from "@rust-rounds/lib/decay"
import type { Judged } from "@rust-rounds/lib/decay"
import { SAMPLE_FIRST, SAMPLE_JUDGED } from "@rust-rounds/lib/decay/sample"
import {
  ESSAY_CONCEPTS_MOST,
  ESSAY_WEEKS_MOST,
  sampleEssay,
} from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

const BOUNDS = { weeks: ESSAY_WEEKS_MOST, concepts: ESSAY_CONCEPTS_MOST }
const DROP = { id: "drop-order", name: "Drop order and destructors" }

/** One concept checked at `levels`, a week apart from 2026-w01, null for a silence, undefined for unchecked. */
const weeksOf = (
  levels: ReadonlyArray<number | null | undefined>
): Array<Judged> =>
  levels.flatMap((level, i) => {
    const week = `2026-w${String(i + 1).padStart(2, "0")}`
    return level === undefined
      ? [{ week, tickets: [] }]
      : [{ week, tickets: [{ concepts: [DROP], level }] }]
  })

const row = (
  levels: ReadonlyArray<number | null | undefined>
): Array<unknown> => {
  const judged = weeksOf(levels)
  const [record] = recordOf(judged)
  if (record === undefined) throw new Error("no concept")
  return judged.map((j) => cellOf(record, j.week))
}

describe("the decay record's states", () => {
  it("tells the sample's history apart exactly as the sample essay draws it", () => {
    const essay = sampleEssay()
    if (!essay.ok) throw new Error(essay.problems.join("; "))
    const record = recordOf(SAMPLE_JUDGED)
    const chart = chartOf(
      record,
      SAMPLE_JUDGED.map((j) => j.week),
      SAMPLE_FIRST,
      BOUNDS
    )
    expect(chart.weeks).toEqual(essay.value.weeks.weeks)
    expect(chart.concepts).toEqual(essay.value.weeks.concepts)
    expect(roleAt(record, chart.weeks)).toEqual(essay.value.weeks.role)
  })

  it("draws shown, met not known, not met, silent, decayed and faded", () => {
    expect(row([undefined, 2, 4, 3, null])).toEqual([
      "unmet",
      2,
      4,
      { level: 3, below: "2026-w03" },
      "silent",
    ])
  })

  it("takes a decayed level as where it stands, so holding it again climbs", () => {
    expect(row([5, 4, 4, 3])).toEqual([
      5,
      { level: 4, below: "2026-w01" },
      4,
      { level: 3, below: "2026-w02" },
    ])
  })

  it("presumes fading only of what was known, once its Leitner recheck has passed", () => {
    // Known in week 1 (box 2: two weeks); unchecked in 2, faded from 3.
    expect(row([4, undefined, undefined])).toEqual([4, "unmet", "faded"])
    // Known twice (box 3: four weeks).
    expect(row([4, 4, undefined, undefined, undefined, undefined])).toEqual([
      4,
      4,
      "unmet",
      "unmet",
      "unmet",
      "faded",
    ])
    // Below relational is never known, so it never fades: it's simply due.
    expect(row([3, undefined, undefined, undefined])).toEqual([
      3,
      "unmet",
      "unmet",
      "unmet",
    ])
  })

  it("counts whole weeks between week ids, across a 53-week year", () => {
    expect(weeksBetween("2026-w53", "2027-w01")).toBe(1)
  })
})

describe("the concepts due a recheck", () => {
  it("are the Leitner system's: a known answer waits longer each time, a slip comes back next week", () => {
    const due = (
      levels: ReadonlyArray<number | null | undefined>,
      week: string
    ): Array<string> => dueAt(recordOf(weeksOf(levels)), week).map((d) => d.why)
    expect(due([4], "2026-w02")).toEqual([])
    expect(due([4], "2026-w03")).toEqual(["faded"])
    expect(due([4, 4], "2026-w05")).toEqual([])
    expect(due([4, 4], "2026-w06")).toEqual(["faded"])
    expect(due([5, 4], "2026-w03")).toEqual(["decayed"])
    expect(due([3], "2026-w02")).toEqual(["not-yet-known"])
    expect(due([null], "2026-w02")).toEqual(["not-answered"])
    expect(due([4, null], "2026-w03")).toEqual(["not-answered"])
    expect(due([5, 4, 4], "2026-w05")).toEqual(["faded"])
  })

  it("come decayed first, then faded, then unanswered, then not yet known, the longest overdue first", () => {
    expect(dueAt(recordOf(SAMPLE_JUDGED), "2026-w47")).toEqual([
      {
        id: "borrows-into-a-reused-buffer",
        name: "Borrows into a reused buffer",
        why: "decayed",
        last: "2026-w46",
      },
      {
        id: "cancellation-safety",
        name: "Cancellation safety",
        why: "not-answered",
        last: "2026-w45",
      },
      {
        id: "static-and-threads",
        name: "'static and threads",
        why: "not-answered",
        last: "2026-w46",
      },
      {
        id: "send-and-sync",
        name: "Send and Sync",
        why: "not-yet-known",
        last: "2026-w44",
      },
    ])
  })

  it("leave out a concept whose latest answer is still to be read", () => {
    const due = dueAt(
      recordOf(SAMPLE_JUDGED),
      "2026-w47",
      new Set(["send-and-sync"])
    )
    expect(due.map((d) => d.id)).not.toContain("send-and-sync")
  })
})

describe("the role line", () => {
  it("waits for three weeks of answers, never reading one", () => {
    const record = recordOf(SAMPLE_JUDGED.slice(0, 2))
    expect(roleAt(record, ["2026-w41", "2026-w42"]).fits).toBe(
      "Not worked out yet"
    )
  })

  it("is the stage whose SOLO level half the concepts hold, since the week it began", () => {
    const judged = weeksOf([5, 5, 5])
    const role = roleAt(
      recordOf(judged),
      judged.map((j) => j.week)
    )
    expect([role.fits, role.next]).toEqual([
      "Proficient, since week 3",
      "Expert",
    ])
    expect(role.gap).toMatch(/can.t show/)
  })
})
