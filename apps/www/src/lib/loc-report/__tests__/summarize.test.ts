import { describe, expect, it } from "vitest"

import type { LocSnapshot, RepoDay } from "@/lib/loc-report/schema"
import { readSnapshot } from "@/lib/loc-report/schema"
import { compactCount, summarize } from "@/lib/loc-report/summarize"

const lines = (add: number, del = 0, genAdd = 0, genDel = 0): RepoDay => ({
  add,
  del,
  genAdd,
  genDel,
})

/**
 * Oct 1 to Oct 3, two repositories, a lockfile bump on the 3rd, and a week of
 * work before the 7-day window for the comparison to find.
 */
const snapshot: LocSnapshot = {
  version: 1,
  generatedAt: "2026-10-03T12:00:00Z",
  through: "2026-10-03",
  repos: ["some-ui", "server"],
  days: [
    { date: "2026-09-26", repos: { "some-ui": lines(100, 10) } },
    { date: "2026-09-30", repos: { "some-ui": lines(100, 10) } },
    { date: "2026-10-01", repos: { "some-ui": lines(300, 30) } },
    {
      date: "2026-10-03",
      repos: {
        "some-ui": lines(100, 20, 5000, 4000),
        server: lines(50, 5),
      },
    },
  ],
}

describe("summarize", () => {
  it("totals the days up to the snapshot's last day, not today", () => {
    const week = summarize(snapshot, "7d", false)
    expect(week.from).toBe("2026-09-27")
    expect(week.to).toBe("2026-10-03")
    // Sep 30 + Oct 1 + both repos on Oct 3. Sep 26 is the day before the window.
    expect(week.added).toBe(100 + 300 + 100 + 50)
    expect(week.removed).toBe(10 + 30 + 20 + 5)
    expect(week.net).toBe(week.added - week.removed)
  })

  it("counts lockfiles and generated files only when asked to", () => {
    expect(summarize(snapshot, "7d", true).added).toBe(550 + 5000)
    expect(summarize(snapshot, "7d", true).removed).toBe(65 + 4000)
  })

  it("draws bars that add back up to the total, one per day for a week", () => {
    const week = summarize(snapshot, "7d", false)
    expect(week.buckets).toHaveLength(7)
    expect(week.buckets.reduce((sum, bar) => sum + bar.added, 0)).toBe(
      week.added
    )
    expect(week.buckets[6]).toMatchObject({
      from: "2026-10-03",
      to: "2026-10-03",
      added: 150,
    })
  })

  it("groups longer ranges into whole-day bars that still cover every day", () => {
    const quarter = summarize(snapshot, "90d", false)
    expect(quarter.buckets).toHaveLength(9)
    expect(quarter.buckets[0].from).toBe(quarter.from)
    expect(quarter.buckets[8].to).toBe("2026-10-03")
    expect(quarter.added).toBe(100 + 100 + 300 + 150)
  })

  it("splits the added lines by repository, in the snapshot's order", () => {
    expect(summarize(snapshot, "7d", false).repos).toEqual([
      { repo: "some-ui", added: 500 },
      { repo: "server", added: 50 },
    ])
  })

  it("compares with the same number of days before", () => {
    const week = summarize(snapshot, "7d", false)
    // Sep 20 to Sep 26 held only the 100 added on the 26th.
    expect(week.previousAdded).toBe(100)
    expect(week.deltaPercent).toBe(450)
  })

  it("has no comparison when the period before was empty", () => {
    const month = summarize(snapshot, "30d", false)
    expect(month.previousAdded).toBe(0)
    expect(month.deltaPercent).toBeNull()
  })
})

describe("readSnapshot", () => {
  it("reads the placeholder a checkout carries before any build wrote one as nothing", () => {
    expect(
      readSnapshot({
        version: 1,
        generatedAt: null,
        through: null,
        repos: [],
        days: [],
      })
    ).toBeNull()
  })

  it("hides the widget instead of throwing on a file it cannot read", () => {
    expect(readSnapshot({ version: 2 })).toBeNull()
    expect(readSnapshot(null)).toBeNull()
  })

  it("reads what the generator writes", () => {
    expect(readSnapshot(snapshot)).toEqual(snapshot)
  })
})

describe("compactCount", () => {
  it.each([
    [0, "0"],
    [612, "612"],
    [1000, "1k"],
    [2431, "2.4k"],
    [31_980, "32k"],
  ])("%i is %s", (count, expected) => {
    expect(compactCount(count)).toBe(expected)
  })
})
