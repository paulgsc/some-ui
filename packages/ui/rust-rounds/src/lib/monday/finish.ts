/**
 * The Monday routine's finish step (RR18, paulgsc/some-ui#2693): the bundle
 * and the model's values become the files the routine puts, each checked by
 * the app's own parser before it can leave: an essay (`some-ui.rust-essay/1`,
 * `parseEssay`) for each week the bundle owes one, and next week
 * (`some-ui.rust-week/1`, `readWeek`), every program run with a real rustc
 * and matching its `expect`.
 *
 * What code writes, never the model:
 *
 * - every restated field (the week, its company, story, SLA, tickets,
 *   speak-to points, programs, the owner's transcripts and the silences'
 *   counts), and next week's id, dates, references, rubric and family;
 * - **the chart and the role line**, both the decay record's (RR19, #2695,
 *   `@rust-rounds/lib/decay`), read over every week the mailbox holds an
 *   essay for and this one; the essay pins version 2 of its template only
 *   when its chart draws decay or fading (C270);
 * - a seed ticket's source, as a sentence at the end of its spec (#2685).
 *
 * What it holds beyond the parsers: each deep dive said in 2 to 5 minutes
 * (C103), every topic and seed covered by a ticket, and each topic's concept
 * named as the area table names it.
 */
import type { Judged } from "@rust-rounds/lib/decay"
import { chartOf, recordOf, roleAt } from "@rust-rounds/lib/decay"
import type { RustcRun } from "@rust-rounds/lib/formats"
import { expectMatches } from "@rust-rounds/lib/formats"
import { ReferenceSchema, WEEK_SCHEMA } from "@rust-rounds/lib/formats/week"
import type { Reference, Week } from "@rust-rounds/lib/formats/week"
import type {
  Bundle,
  EndedTicket,
  EndedWeek,
  History,
} from "@rust-rounds/lib/monday/bundle"
import { judgedOf } from "@rust-rounds/lib/monday/bundle"
import { AREAS } from "@rust-rounds/lib/monday/topics"
import type {
  EssayTicketValues,
  EssayValues,
  Values,
} from "@rust-rounds/lib/monday/values"
import { ValuesSchema } from "@rust-rounds/lib/monday/values"
import { describeWeekProblem, readWeek } from "@rust-rounds/lib/week-check"
import { assertNever, pacificDay } from "@some-ui/core-utils"
import type { Essay } from "@some-ui/video-render"
import {
  ESSAY_CHART_ROWS,
  ESSAY_DECAY_VERSION,
  ESSAY_ID,
  ESSAY_SCHEMA,
  ESSAY_WEEKS_MOST,
  needsDecayVersion,
  parseEssay,
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

function essayTicket(
  ticket: EndedTicket,
  values: EssayTicketValues,
  problems: Array<string>
): Essay["tickets"][number] | null {
  const at = `${ticket.id}`
  if (values.bests.length !== ticket.speakTo.length) {
    problems.push(
      `${at}: ${values.bests.length} best fits for ${ticket.speakTo.length} speak-to points`
    )
  }
  const reading = values.answer
  let answer: Essay["tickets"][number]["answer"] | null = null
  if (ticket.answer.kind === "take") {
    if ("guess" in reading) {
      problems.push(
        `${at}: answered, so it takes marks and a SOLO level, not a guess`
      )
    } else {
      answer = {
        kind: "take",
        transcript: ticket.answer.transcript,
        ...reading,
      }
    }
  } else if ("guess" in reading) {
    answer = {
      kind: "silence",
      opened: ticket.answer.opened,
      guess: reading.guess,
    }
  } else {
    problems.push(
      `${at}: left unanswered, so it takes a guess at why, not marks`
    )
  }
  values.dives.forEach((dive, k) => {
    const n = wordCount(dive.said)
    if (n < DIVE_WORDS_LEAST || n > DIVE_WORDS_MOST) {
      problems.push(
        `${at}: deep dive ${k + 1} is ${n} words; a deep dive is ${DIVE_WORDS_LEAST} to ${DIVE_WORDS_MOST} (2 to 5 minutes)`
      )
    }
  })
  if (answer === null) return null
  return {
    id: ticket.id,
    title: ticket.title,
    spec: ticket.spec,
    figures: ticket.figures,
    program: ticket.program,
    points: ticket.speakTo.map((to, i) => ({
      to,
      best: values.bests[i] ?? "",
    })),
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
    const built = essayTicket(ticket, held, problems)
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
    {
      week: ended.week,
      tickets: ended.tickets.map((ticket) => {
        const answer = tickets.find((t) => t.id === ticket.id)?.answer
        return {
          concepts: ticket.concepts,
          level: answer?.kind === "take" ? answer.solo.level : null,
        }
      }),
    },
  ]
  const record = recordOf(judged)
  const chart = chartOf(
    record,
    judged.map((j) => j.week),
    ended.tickets.flatMap((t) => t.concepts),
    { weeks: ESSAY_WEEKS_MOST, concepts: ESSAY_CHART_ROWS }
  )
  const version = chart.concepts.some((c) => c.cells.some(needsDecayVersion))
    ? ESSAY_DECAY_VERSION
    : 1
  const topics = [
    ...new Set(following.tickets.flatMap((t) => t.concepts.map((c) => c.name))),
  ]
  const essay = {
    schema: ESSAY_SCHEMA,
    template: { id: ESSAY_ID, version },
    week: { id: ended.week, from: ended.from, to: ended.to },
    company: ended.company,
    story: ended.story,
    sla: ended.sla,
    references: ended.references,
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
  if (!parsed.ok) {
    problems.push(...parsed.problems.map((p) => `${ended.week} essay: ${p}`))
    return null
  }
  return parsed.value
}

function buildWeek(
  bundle: Bundle,
  values: Values,
  runs: Readonly<Record<string, RustcRun>>,
  problems: Array<string>
): Week | null {
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
  for (const ticket of read.week.tickets) {
    const run = runs[ticket.id]
    if (run === undefined) {
      problems.push(`week: ${ticket.id}'s program hasn't been run with rustc`)
    } else if (run.outcome === "stopped") {
      problems.push(
        `week: ${ticket.id}'s program was stopped (${run.why}); a program finishes at once`
      )
    } else if (!expectMatches(ticket.expect, run)) {
      problems.push(
        `week: ${ticket.id} expects ${JSON.stringify(ticket.expect)}, and rustc ${run.toolchain} gave ${describeRun(run)}`
      )
    }
  }
  return problems.length > before ? null : read.week
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
  /** Each of next week's tickets' programs, run with rustc, by ticket id. */
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
  const week = buildWeek(bundle, values, runs, problems)

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
        : [{ name: `rust-week-${week.id}.json`, body: week }]),
    ],
  }
}
