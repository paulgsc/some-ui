/**
 * The weekly engagement report as a video (ENGAGE ENG12 step 3, #2700): the
 * template that draws `engagement-report.ts`'s report, scene by scene, in the
 * call's series, and what home's render worker feeds it.
 *
 * **What it reads.** Home's period read (paulgsc/server#819,
 * `GET /app-events/weeks/:week`) answers four weeks of raw per-affordance
 * counts; `reportWeeksOf` turns that answer into the writer's `ReportWeeks`,
 * and `reportWeek` applies the public-safety rule and writes every word. This
 * module adds no number of its own: a scene shows the report's lines, and the
 * only words it writes are templates over how many lines there are (the
 * overview, and the line that counts a pipeline's quiet lines).
 *
 * **The scenes**, the same for every week (`reportFormat`):
 *
 * 1. the locked intro: that code wrote it from home's records, with no
 *    writer; then the brand;
 * 2. `overview`: each wing, and how many of its lines were taken 5 times or
 *    more;
 * 3. for each wing, a chapter slide, then its pipelines, one statement table
 *    each (`pipeline`, repeated; a pipeline of more than
 *    `REPORT_PAGE_LINES` lines takes more than one);
 * 4. `moved`, under its own chapter: the line whose taken count moved most
 *    on last week;
 * 5. the brand outro.
 *
 * Deterministic: the same answer from home gives the same report, the same
 * scenes and the same words, and so the same video.
 */

import { z } from "zod"

