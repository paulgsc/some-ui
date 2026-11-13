/**
 * The engagement report as a video (ENG12 step 3, #2700): every pinned
 * version of its format parses and the newest is the code's; home's answer
 * (paulgsc/server#819) becomes the writer's four weeks, or is refused with
 * every reason; and the sample's scenes, words, cut list and chapters come
 * out the same every time.
 */
import { parseCutList } from "@video-render/cut-list"
import {
  ENGAGEMENT_REPORT_ID,
  reportWeek,
} from "@video-render/engagement-report"
import type {
  EngagementReport,
  ReportRegistry,
} from "@video-render/engagement-report"
import {
  HomeWeeksSchema,
  NOTHING_MOVED,
  pageSaid,
  REPORT_PAGE_LINES,
  REPORT_VERSION,
  reportChapterMarks,
  reportCutList,
  reportFormat,
  reportPages,
  reportProblems,
  reportScenes,
  reportStoryboard,
  reportVersionRefusal,
  reportWeeksOf,
  sampleReport,
} from "@video-render/engagement-report-video"
import type { HomeWeeks } from "@video-render/engagement-report-video"
import { templateStoryboard } from "@video-render/templates"
import sampleHome from "@video-render/templates/engagement-report/sample-weeks.json"
import { describe, expect, it } from "vitest"

