import {
  comparedWeeks,
  isoWeekRange,
  lineSaid,
  publicChange,
  publicCount,
  publicLines,
  REPORT_FIELDS,
  reportWeek,
} from "@video-render/engagement-report"
import type {
  AffordanceWeek,
  ReportRegistry,
  ReportWeeks,
} from "@video-render/engagement-report"
import { describe, expect, it } from "vitest"

const REGISTRY: ReportRegistry = [
  {
    id: "topik",
    name: "TOPIK",
    wing: "practice",
    affordances: [
      { id: "read-aloud", surface: "apk", name: "Read aloud" },
      { id: "drama", surface: "apk", name: "Drama" },
      { id: "lens", surface: "apk", name: "Grammar lens" },
      { id: "lens", surface: "web", name: "Grammar lens" },
    ],
  },
  {
    id: "aph",
    name: "aph",
    wing: "self",
    affordances: [{ id: "entry", surface: "apk", name: "An entry" }],
  },
  {
    id: "jobs",
    name: "Jobs",
    wing: "jobs",
    affordances: [{ id: "pass", surface: "apk", name: "A pass" }],
  },
]

function row(
  pipeline: string,
  affordance: string,
  counts: Partial<
    Pick<AffordanceWeek, "offered" | "taken" | "passedOver" | "left">
  >,
  surface: "apk" | "web" = "apk"
): AffordanceWeek {
  return {
    pipeline,
    affordance,
    surface,
    offered: 0,
    taken: 0,
    passedOver: 0,
    left: 0,
    ...counts,
  }
}

const WEEKS: ReportWeeks = {
  week: "2026-W46",
  now: [
    row("topik", "read-aloud", { offered: 12, taken: 9, passedOver: 3 }),
    row("topik", "drama", { offered: 12 }),
    row("aph", "entry", { offered: 3, taken: 3 }),
    row("jobs", "pass", { offered: 4, taken: 2 }),
    row("extension", "unknown", { offered: 40, taken: 40 }),
  ],
  last: [row("topik", "read-aloud", { offered: 10, taken: 6 })],
  quarter: [row("topik", "read-aloud", { offered: 1, taken: 1 })],
  year: null,
}

describe("ISO weeks", () => {
  it("starts a week at Monday midnight on the owner's clock and ends it at the next", () => {
    expect(isoWeekRange("2026-W46")).toEqual({
      from: "2026-11-09T08:00:00.000Z",
      to: "2026-11-16T08:00:00.000Z",
    })
    // The clocks go forward on Sunday 2026-03-08.
    expect(isoWeekRange("2026-W10")).toEqual({
      from: "2026-03-02T08:00:00.000Z",
      to: "2026-03-09T07:00:00.000Z",
    })
  })

  it("compares with the week before, 13 weeks before and the same week a year before", () => {
    expect(comparedWeeks("2026-W46")).toEqual({
      last: "2026-W45",
      quarter: "2026-W33",
      year: "2025-W46",
    })
    expect(comparedWeeks("2026-W01")).toEqual({
      last: "2025-W52",
      quarter: "2025-W40",
      year: "2025-W01",
    })
    expect(comparedWeeks("2026-W53").year).toBe("2025-W52")
  })
})