import { CALL_ID, CALL_STAGE_WIDTH, nightInMotion } from "./call"
import type { LockedIntro } from "./call"
import type { ChapterMark } from "./chapters"
import { chapterSlides } from "./chapters"
import { once, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import {
  comparedWeeks,
  ENGAGEMENT_REPORT_ID,
  EngagementReportSchema,
  isoWeekRange,
  QUIET_SAID,
  reportWeek,
  UNDER,
} from "./engagement-report"
import type {
  AffordanceWeek,
  EngagementReport,
  ReportRegistry,
  ReportWeeks,
} from "./engagement-report"
import { FORMAT_SCHEMA, repeatedId, versionRefusal } from "./format"
import type { Format, Shape } from "./format"
import { hasCaptions, stillFile, stillsCutList } from "./stills"
import type { StillTake } from "./stills"
import { boardSceneOf, storyboardOf } from "./storyboard"
import type { Storyboard } from "./storyboard"
import sampleHome from "./templates/engagement-report/sample-weeks.json"

/** The newest version `reportFormat` gives, pinned as `v<n>.json` under `templates/`. */
export const REPORT_VERSION = 1

/** The most lines one statement table shows; a pipeline with more takes more pages. */
export const REPORT_PAGE_LINES = 8

/** The most statement tables a report has (the most a format repeats a scene; the registry's lines make 15 today). */
const PAGES_MOST = 24

/** The one voice that says the report: home's Kokoro, as the call's host. */
export const REPORT_VOICE = "am_michael"

type Section = "overview" | "pipeline" | "moved"

/** The scenes a shape adds: the locked intro, the brand intro and outro, and a chapter slide. */
type Framing = "intro" | "brand-in" | "chapter" | "brand-out"

const scene = (
  id: Section,
  name: string,
  point: string,
  holdMs: number
): Format["scenes"][number] => ({
  id,
  name,
  point,
  picture: {
    kind: "capture",
    from: `the report's ${id} view`,
    cssWidth: CALL_STAGE_WIDTH,
  },
  holdMs,
  ...(id === "pipeline" ? { repeat: { max: PAGES_MOST } } : {}),
})

/**
 * The report's shape: the call's, Mochi Night with the moving brand intro
 * and outro, a chapter slide opening each wing and what moved most, and
 * every word captioned.
 */
const REPORT_SHAPE: Shape = nightInMotion({
  brand: { intro: true, outro: true },
  chapters: ["pipeline", "moved"],
  subtitles: "word",
})

/** Why `version` of the report's template can't be drawn here, or null (VS1). */
export const reportVersionRefusal = (version: number): string | null =>
  versionRefusal("the engagement report's template", REPORT_VERSION, version)

/** The report's format at `version`. Throws for a version this build doesn't know. */
export function reportFormat(version: number = REPORT_VERSION): Format {
  const refused = reportVersionRefusal(version)
  if (refused !== null) throw new Error(refused)
  return {
    schema: FORMAT_SCHEMA,
    id: ENGAGEMENT_REPORT_ID,
    version,
    title: "The weekly engagement report",
    series: { id: CALL_ID, version: 2 },
    look: "calm",
    scenes: [
      scene(
        "overview",
        "The week at a glance",
        "Each wing, and how many of its lines were taken 5 times or more",
        20_000
      ),
      scene(
        "pipeline",
        "A pipeline",
        "What it offered and what was taken, against last week, a quarter ago and a year ago",
        30_000
      ),
      scene(
        "moved",
        "What moved most",
        "The line whose taken count moved most on last week",
        15_000
      ),
    ],
    shape: REPORT_SHAPE,
  }
}

// ---------------------------------------------------------------------------
// What home answers

const count = z.number().int().nonnegative()

/**
 * Home's answer to `GET /app-events/weeks/:week` (paulgsc/server#819,
 * `crates/db/app_event/src/weeks.rs`' `Weekly`). Only what the report reads
 * is checked; `seen` (first and last-taken days) is never read, since the
 * public-safety rule keeps days out.
 */
export const HomeWeeksSchema = z.object({
  week: z.string(),
  weeks: z.array(
    z.object({
      role: z.enum(["this", "last", "quarterAgo", "yearAgo"]),
      week: z.string(),
      from: z.string(),
      to: z.string(),
      complete: z.boolean(),
      measured: z.boolean(),
      affordances: z.array(
        z.object({
          pipeline: z.string(),
          affordance: z.string(),
          surface: z.string(),
          offered: count,
          taken: count,
          passedOver: count,
          left: count,
        })
      ),
    })
  ),
})

export type HomeWeeks = z.infer<typeof HomeWeeksSchema>

const isSurface = (surface: string): surface is AffordanceWeek["surface"] =>
  surface === "apk" || surface === "web"

/**
 * The writer's four weeks from home's answer: `this` is now, `quarterAgo` a
 * quarter, `yearAgo` a year; a week home held nothing for before it ended
 * (`measured: false`) is null, which reads "no data". Refuses, with every
 * reason, an answer that lacks a week or names one twice, a week still under
 * way (its report would change), and edges other than the owner's Pacific
 * week the writer reads (`isoWeekRange`). A row on a surface the registry has
 * no lines for is left out, as the writer leaves out any row it doesn't name.
 */
export function reportWeeksOf(raw: unknown): Parsed<ReportWeeks> {
  const parsed = HomeWeeksSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "home's weeks") }
  const home = parsed.data
  const problems: Array<string> = []
  let range: { from: string; to: string } | null = null
  try {
    range = isoWeekRange(home.week)
  } catch {
    problems.push(`week: ${home.week} is no ISO week, as 2026-W46`)
  }
  const by = new Map<string, HomeWeeks["weeks"][number]>()
  for (const week of home.weeks) {
    if (by.has(week.role)) problems.push(`weeks: ${week.role} is there twice`)
    by.set(week.role, week)
  }
  const rows = (
    role: HomeWeeks["weeks"][number]["role"]
  ): ReadonlyArray<AffordanceWeek> | null => {
    const week = by.get(role)
    if (week === undefined) {
      problems.push(`weeks: there is no ${role} week`)
      return null
    }
    if (!week.measured) return null
    return week.affordances.flatMap((row) =>
      isSurface(row.surface) ? [{ ...row, surface: row.surface }] : []
    )
  }
  const now = by.get("this")
  if (range !== null) {
    // The report labels each comparison by the writer's weeks, so home's
    // rows must be those weeks.
    const compared = comparedWeeks(home.week)
    for (const [role, week] of [
      ["last", compared.last],
      ["quarterAgo", compared.quarter],
      ["yearAgo", compared.year],
    ] as const) {
      const row = by.get(role)
      if (row !== undefined && row.week !== week)
        problems.push(`weeks: the ${role} week is ${row.week}, not ${week}`)
    }
  }
  if (now !== undefined && range !== null) {
    if (now.week !== home.week)
      problems.push(`weeks: this week is ${now.week}, not ${home.week}`)
    if (now.from !== range.from || now.to !== range.to)
      problems.push(
        `weeks: this week runs ${now.from} to ${now.to}, not the owner's ${range.from} to ${range.to}`
      )
    if (!now.complete)
      problems.push(
        `weeks: ${home.week} hasn't ended, so its report could change`
      )
  }
  const weeks: ReportWeeks = {
    week: home.week,
    now: rows("this"),
    last: rows("last"),
    quarter: rows("quarterAgo"),
    year: rows("yearAgo"),
  }
  return problems.length > 0
    ? { ok: false, problems: once(problems) }
    : { ok: true, value: weeks }
}