function sample(): EngagementReport {
  const parsed = sampleReport()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

/** The sample's answer from home, as a fresh copy to change. */
const home = (): HomeWeeks => HomeWeeksSchema.parse(structuredClone(sampleHome))

describe("the report's format", () => {
  it("refuses a version newer than the newest (VS1)", () => {
    expect(reportVersionRefusal(REPORT_VERSION)).toBe(null)
    expect(() => reportFormat(REPORT_VERSION + 1)).toThrow(
      reportVersionRefusal(REPORT_VERSION + 1) ?? ""
    )
  })

  it("pins the storyboard its code makes", () => {
    // The phone reads the pin, since it can't carry this module.
    expect(templateStoryboard(ENGAGEMENT_REPORT_ID)).toEqual(reportStoryboard())
  })
})

describe("home's answer, as the writer's four weeks", () => {
  it("names each week by its role, and a week home held nothing for as null", () => {
    const weeks = reportWeeksOf(sampleHome)
    if (!weeks.ok) throw new Error(weeks.problems.join("; "))
    expect(weeks.value.week).toBe("2026-W46")
    expect(weeks.value.now?.length).toBe(11)
    expect(weeks.value.last?.length).toBe(8)
    expect(weeks.value.quarter?.length).toBe(3)
    expect(weeks.value.year).toBe(null)
  })

  it("leaves out a row on a surface no line is on", () => {
    const raw = home()
    raw.weeks[0]?.affordances.push({
      pipeline: "topik",
      affordance: "next-lesson",
      surface: "extension",
      offered: 9,
      taken: 9,
      passedOver: 0,
      left: 0,
    })
    const weeks = reportWeeksOf(raw)
    expect(weeks.ok && weeks.value.now?.length).toBe(11)
  })

  it("refuses a week still under way, and edges not on the owner's clock", () => {
    const raw = home()
    const now = raw.weeks[0]
    if (now === undefined) throw new Error("no week")
    now.complete = false
    now.from = "2026-11-09T00:00:00.000Z"
    const weeks = reportWeeksOf(raw)
    expect(weeks.ok ? [] : weeks.problems).toEqual([
      "weeks: this week runs 2026-11-09T00:00:00.000Z to 2026-11-16T08:00:00.000Z, not the owner's 2026-11-09T08:00:00.000Z to 2026-11-16T08:00:00.000Z",
      "weeks: 2026-W46 hasn't ended, so its report could change",
    ])
  })

  it("refuses a week missing, one twice, and other weeks than asked", () => {
    const raw = home()
    raw.weeks = raw.weeks.filter((week) => week.role !== "yearAgo")
    raw.weeks.push(structuredClone(raw.weeks[1] ?? raw.weeks[0]!))
    raw.week = "2026-W47"
    const weeks = reportWeeksOf(raw)
    expect(weeks.ok ? [] : weeks.problems).toEqual([
      "weeks: last is there twice",
      "weeks: the last week is 2026-W45, not 2026-W46",
      "weeks: the quarterAgo week is 2026-W33, not 2026-W34",
      "weeks: this week is 2026-W46, not 2026-W47",
      "weeks: this week runs 2026-11-09T08:00:00.000Z to 2026-11-16T08:00:00.000Z, not the owner's 2026-11-16T08:00:00.000Z to 2026-11-23T08:00:00.000Z",
      "weeks: there is no yearAgo week",
    ])
  })

  it("refuses what isn't an answer, by where", () => {
    const weeks = reportWeeksOf({ week: "2026-W46", weeks: [{ role: "now" }] })
    expect(weeks.ok ? [] : weeks.problems[0]).toMatch(/^weeks\.0\.role: /)
  })
})

describe("the sample report's scenes", () => {
  it("open on the intro and overview, a chapter per wing, and close on what moved", () => {
    expect(reportScenes(sample()).map((scene) => scene.id)).toEqual([
      "intro",
      "brand-in",
      "overview",
      "chapter-wing-1",
      "pipeline-1",
      "pipeline-2",
      "chapter-wing-2",
      "pipeline-3",
      "chapter-wing-3",
      "pipeline-4",
      "chapter-wing-4",
      "pipeline-5",
      "chapter-moved",
      "moved",
      "brand-out",
    ])
  })

  it("read out each line that showed, and count the rest together", () => {
    const said = Object.fromEntries(
      reportScenes(sample()).map((scene) => [scene.id, scene.said])
    )
    expect(said.overview).toBe(
      "Practice: 3 of 6 lines taken 5 times or more. Studio: 2 of 2 lines taken 5 times or more. Operate: 0 of 1 line taken 5 times or more. Self and work: 1 of 1 line taken 5 times or more."
    )
    expect(said["pipeline-2"]).toBe(
      "Rust Rounds. This week's ticket: offered 6 times, the same as last week; taken 5 times, up on last week. 1 more line had fewer than 5 of anything this week, or in any compared week on record."
    )
    expect(said["pipeline-4"]).toBe(
      "Lessons: every line had fewer than 5 of anything this week, or in any compared week on record."
    )
    // The folded line is one line of its own name: said once.
    expect(said["pipeline-5"]).toBe(
      "Self and work: offered 12 times, the same as last week; taken 9 times, the same as last week."
    )
    expect(said.moved).toBe(
      "What moved most: Next lesson, taken up 3 on last week."
    )
  })

  it("make a cut list that parses, with a chapter at each slide", () => {
    const report = sample()
    const scenes = reportScenes(report)
    const cut = reportCutList(
      report,
      scenes.map(() => null)
    )
    expect(parseCutList(cut).ok).toBe(true)
    expect(cut.shots.map((shot) => shot.id)).toEqual(
      scenes.map((scene) => scene.id)
    )
    expect(reportChapterMarks(report).map((mark) => mark.title)).toEqual([
      "Practice",
      "Studio",
      "Operate",
      "Self and work",
      "What moved most",
    ])
  })
})

/** A registry of one practice pipeline with `n` lines. */
const wide = (n: number): ReportRegistry => [
  {
    id: "wide",
    name: "Wide",
    wing: "practice",
    affordances: Array.from({ length: n }, (_, i) => ({
      id: `a${String(i)}`,
      surface: "apk" as const,
      name: `Line ${String(i + 1)}`,
    })),
  },
]

describe("a pipeline with more lines than a table holds", () => {
  it("takes a page per table, each said as its part", () => {
    const report = reportWeek(
      { week: "2026-W46", now: [], last: null, quarter: null, year: null },
      wide(REPORT_PAGE_LINES + 2)
    )
    const pages = reportPages(report)
    expect(
      pages.map((page) => [page.lines.length, page.page, page.of])
    ).toEqual([
      [REPORT_PAGE_LINES, 1, 2],
      [2, 2, 2],
    ])
    expect(pages.map(pageSaid)).toEqual([
      "Wide, part 1: every line had fewer than 5 of anything this week, or in any compared week on record.",
      "Wide, part 2: every line had fewer than 5 of anything this week, or in any compared week on record.",
    ])
    expect(reportProblems(report)).toEqual([])
  })

  it("a week with no record says so once a table, and nothing moved", () => {
    const report = reportWeek(
      { week: "2026-W46", now: null, last: null, quarter: null, year: null },
      wide(3)
    )
    const said = reportScenes(report).map((scene) => scene.said)
    expect(said).toContain("Wide: there is no record of this week.")
    expect(said).toContain("Home holds no record of this week.")
    expect(said).toContain(NOTHING_MOVED)
  })

  it("refuses more tables than the template holds", () => {
    const report = reportWeek(
      { week: "2026-W46", now: [], last: null, quarter: null, year: null },
      wide(REPORT_PAGE_LINES * 25)
    )
    expect(reportProblems(report)).toEqual([
      "report: 25 statement tables, and the template holds 24",
    ])
  })
})
