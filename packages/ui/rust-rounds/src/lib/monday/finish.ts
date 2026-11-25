/**
 * The Monday routine's finish step (RR18, paulgsc/some-ui#2693): the bundle
 * and the model's values become the files the routine puts, each checked by
 * the app's own parser before it can leave: an essay (`some-ui.rust-essay/1`,
 * `parseEssay`) for each week the bundle owes one, and next week
 * (`some-ui.rust-week/2`, `readWeek`; C730), every program and every
 * academy starter run with a real rustc and matching its `expect`.
 *
 * What code writes, never the model:
 *
 * - every restated field (the week, its company, story, SLA, tickets,
 *   forks, options, programs, the owner's transcripts and the silences'
 *   counts), and next week's id, dates, references, rubric and family;
 * - **the chart and the role line**, both the decay record's (RR19, #2695,
 *   `@rust-rounds/lib/decay`), read over every week the mailbox holds an
 *   essay for and this one; the essay pins its template's voices version,
 *   which draws everything the versions before it do (C841);
 * - a seed ticket's source, as a sentence at the end of its spec (#2685);
 * - **the opening**, the standing set copied as it stands
 *   (`@rust-rounds/lib/opening`, C737): a week whose opening isn't the set
 *   is refused.
 *
 * What it holds beyond the parsers: each deep dive said in 2 to 5 minutes
 * (C103), every question, best, beside and deep dive scene within the
 * essay's frame (EF1, `essayFit`), and next week's question scenes
 * (`questionFit`) while the routine can still shorten their words, every topic and seed covered by a ticket, and each
 * topic's concept named as the area table names it.
 */
import type { Judged } from "@rust-rounds/lib/decay"
import { chartOf, recordOf, roleAt } from "@rust-rounds/lib/decay"
import type { Expect, RustcRun } from "@rust-rounds/lib/formats"
import { expectMatches } from "@rust-rounds/lib/formats"
import {
  ReferenceSchema,
  WEEK_SCHEMA,
  WeekV2Schema,
} from "@rust-rounds/lib/formats/week"
import type { Reference, Week, WeekV2 } from "@rust-rounds/lib/formats/week"
import type {
  Bundle,
  EndedTicket,
  EndedWeek,
  History,
} from "@rust-rounds/lib/monday/bundle"
import { judgedOf, judgedWeek } from "@rust-rounds/lib/monday/bundle"
import { AREAS } from "@rust-rounds/lib/monday/topics"
import type {
  EssayTicketValues,
  EssayValues,
  ForkValues,
  PointValues,
  Values,
} from "@rust-rounds/lib/monday/values"
import { ValuesSchema } from "@rust-rounds/lib/monday/values"
import { openingOfWeek, STANDING_OPENING } from "@rust-rounds/lib/opening"
import {
  describeWeekProblem,
  oversizeWeek,
  readWeek,
} from "@rust-rounds/lib/week-check"
import { assertNever, pacificDay } from "@some-ui/core-utils"
import type { Essay, EssayFork, EssayPointAnswer } from "@some-ui/video-render"
import {
  ESSAY_CHART_ROWS,
  ESSAY_ID,
  ESSAY_SCHEMA,
  ESSAY_VOICES_VERSION,
  ESSAY_WEEKS_MOST,
  essayFit,
  parseEssay,
  pointsFit,
  questionFit,
} from "@some-ui/video-render"

/**
 * A deep dive is said in 2 to 5 minutes (owner, 2026-11-07), held as words at
 * 150 a minute (C103): an estimate until a rendered essay measures Kokoro's
 * own pace.
 */
const WORDS_A_MINUTE = 150
export const DIVE_WORDS_LEAST = 2 * WORDS_A_MINUTE
export const DIVE_WORDS_MOST = 5 * WORDS_A_MINUTE

/** Who writes the weeks the routine puts. */
const ROUTINE_BY = "claude-routine"

