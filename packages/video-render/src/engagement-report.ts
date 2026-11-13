/**
 * The weekly engagement report (ENGAGE ENG12, #2700): the app reports on
 * itself the way a company reports a quarter, from home's own records, with
 * no writer. For each pipeline and affordance it says what was offered,
 * taken, passed over and left this week, each beside last week, the same ISO
 * week a quarter ago and the same ISO week a year ago.
 *
 * It never scores the owner (#2533): it says what the app put in front of
 * them and what was used, nothing about what was learned.
 *
 * **Deterministic end to end.** `reportWeek` is pure: the same counts give
 * the same report, the same words and so the same video. Every sentence is a
 * template filled from numbers (`lineSaid`, `reportIntro`); the only
 * judgement is the template, which is code.
 *
 * **The public-safety rule** (ask #2701, the owner's answer of 2026-11-07)
 * is `publicCell` and `publicLines`, and `REPORT_FIELDS` lists every field
 * that may reach the file:
 *
 * - whole-week counts per pipeline and affordance: offered, taken, passed
 *   over and left; never `said` (a stop answer), never a time of day;
 * - a count under 5 shows as "fewer than 5" (`UNDER`);
 * - a change shows as up, down or flat, with the difference (`publicChange`,
 *   call C143);
 * - a line nothing reached 5 on says so in bands, never "nothing" (`quiet`);
 * - aph and Jobs (the self and jobs wings) show only as one "Self and work"
 *   line (`FOLDED`).
 *
 * Each count is banded on its own (call C144): where offered and taken are
 * both shown, their difference estimates a banded passed over.
 *
 * A week runs from Monday midnight on the owner's clock (Pacific) to the
 * next, as their days do everywhere else (`PACIFIC_TIME_ZONE`).
 *
 * "No data" is data, never zero (canon Prop. 3.2, "Absence is an
 * observation"): a compared week home held nothing for reads `no-data`.
 */

import {
  addDays,
  isoWeekMonday,
  isoWeekOf,
  isoWeeksIn,
  pacificDay,
  pacificMinutes,
  parseIsoWeek,
} from "@some-ui/core-utils"
import { z } from "zod"

export const ENGAGEMENT_REPORT_SCHEMA = "some-ui.engagement-report/1"

/** The template's id, as `templates/engagement-report/` names it. */
export const ENGAGEMENT_REPORT_ID = "engagement-report"

/** Below this, a count shows as "fewer than 5". */
export const UNDER = 5

// ---------------------------------------------------------------------------
// Weeks

/** An ISO week, as `2026-W46`. */
export type IsoWeek = string

/** Midnight on the owner's clock at the start of `day`, as an instant. */
function pacificMidnight(day: string): string {
  // Midnight Pacific is 08:00 UTC in standard time and 07:00 in daylight
  // time; no change of the clocks falls at midnight.
  for (const hour of ["07", "08"]) {
    const at = new Date(`${day}T${hour}:00:00.000Z`)
    if (pacificDay(at) === day && pacificMinutes(at) === 0)
      return at.toISOString()
  }
  throw new RangeError(`${day} has no midnight on the owner's clock`)
}

/** Where an ISO week starts and ends on the owner's clock, `to` excluded. */
export function isoWeekRange(week: IsoWeek): { from: string; to: string } {
  const monday = isoWeekMonday(week)
  return {
    from: pacificMidnight(monday),
    to: pacificMidnight(addDays(monday, 7)),
  }
}

/**
 * The weeks a report compares `week` with: the week before, the week 13
 * weeks before (a quarter), and the same week number a year before (week 52
 * when that year has no week 53).
 */
export function comparedWeeks(week: IsoWeek): {
  last: IsoWeek
  quarter: IsoWeek
  year: IsoWeek
} {
  const monday = isoWeekMonday(week)
  const { year, week: n } = parseIsoWeek(week)
  const week52 = Math.min(n, isoWeeksIn(year - 1))
  return {
    last: isoWeekOf(addDays(monday, -7)),
    quarter: isoWeekOf(addDays(monday, -13 * 7)),
    year: `${String(year - 1)}-W${String(week52).padStart(2, "0")}`,
  }
}

// ---------------------------------------------------------------------------
// What the report reads

/**
 * One affordance on one surface over one week, as home's period read
 * answers it (paulgsc/server `AffordanceUse`, without `said` and
 * `lastTaken`, which the rule keeps out).
 */
export type AffordanceWeek = {
  readonly pipeline: string
  readonly affordance: string
  readonly surface: "apk" | "web"
  readonly offered: number
  readonly taken: number
  readonly passedOver: number
  readonly left: number
}