// ---------------------------------------------------------------------------
// The report as the stage reads it

/** A report's file, or every reason it isn't one. */
export function parseReport(raw: unknown): Parsed<EngagementReport> {
  const parsed = EngagementReportSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "report") }
}

/**
 * The registry the template's sample is named by: a few pipelines of
 * `@some-ui/engagement`'s, so the sample keeps its words when the registry
 * grows (its names are the registry's own, as of 2026-11-13).
 */
export const SAMPLE_REGISTRY: ReportRegistry = [
  {
    id: "topik",
    name: "TOPIK",
    wing: "practice",
    affordances: [
      { id: "next-lesson", surface: "apk", name: "Next lesson" },
      { id: "routine-read-aloud", surface: "apk", name: "Read aloud" },
      { id: "routine-drama", surface: "apk", name: "Drama" },
      { id: "ask-scene", surface: "apk", name: "Ask about a scene" },
    ],
  },
  {
    id: "rust-rounds",
    name: "Rust Rounds",
    wing: "practice",
    affordances: [
      { id: "week-ticket", surface: "apk", name: "This week's ticket" },
      { id: "concept", surface: "apk", name: "A concept" },
    ],
  },
  {
    id: "studio",
    name: "Studio",
    wing: "studio",
    affordances: [
      { id: "sitting", surface: "apk", name: "A sitting" },
      { id: "take", surface: "apk", name: "A take" },
    ],
  },
  {
    id: "lessons",
    name: "Lessons",
    wing: "operate",
    affordances: [{ id: "lesson", surface: "web", name: "A lesson" }],
  },
  {
    id: "aph",
    name: "aph",
    wing: "self",
    affordances: [{ id: "log-mine", surface: "apk", name: "Log mine" }],
  },
  {
    id: "jobs",
    name: "Jobs",
    wing: "jobs",
    affordances: [{ id: "todays-pick", surface: "apk", name: "Today's pick" }],
  },
]

/** The template's sample: a made-up week home might answer, named by `SAMPLE_REGISTRY`. */
export function sampleReport(): Parsed<EngagementReport> {
  const weeks = reportWeeksOf(sampleHome)
  return weeks.ok
    ? { ok: true, value: reportWeek(weeks.value, SAMPLE_REGISTRY) }
    : weeks
}

// ---------------------------------------------------------------------------
// The scenes

export type ReportLineOf = EngagementReport["wings"][number]["lines"][number]

/** One statement table: some or all of one pipeline's lines. */
export type ReportPage = {
  /** The wing it is in, by its place in the report's, from 0. */
  readonly wing: number
  readonly pipeline: string
  readonly lines: ReadonlyArray<ReportLineOf>
  /** Which of its pipeline's pages it is, from 1, of how many. */
  readonly page: number
  readonly of: number
}

