/**
 * The week's check (RR11, paulgsc/some-ui#2686), beside the round's `lint`.
 * Unlike `lint`, it refuses: a week that fails any rule is not a week, and
 * every reason comes back at once so a tutor fixes them in one pass.
 *
 * `WeekSchema` holds the shape and its counts (2–4 tickets, 2–3 speak-to
 * points, at least one concept). This adds what relates fields to each other
 * or to the phone:
 *
 * - every line of every program fits `LINE_WIDTH_CAP` columns, with no tab,
 *   and a program is at most `PROGRAM_LINE_CAP` lines: code on the phone
 *   never wraps;
 * - ticket ids are unique, and a concept id names one concept across the week;
 * - the week opens Monday 00:00 and is due Sunday 23:59 of the same week, in
 *   the owner's time (`OWNER_TIME_ZONE`), and its id is that ISO week.
 */
import { programLines } from "@rust-rounds/lib/formats"
import type { Week } from "@rust-rounds/lib/formats/week"
import { WeekSchema } from "@rust-rounds/lib/formats/week"
import {
  columns,
  LINE_WIDTH_CAP,
  PROGRAM_LINE_CAP,
} from "@rust-rounds/lib/lint"

/** The owner's time, as every routine in this repo reads it. */
export const OWNER_TIME_ZONE = "America/Los_Angeles"

/** One reason a week is refused: where, and what to do. */
export type WeekProblem = {
  /** A path into the week, like `tickets[1].program` or `due`; empty for the whole week. */
  at: string
  why: string
}

export type WeekReading =
  | { ok: true; week: Week }
  | { ok: false; problems: Array<WeekProblem> }

/** `["tickets", 1, "id"]` as `tickets[1].id`. */
function pathText(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((part, index) =>
      typeof part === "number"
        ? `[${part}]`
        : `${index === 0 ? "" : "."}${String(part)}`
    )
    .join("")
}

type LocalTime = {
  /** `YYYY-MM-DD`, in the zone. */
  date: string
  /** 1 Monday … 7 Sunday. */
  weekday: number
  /** `HH:MM`, 24-hour. */
  time: string
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const local = new Intl.DateTimeFormat("en-US", {
  timeZone: OWNER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** An instant as the owner's clock shows it. */
export function ownerTime(when: string): LocalTime {
  const parts = new Map(
    local.formatToParts(new Date(when)).map(({ type, value }) => [type, value])
  )
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.get(type) ?? ""
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    weekday: WEEKDAYS.indexOf(part("weekday")) + 1,
    time: `${part("hour")}:${part("minute")}`,
  }
}

/** The ISO week id (`2026-w46`) of a `YYYY-MM-DD` calendar date. */
export function isoWeekId(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number)
  const at = new Date(Date.UTC(year, month - 1, day))
  const weekday = at.getUTCDay() === 0 ? 7 : at.getUTCDay()
  // The Thursday of this week decides its ISO year.
  at.setUTCDate(at.getUTCDate() + 4 - weekday)
  const isoYear = at.getUTCFullYear()
  const firstDay = Date.UTC(isoYear, 0, 1)
  const week = Math.ceil(((at.getTime() - firstDay) / 86_400_000 + 1) / 7)
  return `${isoYear}-w${String(week).padStart(2, "0")}`
}

const DAY_MS = 86_400_000

function checkDates(week: Week, problems: Array<WeekProblem>): void {
  const opens = ownerTime(week.opens)
  const due = ownerTime(week.due)
  if (opens.weekday !== 1 || opens.time !== "00:00") {
    problems.push({
      at: "opens",
      why: `a week opens Monday 00:00 in ${OWNER_TIME_ZONE}; this is ${WEEKDAYS[opens.weekday - 1] ?? "?"} ${opens.date} ${opens.time} there`,
    })
  }
  if (due.weekday !== 7 || due.time !== "23:59") {
    problems.push({
      at: "due",
      why: `a week is due Sunday 23:59 in ${OWNER_TIME_ZONE}; this is ${WEEKDAYS[due.weekday - 1] ?? "?"} ${due.date} ${due.time} there`,
    })
  }
  const span = Date.parse(week.due) - Date.parse(week.opens)
  if (span <= 0) {
    problems.push({
      at: "due",
      why: "the deadline must come after the week opens",
    })
  } else if (span > 7 * DAY_MS) {
    problems.push({
      at: "due",
      why: "the deadline must fall in the week that opens: the Sunday after `opens`",
    })
  }
  const id = isoWeekId(opens.date)
  if (week.id !== id) {
    problems.push({
      at: "id",
      why: `the week that opens ${opens.date} is ${id}; use that as its id`,
    })
  }
}

function checkTickets(week: Week, problems: Array<WeekProblem>): void {
  const ticketIds = new Set<string>()
  const conceptNames = new Map<string, string>()
  week.tickets.forEach((ticket, index) => {
    const at = `tickets[${index}]`
    if (ticketIds.has(ticket.id)) {
      problems.push({
        at: `${at}.id`,
        why: `ticket "${ticket.id}" is used twice; each must be unique`,
      })
    }
    ticketIds.add(ticket.id)

    const lines = programLines(ticket.program)
    lines.forEach((text, line) => {
      if (text.includes("\t")) {
        problems.push({
          at: `${at}.program`,
          why: `line ${line + 1}: indent with spaces, not a tab`,
        })
      }
      const width = columns(text)
      if (width > LINE_WIDTH_CAP) {
        problems.push({
          at: `${at}.program`,
          why: `line ${line + 1} is ${width} columns; keep every line to ${LINE_WIDTH_CAP}, since code on the phone never wraps`,
        })
      }
    })
    if (lines.length > PROGRAM_LINE_CAP) {
      problems.push({
        at: `${at}.program`,
        why: `the program is ${lines.length} lines; keep it to ${PROGRAM_LINE_CAP} or fewer`,
      })
    }

    ticket.concepts.forEach((concept, conceptIndex) => {
      const named = conceptNames.get(concept.id)
      if (named !== undefined && named !== concept.name) {
        problems.push({
          at: `${at}.concepts[${conceptIndex}].name`,
          why: `concept "${concept.id}" is named "${named}" elsewhere in the week; one id, one name`,
        })
      }
      conceptNames.set(concept.id, named ?? concept.name)
    })
  })

  const references = new Set<string>()
  week.references.forEach((reference, index) => {
    if (references.has(reference)) {
      problems.push({
        at: `references[${index}]`,
        why: `"${reference}" is named twice`,
      })
    }
    references.add(reference)
  })
}

/**
 * A week, or every reason it is refused. The one door a week comes in by:
 * the phone, the routine before it puts one, and tests all read through it.
 */
export function readWeek(input: unknown): WeekReading {
  const parsed = WeekSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        at: pathText(issue.path),
        why: issue.message,
      })),
    }
  }
  const week = parsed.data
  const problems: Array<WeekProblem> = []
  checkDates(week, problems)
  checkTickets(week, problems)
  return problems.length === 0 ? { ok: true, week } : { ok: false, problems }
}

/** A problem as a line for the tutor. */
export function describeWeekProblem(problem: WeekProblem): string {
  return problem.at === "" ? problem.why : `${problem.at}: ${problem.why}`
}