/**
 * Every program of a week's tickets that rustc runs, by the key `finish`
 * reads its run by: a ticket's program by its id, and exercise n (from 1)
 * of its academy's starter by `TB-101/academy/n`, as home records them.
 */
export function programsOf(
  tickets: ReadonlyArray<{
    readonly id: string
    readonly program: string
    readonly expect: Expect
    readonly academy: ReadonlyArray<{
      readonly title: string
      readonly starter: string
      readonly expect: Expect
    }>
  }>
): Array<{ key: string; what: string; program: string; expect: Expect }> {
  return tickets.flatMap((ticket) => [
    {
      key: ticket.id,
      what: `${ticket.id}'s program`,
      program: ticket.program,
      expect: ticket.expect,
    },
    ...ticket.academy.map((exercise, i) => ({
      key: `${ticket.id}/academy/${i + 1}`,
      what: `${ticket.id}'s exercise ${i + 1} ("${exercise.title}")`,
      program: exercise.starter,
      expect: exercise.expect,
    })),
  ])
}

/** A file to put in the mailbox's `brief` folder. */
type BriefFile = { readonly name: string; readonly body: unknown }

export type Finished =
  | { readonly ok: true; readonly files: ReadonlyArray<BriefFile> }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

const wordCount = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length

/** The sentence a seed ticket's spec ends with: where it came from. */
export function seedLine(at: string): string {
  return `It comes from an error you pasted on ${pacificDay(new Date(at))}.`
}

/**
 * Each point of `ticket` answered by a take of its own (RR24), by its place
 * from 1, from what home heard (the bundle) and the model's reading of it:
 * a take takes a mark and a SOLO level, a take with nothing said a guess, and
 * one home couldn't make out nothing.
 */
function pointAnswers(
  ticket: EndedTicket,
  values: ReadonlyArray<PointValues>,
  problems: Array<string>
): Map<number, EssayPointAnswer> {
  const answers = new Map<number, EssayPointAnswer>()
  for (const read of values)
    if (!ticket.points.some((p) => p.point === read.point))
      problems.push(
        `${ticket.id}: point ${read.point} wasn't answered by a take of its own, so leave it out of points`
      )
  for (const { point, answer } of ticket.points) {
    const at = `${ticket.id} point ${point}`
    const read = values.filter((v) => v.point === point)
    const [only] = read
    if (read.length > 1) {
      problems.push(`${at}: read ${read.length} times; read it once`)
      continue
    }
    switch (answer.kind) {
      case "take": {
        if (only === undefined || "guess" in only)
          problems.push(
            `${at}: answered by its own take, so it takes a mark and a SOLO level, not ${only === undefined ? "nothing" : "a guess"}`
          )
        else
          answers.set(point, {
            kind: "take",
            transcript: answer.transcript,
            mark: {
              mark: only.mark,
              ...(only.note === undefined ? {} : { note: only.note }),
            },
            solo: only.solo,
          })
        break
      }
      case "silence": {
        if (only !== undefined && "guess" in only)
          answers.set(point, {
            kind: "silence",
            opened: answer.opened,
            guess: only.guess,
          })
        else
          problems.push(
            `${at}: its own take said nothing, so it takes a guess at why, not ${only === undefined ? "nothing" : "a mark"}`
          )
        break
      }
      case "unheard": {
        if (only === undefined)
          answers.set(point, {
            kind: "silence",
            opened: answer.opened,
            unheard: true,
          })
        else
          problems.push(
            `${at}: home couldn't make out its own take, so leave it out of points`
          )
        break
      }
      default: {
        assertNever(answer)
      }
    }
  }
  return answers
}

/**
 * Each fork of `ticket` that lists options (`/2`, RR29), by its place from
 * 1, built from the week's options and the after-deadline best fit the
 * model wrote of it (`values`): one best fit per such fork, each listed
 * option set against the stated constraints once. Whether an id is stated
 * and a hidden best's advantage is stated, `parseEssay` holds
 * (`forkProblems`).
 */