/**
 * The four weeks a report reads. A week home held nothing for (before it
 * ran the engagement family, say) is `null`, which reads "no data", never
 * zero.
 */
export type ReportWeeks = {
  readonly week: IsoWeek
  readonly now: ReadonlyArray<AffordanceWeek> | null
  readonly last: ReadonlyArray<AffordanceWeek> | null
  readonly quarter: ReadonlyArray<AffordanceWeek> | null
  readonly year: ReadonlyArray<AffordanceWeek> | null
}

/**
 * The part of the registry (`@some-ui/engagement`'s `PIPELINES`) a report
 * names lines by. Home keeps only ids; the names come from here.
 */
export type ReportRegistry = ReadonlyArray<{
  readonly id: string
  readonly name: string
  readonly wing: string
  readonly affordances: ReadonlyArray<{
    readonly id: string
    readonly surface: "apk" | "web"
    readonly name: string
  }>
}>

// ---------------------------------------------------------------------------
// The rule

export const COUNT_KINDS = ["offered", "taken", "passedOver", "left"] as const
export type CountKind = (typeof COUNT_KINDS)[number]

/** A count as it may go public: a number of 5 or more, banded below, or none held. */
export type PublicCount = number | "fewer-than-5" | "no-data"

/** A change as it may go public. `by` is null where a side is banded or missing. */
export type PublicChange = {
  readonly way: "up" | "down" | "flat" | "unknown"
  readonly by: number | null
}

export type PublicCell = {
  readonly now: PublicCount
  readonly last: PublicChange
  readonly quarter: PublicChange
  readonly year: PublicChange
}

/** One count, banded. `null` is a week home held nothing for. */
export function publicCount(n: number | null): PublicCount {
  if (n === null) return "no-data"
  return n < UNDER ? "fewer-than-5" : n
}

/**
 * This week's count against an earlier one. Up, down or flat with the
 * difference where both are 5 or more; only the way where one is banded and
 * the way is still certain (5 or more against fewer than 5); unknown where
 * both are banded or either is missing.
 */
export function publicChange(
  now: number | null,
  then: number | null
): PublicChange {
  if (now === null || then === null) return { way: "unknown", by: null }
  const nowBanded = now < UNDER
  const thenBanded = then < UNDER
  if (nowBanded && thenBanded) return { way: "unknown", by: null }
  if (nowBanded) return { way: "down", by: null }
  if (thenBanded) return { way: "up", by: null }
  const by = now - then
  return { way: by > 0 ? "up" : by < 0 ? "down" : "flat", by: Math.abs(by) }
}

/** One kind's count across the four weeks, as it may go public. */
export function publicCell(
  now: number | null,
  last: number | null,
  quarter: number | null,
  year: number | null
): PublicCell {
  return {
    now: publicCount(now),
    last: publicChange(now, last),
    quarter: publicChange(now, quarter),
    year: publicChange(now, year),
  }
}

/** The wings whose pipelines show only as one line together, and that line's words. */
export const FOLDED = {
  wings: ["self", "jobs"],
  id: "self-and-work",
  name: "Self and work",
} as const

/** The wings in the order a report goes through them, and their names. */
export const REPORT_WINGS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "practice", name: "Practice" },
  { id: "studio", name: "Studio" },
  { id: "operate", name: "Operate" },
  { id: FOLDED.id, name: FOLDED.name },
]

const SURFACE_WORDS = { apk: "on the phone", web: "on the web" } as const

/** One line of the report: an affordance on a surface, or the folded line. */
export type ReportLine = {
  readonly id: string
  readonly wing: string
  readonly pipeline: string
  readonly name: string
  readonly counts: Readonly<Record<CountKind, PublicCell>>
  /**
   * This week is on record, and no count reached 5 in it or in any
   * compared week on record.
   */
  readonly quiet: boolean
}

type Tally = Record<CountKind, number>

const zero = (): Tally => ({ offered: 0, taken: 0, passedOver: 0, left: 0 })

function tallyOf(
  week: ReadonlyArray<AffordanceWeek> | null,
  keep: (row: AffordanceWeek) => boolean
): Tally | null {
  if (week === null) return null
  const tally = zero()
  for (const row of week)
    if (keep(row)) for (const kind of COUNT_KINDS) tally[kind] += row[kind]
  return tally
}