/** The report's statement tables in order: each wing's pipelines, a page per `REPORT_PAGE_LINES` lines. */
export function reportPages(report: EngagementReport): Array<ReportPage> {
  const pages: Array<ReportPage> = []
  for (const [wing, { lines }] of report.wings.entries()) {
    const pipelines: Array<Array<ReportLineOf>> = []
    for (const line of lines) {
      const last = pipelines.at(-1)
      if (last?.[0]?.pipeline === line.pipeline) last.push(line)
      else pipelines.push([line])
    }
    for (const group of pipelines) {
      const of = Math.ceil(group.length / REPORT_PAGE_LINES)
      for (let p = 0; p < of; p++)
        pages.push({
          wing,
          pipeline: group[0]?.pipeline ?? "",
          lines: group.slice(
            p * REPORT_PAGE_LINES,
            (p + 1) * REPORT_PAGE_LINES
          ),
          page: p + 1,
          of,
        })
    }
  }
  return pages
}

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`

/** A line that home held no record of this week. */
const unrecorded = (line: ReportLineOf): boolean =>
  line.counts.offered.now === "no-data" && line.counts.taken.now === "no-data"

/**
 * What is said over a statement table: each line's own words (the writer's
 * `said`), except that lines with fewer than 5 of anything, and lines with
 * no record, are counted together rather than read out one by one.
 */
export function pageSaid(page: ReportPage): string {
  const quiet = page.lines.filter((line) => line.quiet).length
  const none = page.lines.filter(unrecorded).length
  const told = page.lines.filter((line) => !line.quiet && !unrecorded(line))
  const all = page.lines.length
  const name =
    page.of > 1 ? `${page.pipeline}, part ${page.page}` : page.pipeline
  if (quiet === all)
    return `${name}: every line had fewer than ${UNDER} ${QUIET_SAID}.`
  if (none === all) return `${name}: there is no record of this week.`
  // A pipeline that is one line of its own name (the folded line) says it once.
  const head =
    all === 1 && page.lines[0]?.name === page.pipeline ? null : `${name}.`
  const quietSaid =
    quiet === 0
      ? null
      : `${plural(quiet, "more line", "more lines")} had fewer than ${UNDER} ${QUIET_SAID}.`
  const noneSaid =
    none === 0
      ? null
      : `${plural(none, "line has", "lines have")} no record this week.`
  return [head, ...told.map((line) => line.said), quietSaid, noneSaid]
    .filter((part): part is string => part !== null)
    .join(" ")
}

/** How many of a wing's lines were taken 5 times or more this week. */
export const takenLines = (lines: ReadonlyArray<ReportLineOf>): number =>
  lines.filter((line) => typeof line.counts.taken.now === "number").length

/** What is said over the overview: each wing, and how many of its lines were taken. */
export function overviewSaid(report: EngagementReport): string {
  if (!report.held.now) return "Home holds no record of this week."
  return report.wings
    .map(
      (wing) =>
        `${wing.name}: ${takenLines(wing.lines)} of ${plural(wing.lines.length, "line", "lines")} taken ${UNDER} times or more.`
    )
    .join(" ")
}

/** What is said over what moved most, when nothing moved by a difference that shows. */
export const NOTHING_MOVED = `Nothing moved on last week by a difference that can be shown: no line was taken ${UNDER} times or more in both weeks with a change.`

/** One scene of a report: its section, its id in the video, and what is said over it. */
export type ReportScene =
  | {
      readonly section: Exclude<Section | Framing, "chapter" | "pipeline">
      readonly id: string
      readonly said: string
    }
  | {
      readonly section: "pipeline"
      readonly id: string
      /** Its place in `reportPages`, from 0. */
      readonly page: number
      readonly said: string
    }
  | {
      readonly section: "chapter"
      readonly id: string
      /** The scene the chapter slide opens. */
      readonly of: Section
      /** The wing it opens, by its place in the report's, from 0. */
      readonly wing?: number
      readonly title: string
      readonly said: string
    }

/** The chapter title of what moved most. */
export const MOVED_CHAPTER = "What moved most"

/**
 * Who made the video, row by row, and said (SFEED2): filled by code from the
 * report alone. A sample says it is one.
 */
export function reportIntroRows(
  report: EngagementReport,
  sample: boolean
): LockedIntro {
  const { compared } = report
  return {
    rows: [
      {
        label: "Written by",
        says: sample
          ? "Code, from made-up records: this is the template's sample"
          : "Code, from home's own records of the week: no writer and no model",
      },
      {
        label: "Drawn by",
        says: `Code: the engagement report's template, version ${REPORT_VERSION}, in paulgsc/some-ui`,
      },
      { label: "Voice", says: "Kokoro, a synthetic speaker" },
      {
        label: "What it counts",
        says: "What the app offered and what was taken, never how well",
      },
      {
        label: "What may show",
        says: `Whole-week counts only; under ${UNDER} shows as fewer than ${UNDER}; aph and Jobs as one line`,
      },
      {
        label: "Compared with",
        says: `${compared.last}, ${compared.quarter} and ${compared.year}`,
      },
    ],
    said: report.intro,
  }
}

