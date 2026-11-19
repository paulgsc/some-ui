/**
 * The week's check (RR11, paulgsc/some-ui#2686), beside the round's `lint`.
 * Unlike `lint`, it refuses: every reason comes back at once, so a tutor
 * fixes them in one pass.
 *
 * It reads a `/1` week and a `/2` one (RR25, RR29), and answers either in
 * the shape the phone holds (`WeekSchema`; a `/1` week by `upgradeWeek`).
 * A `/2` week is also refused when (C692, C694, C696):
 *
 * - a stated constraint's id (`S1`, `F1`) is used twice;
 * - a fork has no option, or more than one, marked recommended, or two
 *   options under one id;
 * - an option cites an id the week doesn't state: the SLA's rows, or the
 *   figures of its own ticket;
 * - a model's id is named two ways in the week;
 * - an exercise builds toward a fork the ticket doesn't have, or tests an
 *   option that isn't there or a fork it doesn't name.
 */
import { programLines } from "@rust-rounds/lib/formats"
import type { Week, WeekV2 } from "@rust-rounds/lib/formats/week"
import {
  upgradeWeek,
  WEEK_SCHEMA_V2,
  WeekV1Schema,
  WeekV2Schema,
} from "@rust-rounds/lib/formats/week"
import { pathOf } from "@rust-rounds/lib/intake"
import { describeProgramFinding, measureProgram } from "@rust-rounds/lib/lint"
import {
  addDays,
  isoWeekOf,
  isRecord,
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

/** The ISO week id (`2026-w46`) of a `YYYY-MM-DD` calendar date. */
export function isoWeekId(date: string): string {
  return isoWeekOf(date).toLowerCase()
}

/** `at` on the owner's clock, as a problem names it: "2026-11-15 15:59". */
function onTheClock(at: Date): string {
  const minutes = pacificMinutes(at)
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0")
  const mm = String(minutes % 60).padStart(2, "0")
  return `${pacificDay(at)} ${hh}:${mm}`
}

function checkDates(week: Week | WeekV2, problems: Array<WeekProblem>): void {
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
  // Calendar days, not elapsed time: the week daylight saving ends runs an
  // hour past seven days.
  const sunday = addDays(weekOf(opensDay), 6)
  if (dueDay !== sunday) {
    problems.push({
      at: "due",
      why: `the deadline must be the Sunday of the week that opens, ${sunday}`,
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

function checkTickets(week: Week | WeekV2, problems: Array<WeekProblem>): void {
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

/** The ids a week states: its SLA rows', then each ticket's figures'. */
function checkStated(week: WeekV2, problems: Array<WeekProblem>): void {
  const seen = new Set<string>()
  const once = (id: string, at: string): void => {
    if (seen.has(id)) {
      problems.push({
        at,
        why: `"${id}" names another constraint too; each id names one`,
      })
    }
    seen.add(id)
  }
  week.sla.forEach((row, i) => once(row.id, pathOf(["sla", i, "id"], week)))
  week.tickets.forEach((ticket, t) => {
    ticket.figures.forEach((figure, i) =>
      once(figure.id, pathOf(["tickets", t, "figures", i, "id"], week))
    )
  })
}

/** What one `/2` fork's options say of each other and of what is stated. */
function checkFork(
  week: WeekV2,
  fork: WeekV2["tickets"][number]["forks"][number],
  where: ReadonlyArray<PropertyKey>,
  stated: ReadonlySet<string>,
  models: Map<string, string>,
  problems: Array<WeekProblem>
): void {
  const at = pathOf(where, week)
  const recommended = fork.options.filter((option) => option.recommended)
  if (recommended.length !== 1) {
    problems.push({
      at,
      why: `exactly one option is recommended, as an agent marks it; this fork has ${recommended.length}`,
    })
  }
  const ids = new Set<string>()
  fork.options.forEach((option, o) => {
    const optionAt = pathOf([...where, "options", o], week)
    if (ids.has(option.id)) {
      problems.push({
        at: `${optionAt}.id`,
        why: `option "${option.id}" is used twice in this fork`,
      })
    }
    ids.add(option.id)
    option.cites.forEach((id, c) => {
      if (!stated.has(id)) {
        problems.push({
          at: `${optionAt}.cites[${c}]`,
          why: `"${id}" is not a constraint this week states for this ticket: cite the SLA's rows or the ticket's own figures`,
        })
      }
    })
    const named = models.get(option.model.id)
    if (named !== undefined && named !== option.model.name) {
      problems.push({
        at: `${optionAt}.model.name`,
        why: `model "${option.model.id}" is named "${named}" elsewhere in the week; one id, one name`,
      })
    }
    models.set(option.model.id, named ?? option.model.name)
  })
}

/** What one exercise names of its ticket's forks and options. */
function checkExercise(
  ticket: WeekV2["tickets"][number],
  exercise: WeekV2["tickets"][number]["academy"][number],
  at: string,
  problems: Array<WeekProblem>
): void {
  const of = ticket.forks.length
  exercise.forks.forEach((n, i) => {
    if (n > of) {
      problems.push({
        at: `${at}.forks[${i}]`,
        why: `${ticket.id} has ${of} forks; there is no fork ${n}`,
      })
    }
  })
  exercise.tests.forEach(({ fork, option }, i) => {
    const testAt = `${at}.tests[${i}]`
    const options = ticket.forks[fork - 1]?.options
    if (options === undefined) {
      problems.push({
        at: testAt,
        why: `${ticket.id} has ${of} forks; there is no fork ${fork}`,
      })
      return
    }
    if (!options.some((each) => each.id === option)) {
      problems.push({
        at: testAt,
        why: `fork ${fork} has no option "${option}"`,
      })
    }
    if (!exercise.forks.includes(fork)) {
      problems.push({
        at: testAt,
        why: `it tests fork ${fork}, so name fork ${fork} among the forks it builds toward`,
      })
    }
  })
}

/** What a `/2` week's forks and academies say of each other and the week. */
function checkForks(week: WeekV2, problems: Array<WeekProblem>): void {
  const slaIds = week.sla.map((row) => row.id)
  const models = new Map<string, string>()
  week.tickets.forEach((ticket, t) => {
    const at = pathOf(["tickets", t], week)
    const stated = new Set([
      ...slaIds,
      ...ticket.figures.map((figure) => figure.id),
    ])
    ticket.forks.forEach((fork, f) =>
      checkFork(
        week,
        fork,
        ["tickets", t, "forks", f],
        stated,
        models,
        problems
      )
    )
    ticket.academy.forEach((exercise, e) =>
      checkExercise(ticket, exercise, `${at}.academy[${e}]`, problems)
    )
  })
}

/** The schema's own refusals, each where it lies. */
function refused(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
  input: unknown
): WeekReading {
  return {
    ok: false,
    problems: issues.map((issue) => ({
      at: pathOf(issue.path, input),
      why: issue.message,
    })),
  }
}

/** Whether `input` says it is a `/2` week. */
const isV2 = (input: unknown): boolean =>
  isRecord(input) && input.schema === WEEK_SCHEMA_V2

/** A week, or every reason it is refused, in the shape the phone holds. */
export function readWeek(input: unknown): WeekReading {
  const problems: Array<WeekProblem> = []
  if (isV2(input)) {
    const parsed = WeekV2Schema.safeParse(input)
    if (!parsed.success) return refused(parsed.error.issues, input)
    const week = parsed.data
    checkDates(week, problems)
    checkTickets(week, problems)
    checkStated(week, problems)
    checkForks(week, problems)
    return problems.length === 0 ? { ok: true, week } : { ok: false, problems }
  }
  const parsed = WeekV1Schema.safeParse(input)
  if (!parsed.success) return refused(parsed.error.issues, input)
  const week = upgradeWeek(parsed.data)
  checkDates(week, problems)
  checkTickets(week, problems)
  return problems.length === 0 ? { ok: true, week } : { ok: false, problems }
}

/** The most bytes home keeps of a `/1` week file (paulgsc/server `WEEK_CEILING`). */
export const WEEK_V1_MAX_BYTES = 32 * 1024

/** The most bytes home keeps of a `/2` week file (paulgsc/server `WEEK_V2_CEILING`; C700). */
export const WEEK_V2_MAX_BYTES = 128 * 1024

/**
 * Why home would drop `file` for its size, or null: its bytes as the
 * routine writes them (two-space indent, one trailing newline), against
 * home's ceiling for its schema. Checked where the routine writes a week,
 * not in `readWeek`, which also reads weeks home already kept, whose bytes
 * as received are not their re-serialized ones.
 */
export function oversizeWeek(file: {
  readonly schema: string
}): WeekProblem | null {
  const bytes = new TextEncoder().encode(
    `${JSON.stringify(file, null, 2)}\n`
  ).length
  const most =
    file.schema === WEEK_SCHEMA_V2 ? WEEK_V2_MAX_BYTES : WEEK_V1_MAX_BYTES
  return bytes > most
    ? {
        at: "",
        why: `the week's file is ${bytes} bytes; home keeps a ${file.schema} week of at most ${most}, so cut prose or exercises`,
      }
    : null
}

/** A problem as a line for the tutor. */
export function describeWeekProblem(problem: WeekProblem): string {
  return problem.at === "" ? problem.why : `${problem.at}: ${problem.why}`
}
