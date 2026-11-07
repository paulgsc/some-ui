/**
 * The week's check (RR11, paulgsc/some-ui#2686), beside the round's `lint`.
 * Unlike `lint`, it refuses: every reason comes back at once, so a tutor
 * fixes them in one pass.
 */
import { programLines } from "@rust-rounds/lib/formats"
import type { Week } from "@rust-rounds/lib/formats/week"
import { WeekSchema } from "@rust-rounds/lib/formats/week"
import { pathOf } from "@rust-rounds/lib/intake"
import { describeProgramFinding, measureProgram } from "@rust-rounds/lib/lint"
import {
  addDays,
  PACIFIC_TIME_ZONE,
  pacificDay,
  pacificMinutes,
  weekOf,
} from "@some-ui/core-utils"

/** One reason a week is refused: where, and what to do. */
export type WeekProblem = {
  /** A path into the week, like `tickets[1] ("QM-312").program`; empty for the whole week. */
  at: string
  why: string
}

export type WeekReading =
  | { ok: true; week: Week }
  | { ok: false; problems: Array<WeekProblem> }

const DAY_MS = 86_400_000

/** The ISO week id (`2026-w46`) of a `YYYY-MM-DD` calendar date. */
export function isoWeekId(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number)
  const at = new Date(Date.UTC(year, month - 1, day))
  // The Thursday of this week decides its ISO year.
  at.setUTCDate(at.getUTCDate() + 4 - (at.getUTCDay() || 7))
  const isoYear = at.getUTCFullYear()
  const week = Math.ceil(
    ((at.getTime() - Date.UTC(isoYear, 0, 1)) / DAY_MS + 1) / 7
  )
  return `${isoYear}-w${String(week).padStart(2, "0")}`
}

/** `at` on the owner's clock, as a problem names it: "2026-11-15 15:59". */
function onTheClock(at: Date): string {
  const minutes = pacificMinutes(at)
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0")
  const mm = String(minutes % 60).padStart(2, "0")
  return `${pacificDay(at)} ${hh}:${mm}`
}

function checkDates(week: Week, problems: Array<WeekProblem>): void {
  const opens = new Date(week.opens)
  const due = new Date(week.due)
  const opensDay = pacificDay(opens)
  const dueDay = pacificDay(due)
  if (weekOf(opensDay) !== opensDay || pacificMinutes(opens) !== 0) {
    problems.push({
      at: "opens",
      why: `a week opens Monday 00:00 in ${PACIFIC_TIME_ZONE}; this is ${onTheClock(opens)} there`,
    })
  }
  if (
    addDays(weekOf(dueDay), 6) !== dueDay ||
    pacificMinutes(due) !== 23 * 60 + 59
  ) {
    problems.push({
      at: "due",
      why: `a week is due Sunday 23:59 in ${PACIFIC_TIME_ZONE}; this is ${onTheClock(due)} there`,
    })
  }
  const span = due.getTime() - opens.getTime()
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
  const id = isoWeekId(opensDay)
  if (week.id !== id) {
    problems.push({
      at: "id",
      why: `the week that opens ${opensDay} is ${id}; use that as its id`,
    })
  }
}

function checkTickets(week: Week, problems: Array<WeekProblem>): void {
  const ticketIds = new Set<string>()
  const conceptNames = new Map<string, string>()
  week.tickets.forEach((ticket, index) => {
    const at = pathOf(["tickets", index], week)
    if (ticketIds.has(ticket.id)) {
      problems.push({
        at: `${at}.id`,
        why: `ticket "${ticket.id}" is used twice; each must be unique`,
      })
    }
    ticketIds.add(ticket.id)

    for (const finding of measureProgram(programLines(ticket.program))) {
      problems.push({
        at: `${at}.program`,
        why: describeProgramFinding(finding),
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

/** A week, or every reason it is refused. */
export function readWeek(input: unknown): WeekReading {
  const parsed = WeekSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        at: pathOf(issue.path, input),
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