/** The report's scenes in the order said. */
export function reportScenes(
  report: EngagementReport
): ReadonlyArray<ReportScene> {
  const shape = REPORT_SHAPE
  const scenes: Array<ReportScene> = [
    { section: "intro", id: "intro", said: report.intro },
  ]
  if (shape.brand.intro)
    scenes.push({ section: "brand-in", id: "brand-in", said: "" })
  scenes.push({
    section: "overview",
    id: "overview",
    said: overviewSaid(report),
  })
  let wing = -1
  for (const [i, page] of reportPages(report).entries()) {
    if (page.wing !== wing) {
      wing = page.wing
      const name = report.wings[wing]?.name ?? ""
      if (shape.chapters.includes("pipeline"))
        scenes.push({
          section: "chapter",
          id: repeatedId("chapter-wing", wing + 1),
          of: "pipeline",
          wing,
          title: name,
          said: `${name}.`,
        })
    }
    scenes.push({
      section: "pipeline",
      id: repeatedId("pipeline", i + 1),
      page: i,
      said: pageSaid(page),
    })
  }
  if (shape.chapters.includes("moved"))
    scenes.push({
      section: "chapter",
      id: "chapter-moved",
      of: "moved",
      title: MOVED_CHAPTER,
      said: `${MOVED_CHAPTER}.`,
    })
  scenes.push({
    section: "moved",
    id: "moved",
    said: report.moved ?? NOTHING_MOVED,
  })
  if (shape.brand.outro)
    scenes.push({ section: "brand-out", id: "brand-out", said: "" })
  return scenes
}

/** Why a report can't be drawn at all: one with more pages than the format holds. */
export function reportProblems(report: EngagementReport): Array<string> {
  const pages = reportPages(report).length
  return pages > PAGES_MOST
    ? [
        `report: ${pages} statement tables, and the template holds ${PAGES_MOST}`,
      ]
    : []
}

/**
 * The report as a cut list the renderer draws (`stillsCutList`): one still
 * per scene (`<file>.png`), its take (`<file>.wav`) where one was said.
 */
export function reportCutList(
  report: EngagementReport,
  takes: ReadonlyArray<StillTake | null>,
  { bed = false }: { readonly bed?: boolean } = {}
): CutList {
  const format = reportFormat()
  return stillsCutList(
    {
      title: `The weekly engagement report, ${report.week}`,
      series: format.series,
      look: "calm",
      captions: hasCaptions(format),
      bed,
      ...(format.shape ? { shape: format.shape } : {}),
    },
    reportScenes(report).map((scene, i) => ({
      id: scene.id,
      file: stillFile(i, scene.id),
      said: scene.said,
    })),
    takes
  )
}

/** Where the report's chapters start (SFEED4): each wing's, and what moved most. */
export const reportChapterMarks = (
  report: EngagementReport
): Array<ChapterMark> =>
  chapterSlides(
    reportScenes(report).filter((scene) => scene.section === "chapter")
  )

/** The report's storyboard (SFEED3): every frame of the template's sample. */
export function reportStoryboard(): Storyboard {
  const report = sampleReport()
  if (!report.ok) throw new Error(report.problems.join("; "))
  return storyboardOf(
    reportFormat(),
    `the sample report, ${report.value.week}`,
    reportScenes(report.value).map(boardSceneOf)
  )
}