function forksOf(
  ticket: EndedTicket,
  values: ReadonlyArray<ForkValues>,
  problems: Array<string>
): Map<number, EssayFork> {
  const forks = new Map<number, EssayFork>()
  for (const read of values)
    if ((ticket.forks[read.fork - 1]?.options.length ?? 0) === 0)
      problems.push(
        `${ticket.id}: fork ${read.fork} lists no options, so leave it out of forks`
      )
  for (const [i, { options }] of ticket.forks.entries()) {
    if (options.length === 0) continue
    const at = `${ticket.id} fork ${i + 1}`
    const read = values.filter((v) => v.fork === i + 1)
    const [only] = read
    if (only === undefined || read.length > 1) {
      problems.push(
        only === undefined
          ? `${at}: it lists options, so it takes a best fit: the best decision and each option's trade`
          : `${at}: its best fit is written ${read.length} times; write it once`
      )
      continue
    }
    const traded = only.options.map((option) => option.id)
    for (const id of traded)
      if (!options.some((option) => option.id === id))
        problems.push(`${at}: ${id} isn't one of its options`)
    const built = options.flatMap((option) => {
      const trade = only.options.filter((each) => each.id === option.id)
      const [one] = trade
      if (one === undefined || trade.length > 1) {
        problems.push(
          `${at}: ${option.id} is set against the stated constraints ${trade.length} times; once`
        )
        return []
      }
      return [
        {
          id: option.id,
          recommended: option.recommended,
          decision: option.decision,
          model: option.model,
          meets: one.meets,
          breaks: one.breaks,
          ...(one.because === undefined ? {} : { because: one.because }),
          ...(one.refused === undefined ? {} : { refused: one.refused }),
        },
      ]
    })
    if (built.length !== options.length) continue
    forks.set(i + 1, {
      options: built,
      best:
        "option" in only.best
          ? { kind: "option", option: only.best.option }
          : { kind: "hidden", ...only.best.hidden },
      said: only.said,
    })
  }
  return forks
}

function essayTicket(
  ticket: EndedTicket,
  sla: EndedWeek["sla"],
  values: EssayTicketValues,
  problems: Array<string>
): Essay["tickets"][number] | null {
  const at = `${ticket.id}`
  if (values.bests.length !== ticket.forks.length) {
    problems.push(
      `${at}: ${values.bests.length} best fits for ${ticket.forks.length} speak-to points`
    )
  }
  const reading = values.answer
  let answer: Essay["tickets"][number]["answer"] | null = null
  switch (ticket.answer.kind) {
    case "take": {
      if (reading === undefined || "guess" in reading) {
        problems.push(
          `${at}: answered, so it takes marks and a SOLO level, not ${reading === undefined ? "nothing" : "a guess"}`
        )
      } else {
        answer = {
          kind: "take",
          transcript: ticket.answer.transcript,
          ...reading,
        }
      }
      break
    }
    case "silence": {
      if (reading !== undefined && "guess" in reading) {
        answer = {
          kind: "silence",
          opened: ticket.answer.opened,
          guess: reading.guess,
        }
      } else {
        problems.push(
          `${at}: left unanswered, so it takes a guess at why, not ${reading === undefined ? "nothing" : "marks"}`
        )
      }
      break
    }
    case "unheard": {
      if (reading === undefined) {
        answer = {
          kind: "silence",
          opened: ticket.answer.opened,
          unheard: true,
        }
      } else {
        problems.push(
          `${at}: home couldn't make out the take, so leave answer out`
        )
      }
      break
    }
    case "by-points": {
      const every = ticket.points.length === ticket.forks.length
      if (every && reading === undefined) {
        answer = { kind: "silence", opened: ticket.answer.opened }
      } else if (!every && reading !== undefined && "guess" in reading) {
        answer = {
          kind: "silence",
          opened: ticket.answer.opened,
          guess: reading.guess,
        }
      } else {
        problems.push(
          every
            ? `${at}: every point was answered by a take of its own, so leave answer out`
            : `${at}: some points were left unanswered, so it takes a guess at why, not ${reading === undefined ? "nothing" : "marks"}`
        )
      }
      break
    }
    default: {
      assertNever(ticket.answer)
    }
  }
  values.dives.forEach((dive, k) => {
    const n = wordCount(dive.said)
    if (n < DIVE_WORDS_LEAST || n > DIVE_WORDS_MOST) {
      problems.push(
        `${at}: deep dive ${k + 1} is ${n} words; a deep dive is ${DIVE_WORDS_LEAST} to ${DIVE_WORDS_MOST} (2 to 5 minutes)`
      )
    }
  })
  const own = pointAnswers(ticket, values.points ?? [], problems)
  const forks = forksOf(ticket, values.forks ?? [], problems)
  if (answer === null) return null
  return {
    id: ticket.id,
    title: ticket.title,
    spec: ticket.spec,
    figures: ticket.figures.map((figure) => figure.text),
    program: ticket.program,
    points: ticket.forks.map(({ question: to }, i) => {
      const answered = own.get(i + 1)
      const fork = forks.get(i + 1)
      return {
        to,
        best: values.bests[i] ?? "",
        ...(answered === undefined ? {} : { answer: answered }),
        ...(fork === undefined ? {} : { fork }),
      }
    }),
    ...(forks.size === 0
      ? {}
      : {
          stated: [
            ...sla.map((row) => ({
              id: row.id,
              says: `${row.what}: ${row.target}`,
            })),
            ...ticket.figures.map((figure) => ({
              id: figure.id,
              says: figure.text,
            })),
          ],
        }),
    answer,
    question: { said: values.question },
    best: { said: values.best },
    beside: { said: values.beside },
    dives: values.dives,
  }
}