describe("the public-safety rule (ask #2701)", () => {
  it("bands a count under 5 and keeps a week with no record apart from zero", () => {
    expect(publicCount(0)).toBe("fewer-than-5")
    expect(publicCount(4)).toBe("fewer-than-5")
    expect(publicCount(5)).toBe(5)
    expect(publicCount(null)).toBe("no-data")
  })

  it("never gives a difference that would show a banded count", () => {
    expect(publicChange(9, 6)).toEqual({ way: "up", by: 3 })
    expect(publicChange(6, 9)).toEqual({ way: "down", by: 3 })
    expect(publicChange(7, 7)).toEqual({ way: "flat", by: 0 })
    expect(publicChange(9, 1)).toEqual({ way: "up", by: null })
    expect(publicChange(1, 9)).toEqual({ way: "down", by: null })
    expect(publicChange(1, 3)).toEqual({ way: "unknown", by: null })
    expect(publicChange(9, null)).toEqual({ way: "unknown", by: null })
    expect(publicChange(null, 9)).toEqual({ way: "unknown", by: null })
  })

  it("folds aph and Jobs into one line and drops what the registry does not name", () => {
    const lines = publicLines(WEEKS, REGISTRY)
    expect(lines.map((l) => l.id)).toEqual([
      "topik/read-aloud/apk",
      "topik/drama/apk",
      "topik/lens/apk",
      "topik/lens/web",
      "self-and-work",
    ])
    const self = lines.find((l) => l.id === "self-and-work")
    expect(self?.name).toBe("Self and work")
    expect(self?.counts.offered.now).toBe(7)
    expect(self?.counts.taken.now).toBe(5)
  })

  it("folds by wing, so a new pipeline in the self wing joins the line", () => {
    const registry: ReportRegistry = [
      ...REGISTRY,
      {
        id: "diary",
        name: "Diary",
        wing: "self",
        affordances: [{ id: "page", surface: "apk", name: "A page" }],
      },
    ]
    const weeks = {
      ...WEEKS,
      now: [...(WEEKS.now ?? []), row("diary", "page", { offered: 6 })],
    }
    const lines = publicLines(weeks, registry)
    expect(lines.map((l) => l.id)).not.toContain("diary/page/apk")
    expect(
      lines.find((l) => l.id === "self-and-work")?.counts.offered.now
    ).toBe(13)
  })

  it("never says a quiet line had nothing, only fewer than 5", () => {
    const quiet = publicLines(
      { ...WEEKS, now: [row("topik", "drama", { offered: 4 })] },
      REGISTRY
    )
    expect(quiet.find((l) => l.id === "topik/drama/apk")?.quiet).toBe(true)
    expect(quiet.find((l) => l.id === "topik/read-aloud/apk")?.quiet).toBe(
      false
    )
  })

  it("names the surface only where an affordance is on both", () => {
    const names = publicLines(WEEKS, REGISTRY).map((l) => l.name)
    expect(names).toContain("Read aloud")
    expect(names).toContain("Grammar lens on the phone")
    expect(names).toContain("Grammar lens on the web")
  })

  it("lets only the listed fields reach the file", () => {
    const report = reportWeek(WEEKS, REGISTRY)
    const paths = new Set<string>()
    const walk = (value: unknown, at: string): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item, `${at}[]`)
        return
      }
      if (value !== null && typeof value === "object") {
        for (const [key, inner] of Object.entries(value))
          walk(inner, at === "" ? key : `${at}.${key}`)
        return
      }
      paths.add(
        at
          .replace(
            /counts\.(offered|taken|passedOver|left)\./,
            "counts.offered|taken|passedOver|left."
          )
          .replace(/\.(last|quarter|year)\.(way|by)$/, ".last|quarter|year.$2")
      )
    }
    walk(report, "")
    expect([...paths].sort()).toEqual([...REPORT_FIELDS].sort())
  })
})

describe("reportWeek", () => {
  it("writes the same report from the same counts", () => {
    const one = JSON.stringify(reportWeek(WEEKS, REGISTRY))
    const two = JSON.stringify(reportWeek(structuredClone(WEEKS), REGISTRY))
    expect(one).toBe(two)
  })

  it("says each line from its numbers", () => {
    const report = reportWeek(WEEKS, REGISTRY)
    const said = report.wings.flatMap((w) => w.lines.map((l) => l.said))
    expect(said).toContain(
      "Read aloud: offered 12 times, up 2 on last week; taken 9 times, up 3 on last week."
    )
    expect(said).toContain(
      "Drama: offered 12 times, up on last week; taken fewer than 5 times."
    )
    expect(said).toContain(
      "Grammar lens on the web: fewer than 5 of anything this week, or in any compared week on record."
    )
    expect(report.moved).toBe(
      "What moved most: Read aloud, taken up 3 on last week."
    )
  })

  it("goes through the wings in order, with Self and work last", () => {
    expect(reportWeek(WEEKS, REGISTRY).wings.map((w) => w.name)).toEqual([
      "Practice",
      "Self and work",
    ])
  })

  it("says which earlier weeks it has no record of", () => {
    const report = reportWeek(WEEKS, REGISTRY)
    expect(report.held).toEqual({
      now: true,
      last: true,
      quarter: true,
      year: false,
    })
    expect(report.intro).toContain(
      "There is no record from a year ago to compare with yet."
    )
    expect(report.intro).toContain("with no writer")
  })

  it("reads a week with no record as no data, not zero", () => {
    const report = reportWeek({ ...WEEKS, now: null }, REGISTRY)
    expect(report.wings.flatMap((w) => w.lines).some((l) => l.quiet)).toBe(
      false
    )
    const line = report.wings[0]?.lines[0]
    expect(line?.counts.taken.now).toBe("no-data")
    expect(line && lineSaid(line)).toContain("no record of what was taken")
  })
})