function lineOf(
  weeks: ReportWeeks,
  head: Omit<ReportLine, "counts" | "quiet">,
  keep: (row: AffordanceWeek) => boolean
): ReportLine {
  const now = tallyOf(weeks.now, keep)
  const last = tallyOf(weeks.last, keep)
  const quarter = tallyOf(weeks.quarter, keep)
  const year = tallyOf(weeks.year, keep)
  const cell = (kind: CountKind): PublicCell =>
    publicCell(
      now?.[kind] ?? null,
      last?.[kind] ?? null,
      quarter?.[kind] ?? null,
      year?.[kind] ?? null
    )
  const counts = {
    offered: cell("offered"),
    taken: cell("taken"),
    passedOver: cell("passedOver"),
    left: cell("left"),
  }
  const quiet =
    now !== null &&
    [now, last, quarter, year].every(
      (t) => t === null || COUNT_KINDS.every((kind) => t[kind] < UNDER)
    )
  return { ...head, counts, quiet }
}

/**
 * Every line a report may show, in registry order, after the rule: one per
 * affordance and surface the registry names (rows it does not name are
 * dropped), except the self and jobs wings', which fold into one line.
 */
export function publicLines(
  weeks: ReportWeeks,
  registry: ReportRegistry
): ReadonlyArray<ReportLine> {
  const folded = new Set<string>(FOLDED.wings)
  const lines: Array<ReportLine> = []
  for (const pipeline of registry) {
    if (folded.has(pipeline.wing)) continue
    const twoSurfaces = new Set(
      pipeline.affordances
        .filter((a) =>
          pipeline.affordances.some(
            (b) => b.id === a.id && b.surface !== a.surface
          )
        )
        .map((a) => a.id)
    )
    for (const a of pipeline.affordances)
      lines.push(
        lineOf(
          weeks,
          {
            id: `${pipeline.id}/${a.id}/${a.surface}`,
            wing: pipeline.wing,
            pipeline: pipeline.name,
            name: twoSurfaces.has(a.id)
              ? `${a.name} ${SURFACE_WORDS[a.surface]}`
              : a.name,
          },
          (row) =>
            row.pipeline === pipeline.id &&
            row.affordance === a.id &&
            row.surface === a.surface
        )
      )
  }
  const named = new Set(
    registry
      .filter((p) => folded.has(p.wing))
      .flatMap((p) => p.affordances.map((a) => `${p.id}/${a.id}/${a.surface}`))
  )
  if (named.size > 0)
    lines.push(
      lineOf(
        weeks,
        {
          id: FOLDED.id,
          wing: FOLDED.id,
          pipeline: FOLDED.name,
          name: FOLDED.name,
        },
        (row) => named.has(`${row.pipeline}/${row.affordance}/${row.surface}`)
      )
    )
  return lines
}

// ---------------------------------------------------------------------------
// The words

function sayCount(n: PublicCount, kind: string): string {
  if (n === "no-data") return `no record of what was ${kind}`
  if (n === "fewer-than-5") return `${kind} fewer than 5 times`
  return `${kind} ${n} times`
}

const KIND_WORDS: Record<CountKind, string> = {
  offered: "offered",
  taken: "taken",
  passedOver: "passed over",
  left: "left",
}

const AGAINST = {
  last: "last week",
  quarter: "a quarter ago",
  year: "a year ago",
} as const

/** "up 3 on last week", "down on a quarter ago", "flat on a year ago". */
export function sayChange(
  change: PublicChange,
  against: keyof typeof AGAINST
): string | null {
  if (change.way === "unknown") return null
  if (change.way === "flat") return `the same as ${AGAINST[against]}`
  const by = change.by === null ? "" : ` ${change.by}`
  return `${change.way}${by} on ${AGAINST[against]}`
}

/**
 * The sentence said over a line: what was offered and taken this week, each
 * against last week. "Read aloud: offered 12 times, taken 9 times, up 3 on
 * last week." A quiet line says so in bands.
 */
export function lineSaid(line: ReportLine): string {
  if (line.quiet)
    return `${line.name}: fewer than 5 of anything this week, or in any compared week on record.`
  const parts = (["offered", "taken"] as const).map((kind) => {
    const cell = line.counts[kind]
    const said = sayCount(cell.now, KIND_WORDS[kind])
    const change = sayChange(cell.last, "last")
    return change === null ? said : `${said}, ${change}`
  })
  return `${line.name}: ${parts.join("; ")}.`
}