function buildEssay(
  ended: EndedWeek,
  values: EssayValues,
  history: History,
  following: Week | undefined,
  problems: Array<string>
): Essay | null {
  const before = problems.length
  const byId = new Map(values.tickets.map((t) => [t.id, t]))
  for (const id of byId.keys())
    if (!ended.tickets.some((t) => t.id === id))
      problems.push(`${ended.week}: ${id} isn't one of the week's tickets`)
  const tickets = ended.tickets.flatMap((ticket) => {
    const held = byId.get(ticket.id)
    if (held === undefined) {
      problems.push(`${ended.week}: ${ticket.id} has no values`)
      return []
    }
    const built = essayTicket(ticket, ended.sla, held, problems)
    return built === null ? [] : [built]
  })
  if (following === undefined) {
    problems.push(
      `${ended.week}: the mailbox holds no week after it to say is next`
    )
  }
  if (problems.length > before || following === undefined) return null
  const judged: Array<Judged> = [
    ...judgedOf(history).filter((j) => j.week < ended.week),
    judgedWeek(ended.week, ended.tickets, tickets),
  ]
  const record = recordOf(judged)
  const chart = chartOf(
    record,
    judged.map((j) => j.week),
    ended.tickets.flatMap((t) => t.concepts),
    { weeks: ESSAY_WEEKS_MOST, concepts: ESSAY_CHART_ROWS }
  )
  // Every essay takes the voices' version, which draws everything the
  // versions before it do (C841).
  const version = ESSAY_VOICES_VERSION
  const topics = [
    ...new Set(following.tickets.flatMap((t) => t.concepts.map((c) => c.name))),
  ]
  const essay = {
    schema: ESSAY_SCHEMA,
    template: { id: ESSAY_ID, version },
    week: { id: ended.week, from: ended.from, to: ended.to },
    company: ended.company,
    story: ended.story,
    sla: ended.sla.map(({ what, target }) => ({ what, target })),
    references: ended.references,
    ...(ended.opening === undefined ? {} : { opening: ended.opening }),
    open: { said: values.open },
    tickets,
    weeks: {
      said: values.weeks,
      ...chart,
      role: roleAt(record, chart.weeks),
    },
    next: { said: values.next, week: following.id, topics },
  }
  const parsed = parseEssay(essay)
  const unfit = parsed.ok ? essayFit(parsed.value).problems : []
  if (!parsed.ok || unfit.length > 0) {
    problems.push(
      ...(parsed.ok ? unfit : parsed.problems).map(
        (p) => `${ended.week} essay: ${p}`
      )
    )
    return null
  }
  return parsed.value
}

