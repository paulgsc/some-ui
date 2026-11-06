import { sampleCallWeek } from "@some-ui/video-render"
import type { CallWeek } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { callAt, weekAt, weeksOf } from "./view"

const week = (): CallWeek => {
  const parsed = sampleCallWeek()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("the call's stage", () => {
  it("shows the scene named, with the item it draws", () => {
    const at = callAt(week(), "asks-2")
    expect(at.scene.id).toBe("asks-2")
    expect(at.view.section).toBe("asks")
    expect("item" in at.view && at.view.item.id).toBe("talk-d1")
    expect(at.index).toBe(at.scenes.length - 2)
  })

  it("opens on the first scene when the id names none", () => {
    for (const id of [undefined, "", "asks-9"]) {
      const at = callAt(week(), id)
      expect([at.index, at.scene.id, at.view]).toEqual([
        0,
        "open",
        { section: "open" },
      ])
    }
  })
})

describe("the call's weeks", () => {
  const sample = sampleCallWeek()
  const later = { ...week(), week: { from: "2026-11-06", to: "2026-11-12" } }

  it("keeps each file named for its week, newest first, and says why any other isn't", () => {
    const got = weeksOf({
      "./weeks/2026-10-30.json": week(),
      "./weeks/2026-11-06.json": later,
      "./weeks/2026-11-13.json": week(),
      "./weeks/broken.json": { nope: true },
    })
    expect(got.weeks.map((w) => w.week.from)).toEqual([
      "2026-11-06",
      "2026-10-30",
    ])
    expect(got.problems[0]).toBe(
      "2026-11-13.json: it holds the week of 2026-10-30"
    )
    expect(
      got.problems.slice(1).every((p) => p.startsWith("broken.json: "))
    ).toBe(true)
  })

  it("shows the week named, else the newest, and the sample only when asked or when there is none", () => {
    const weeks = weeksOf({
      "./weeks/2026-10-30.json": week(),
      "./weeks/2026-11-06.json": later,
    })
    expect(weekAt(weeks, sample, "2026-10-30")?.week.week.from).toBe(
      "2026-10-30"
    )
    expect(weekAt(weeks, sample, undefined)?.week.week.from).toBe("2026-11-06")
    expect(weekAt(weeks, sample, "1999-01-01")).toMatchObject({
      week: { week: { from: "2026-11-06" } },
      missing: true,
    })
    expect(weekAt(weeks, sample, undefined)?.missing).toBe(false)
    expect(weekAt(weeks, sample, "sample")?.sample).toBe(true)
    expect(weekAt({ weeks: [], problems: [] }, sample, undefined)?.sample).toBe(
      true
    )
  })

  it("holds every week the weekly run committed", () => {
    const committed = weeksOf(
      import.meta.glob<unknown>("./weeks/*.json", {
        eager: true,
        import: "default",
      })
    )
    expect(committed.problems).toEqual([])
    expect(committed.weeks.length).toBeGreaterThan(0)
  })
})