/** The line whose taken count moved most on last week, among those with a difference. */
export function movedMost(lines: ReadonlyArray<ReportLine>): ReportLine | null {
  let best: ReportLine | null = null
  let bestBy = 0
  for (const line of lines) {
    const by = line.counts.taken.last.by ?? 0
    if (by > bestBy) {
      best = line
      bestBy = by
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// The report

const CountSchema = z.union([
  z.number().int().min(UNDER),
  z.literal("fewer-than-5"),
  z.literal("no-data"),
])
const ChangeSchema = z
  .object({
    way: z.enum(["up", "down", "flat", "unknown"]),
    by: z.number().int().min(0).nullable(),
  })
  .strict()
const CellSchema = z
  .object({
    now: CountSchema,
    last: ChangeSchema,
    quarter: ChangeSchema,
    year: ChangeSchema,
  })
  .strict()
const LineSchema = z
  .object({
    id: z.string(),
    wing: z.string(),
    pipeline: z.string(),
    name: z.string(),
    counts: z
      .object({
        offered: CellSchema,
        taken: CellSchema,
        passedOver: CellSchema,
        left: CellSchema,
      })
      .strict(),
    quiet: z.boolean(),
    said: z.string(),
  })
  .strict()
const WeekSchema = z.string().refine((week) => {
  try {
    parseIsoWeek(week)
    return true
  } catch {
    return false
  }
}, "an ISO week, as 2026-W46")

export const EngagementReportSchema = z
  .object({
    schema: z.literal(ENGAGEMENT_REPORT_SCHEMA),
    week: WeekSchema,
    from: z.string(),
    to: z.string(),
    compared: z
      .object({ last: WeekSchema, quarter: WeekSchema, year: WeekSchema })
      .strict(),
    held: z
      .object({
        now: z.boolean(),
        last: z.boolean(),
        quarter: z.boolean(),
        year: z.boolean(),
      })
      .strict(),
    wings: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          lines: z.array(LineSchema),
        })
        .strict()
    ),
    moved: z.string().nullable(),
    intro: z.string(),
  })
  .strict()

export type EngagementReport = z.infer<typeof EngagementReportSchema>

/**
 * Every field that may reach the report's file, by path. The rule's test
 * holds the schema to this list, so a field added to the file is a field
 * added here, where a reviewer reads it against ask #2701.
 */
export const REPORT_FIELDS: ReadonlyArray<string> = [
  "schema",
  "week",
  "from",
  "to",
  "compared.last",
  "compared.quarter",
  "compared.year",
  "held.now",
  "held.last",
  "held.quarter",
  "held.year",
  "wings[].id",
  "wings[].name",
  "wings[].lines[].id",
  "wings[].lines[].wing",
  "wings[].lines[].pipeline",
  "wings[].lines[].name",
  "wings[].lines[].counts.offered|taken|passedOver|left.now",
  "wings[].lines[].counts.offered|taken|passedOver|left.last|quarter|year.way",
  "wings[].lines[].counts.offered|taken|passedOver|left.last|quarter|year.by",
  "wings[].lines[].quiet",
  "wings[].lines[].said",
  "moved",
  "intro",
]

/** The words that open the report: the week, and that no one wrote it. */
export function reportIntro(
  week: IsoWeek,
  held: EngagementReport["held"]
): string {
  const missing = (["last", "quarter", "year"] as const)
    .filter((key) => !held[key])
    .map((key) => AGAINST[key])
  const gaps =
    missing.length === 0
      ? ""
      : ` There is no record from ${missing.join(" or ")} to compare with yet.`
  return (
    `The engagement report for ${week}, written by code from the app's own records, with no writer. ` +
    `It says what the app offered and what was taken, never how well.${gaps}`
  )
}

/** The week's report, after the rule, with its words. Pure. */
export function reportWeek(
  weeks: ReportWeeks,
  registry: ReportRegistry
): EngagementReport {
  const lines = publicLines(weeks, registry)
  const held = {
    now: weeks.now !== null,
    last: weeks.last !== null,
    quarter: weeks.quarter !== null,
    year: weeks.year !== null,
  }
  const moved = movedMost(lines)
  const report: EngagementReport = {
    schema: ENGAGEMENT_REPORT_SCHEMA,
    week: weeks.week,
    ...isoWeekRange(weeks.week),
    compared: comparedWeeks(weeks.week),
    held,
    wings: REPORT_WINGS.map((wing) => ({
      ...wing,
      lines: lines
        .filter((line) => line.wing === wing.id)
        .map((line) => ({ ...line, said: lineSaid(line) })),
    })).filter((wing) => wing.lines.length > 0),
    moved:
      moved === null
        ? null
        : `What moved most: ${moved.name}, taken ${sayChange(moved.counts.taken.last, "last") ?? ""}.`,
    intro: reportIntro(weeks.week, held),
  }
  return EngagementReportSchema.parse(report)
}