function buildWeek(
  bundle: Bundle,
  values: Values,
  runs: Readonly<Record<string, RustcRun>>,
  problems: Array<string>
): { file: WeekV2; held: Week } | null {
  const next = bundle.next
  if (next === null) {
    if (values.week !== null)
      problems.push("week: the mailbox already holds next week; leave it null")
    return null
  }
  if (values.week === null) {
    problems.push(`week: ${next.id} is owed and its values are null`)
    return null
  }
  const before = problems.length
  const given = values.week
  if (next.earlierCompanies.includes(given.company.name))
    problems.push(
      `week: ${given.company.name} was an earlier week's company; invent a new one`
    )
  const seeded = new Map<string, number>()
  for (const ticket of given.tickets) {
    if (ticket.seed === undefined) continue
    if (!next.seeds.some((s) => s.at === ticket.seed))
      problems.push(
        `week: ${ticket.id}'s seed ${ticket.seed} isn't a pasted error the bundle names`
      )
    seeded.set(ticket.seed, (seeded.get(ticket.seed) ?? 0) + 1)
  }
  for (const seed of next.seeds)
    if (seeded.get(seed.at) !== 1)
      problems.push(
        `week: the error pasted at ${seed.at} seeds ${seeded.get(seed.at) ?? 0} tickets; it seeds one`
      )
  for (const topic of next.topics) {
    const named = given.tickets
      .flatMap((t) => t.concepts)
      .filter((c) => c.id === topic.id)
    if (named.length === 0)
      problems.push(
        `week: no ticket names the topic ${topic.id} in its concepts`
      )
    else if (named.some((c) => c.name !== topic.name))
      problems.push(
        `week: name the topic ${topic.id} "${topic.name}", as the bundle does`
      )
  }
  // The references the week is judged against: each topic's, and each
  // area's a ticket names, in the table's order.
  const named = new Set<Reference>()
  for (const topic of next.topics)
    if (topic.reference !== null) named.add(topic.reference)
  for (const ticket of given.tickets)
    for (const concept of ticket.concepts) {
      const area = AREAS.find((a) => a.id === concept.id)
      if (area !== undefined) named.add(area.reference)
    }
  const references = ReferenceSchema.options.filter((r) => named.has(r))
  const week = {
    schema: WEEK_SCHEMA,
    id: next.id,
    by: ROUTINE_BY,
    family: "performance-task",
    opens: next.opens,
    due: next.due,
    company: given.company,
    role: given.role,
    audience: given.audience,
    story: given.story,
    opening: openingOfWeek(),
    sla: given.sla,
    tickets: given.tickets.map(({ seed, ...ticket }) =>
      seed === undefined
        ? ticket
        : { ...ticket, spec: `${ticket.spec} ${seedLine(seed)}` }
    ),
    references: references.length > 0 ? references : ["rust-reference"],
    rubric: "solo",
  }
  const read = readWeek(week)
  if (!read.ok) {
    problems.push(
      ...read.problems.map((p) => `week: ${describeWeekProblem(p)}`)
    )
    return null
  }
  for (const { key, what, expect } of programsOf(read.week.tickets))
    checkRun(what, expect, runs[key], problems)
  // Its essay restates each fork's question, and its question scene the
  // whole ticket, as written, so the week holds the room they take there.
  for (const ticket of read.week.tickets) {
    const points = ticket.forks.map((fork) => fork.question)
    for (const unfit of [
      ...pointsFit(ticket.id, points),
      ...questionFit({
        ...ticket,
        figures: ticket.figures.map((figure) => figure.text),
        points,
      }),
    ])
      problems.push(`week: ${unfit}`)
  }
  const file = WeekV2Schema.parse(week)
  // The standing set reaches the week whole, or the week isn't put (C737).
  if (JSON.stringify(file.opening) !== JSON.stringify(STANDING_OPENING))
    problems.push(
      `week: its opening isn't the standing set (version ${STANDING_OPENING.version}) as it stands; the routine never writes the opening`
    )
  const oversize = oversizeWeek(file)
  if (oversize !== null) problems.push(`week: ${describeWeekProblem(oversize)}`)
  return problems.length > before ? null : { file, held: read.week }
}

/** Whether rustc did with `what` what its `expect` says, as home records it. */
function checkRun(
  what: string,
  expect: Expect,
  run: RustcRun | undefined,
  problems: Array<string>
): void {
  if (run === undefined) {
    problems.push(`week: ${what} hasn't been run with rustc`)
  } else if (run.outcome === "stopped") {
    problems.push(
      `week: ${what} was stopped (${run.why}); a program finishes at once`
    )
  } else if (!expectMatches(expect, run)) {
    problems.push(
      `week: ${what} expects ${JSON.stringify(expect)}, and rustc ${run.toolchain} gave ${describeRun(run)}`
    )
  }
}

function describeRun(run: RustcRun): string {
  switch (run.outcome) {
    case "compile-error": {
      return `a compile error (${run.code ?? "no code"})`
    }
    case "prints": {
      return `a run printing ${JSON.stringify(run.stdout)}`
    }
    case "panics": {
      return "a panic"
    }
    case "stopped": {
      return `a stop (${run.why})`
    }
    default: {
      return assertNever(run)
    }
  }
}

/** The files to put, or every problem, so the model fixes them in one pass. */
export function finish({
  bundle,
  history,
  values: input,
  runs,
}: {
  readonly bundle: Bundle
  readonly history: History
  readonly values: unknown
  /**
   * Each of next week's programs and academy starters, run with rustc, by
   * `programsOf`'s keys.
   */
  readonly runs: Readonly<Record<string, RustcRun>>
}): Finished {
  const parsed = ValuesSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `values.${issue.path.join(".")}: ${issue.message}`
      ),
    }
  }
  const values = parsed.data
  const problems: Array<string> = []
  const built = buildWeek(bundle, values, runs, problems)
  const week = built?.held ?? null

  const owed = new Set(bundle.essays.map((e) => e.week))
  for (const given of values.essays)
    if (!owed.has(given.week))
      problems.push(`essays: ${given.week} isn't owed an essay this run`)
  const weeks = week === null ? history.weeks : [...history.weeks, week]
  let known: History = { weeks, essays: history.essays }
  const essays: Array<Essay> = []
  for (const ended of bundle.essays) {
    const given = values.essays.find((e) => e.week === ended.week)
    if (given === undefined) {
      problems.push(`essays: ${ended.week} is owed an essay and has no values`)
      continue
    }
    const following = weeks.find((w) => w.id > ended.week)
    // Next week's own problems already say why it's missing.
    if (following === undefined && bundle.next !== null && week === null)
      continue
    const essay = buildEssay(ended, given, known, following, problems)
    if (essay === null) continue
    essays.push(essay)
    known = { weeks, essays: [...known.essays, essay] }
  }
  if (bundle.next !== null && week === null && problems.length === 0) {
    problems.push(`week: ${bundle.next.id} couldn't be built`)
  }
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    files: [
      ...essays.map((essay) => ({
        name: `rust-essay-${essay.week.id}.json`,
        body: essay,
      })),
      ...(week === null
        ? []
        : [{ name: `rust-week-${week.id}.json`, body: built?.file }]),
    ],
  }
}
