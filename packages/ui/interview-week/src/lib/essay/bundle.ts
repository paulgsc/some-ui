/**
 * The essay half of the Monday routine (IW6, #2937): which weeks are owed an
 * interview essay, and everything code knows about each before the model
 * writes a word. For each week past its deadline that home made final and
 * `brief` holds no essay of, it restates the week's company, role,
 * questions and cards, and each answer: a take with what home heard in it,
 * word by word, and IW3's measures of it (`measureAnswer`, `measureRead`),
 * or a silence, or a take home couldn't make out (HEARD2, #3072), which the
 * essay reads as a silence and never waits on. It also draws the faults chart over the weeks
 * (`chartOf`), so the model fills only the judged schema and the prose
 * (LEVERS, #2162).
 */
import type { Heard, WeekRecord } from "@interview-week/lib/essay/record"
import { heardByNote, indexWeeks } from "@interview-week/lib/essay/record"
import { measureAnswer, measureRead } from "@interview-week/lib/faults"
import type { AnswerFaults, ReadFaults } from "@interview-week/lib/faults"
import type { MailboxFile } from "@interview-week/lib/monday/bundle"
import {
  ESSAY_FILE,
  essaysIn,
  WEEK_FILE,
} from "@interview-week/lib/monday/bundle"
import type { Family, InterviewWeek } from "@interview-week/lib/week"
import { isOpening, readWeek } from "@interview-week/lib/week"
import { weekAround } from "@some-ui/core-utils"
import type { InterviewEssay } from "@some-ui/video-render"

const ESSAY_BUNDLE_SCHEMA = "some-ui.interview-essay-bundle/1"

/** The most essays one run writes, oldest first. */
const ESSAYS_PER_RUN = 2

/** The most weeks the chart shows (`INTERVIEW_WEEKS_MOST`). */
const CHART_WEEKS = 12

export type QuestionOwed = {
  readonly id: string
  readonly family: Family
  readonly prompt: string
  readonly guidelines: ReadonlyArray<string>
  readonly targetSeconds: number
  readonly answer:
    | {
        readonly kind: "take"
        readonly transcript: string
        readonly measured: AnswerFaults
      }
    | { readonly kind: "silence" }
    | { readonly kind: "unheard" }
}

type ReadOwed = {
  readonly id: string
  readonly situation: string
  readonly script: string
  readonly answer:
    | {
        readonly kind: "take"
        readonly transcript: string
        readonly measured: ReadFaults
      }
    | { readonly kind: "silence" }
    | { readonly kind: "unheard" }
}

type ChartRow = InterviewEssay["weeks"]["rows"][number]

export type EssayOwed = {
  readonly week: string
  readonly from: string
  readonly to: string
  readonly company: InterviewWeek["company"]
  readonly role: InterviewWeek["role"]
  readonly questions: ReadonlyArray<QuestionOwed>
  readonly reads: ReadonlyArray<ReadOwed>
  /** What home heard of the week's opening card (IW10), which no read counts; null when there is none to play. */
  readonly opening: { readonly transcript: string } | null
  /** The faults chart, drawn by code: the earlier essays' weeks, then this one. */
  readonly chart: {
    readonly weeks: ReadonlyArray<string>
    readonly rows: ReadonlyArray<ChartRow>
  }
  /** The week after, which `next` speaks to. */
  readonly next: string
}

export type EssayBundle = {
  readonly schema: typeof ESSAY_BUNDLE_SCHEMA
  readonly now: string
  readonly essays: ReadonlyArray<EssayOwed>
  /** Weeks owed an essay that can't be written yet, and why. */
  readonly waiting: ReadonlyArray<{
    readonly week: string
    readonly why: string
  }>
}

/**
 * Each fault the chart counts, one row each, and how a week's value comes
 * from its takes' measures: a mean, a sum or a longest, rounded. A week with
 * no take of the row's kind has no value. No row adds faults up into a score.
 */
const ANSWER_ROWS: ReadonlyArray<{
  readonly name: string
  readonly of: (f: AnswerFaults) => number | null
  readonly by: "mean" | "max" | "sum"
}> = [
  { name: "Fillers a minute", of: (f) => f.fillers.perMinute, by: "mean" },
  {
    name: "Longest pause, seconds",
    of: (f) => (f.pauses.longestMs === null ? null : f.pauses.longestMs / 1000),
    by: "max",
  },
  { name: "Mumbled words", of: (f) => f.mumbled.count, by: "sum" },
  {
    name: "Seconds over the target",
    of: (f) => f.length.overMs / 1000,
    by: "sum",
  },
]

const READ_ROWS: ReadonlyArray<{
  readonly name: string
  readonly of: (f: ReadFaults) => number | null
  readonly by: "mean" | "max" | "sum"
}> = [
  {
    name: "Words misread",
    of: (f) =>
      f.misread.skipped +
      f.misread.substituted +
      f.misread.repeated +
      f.misread.inserted,
    by: "sum",
  },
  { name: "Pauses mid-phrase", of: (f) => f.pauses.midPhrase, by: "sum" },
  { name: "Pace variation", of: (f) => f.pace.variation, by: "mean" },
  {
    name: "Lead-in, seconds",
    of: (f) => (f.leadInMs === null ? null : f.leadInMs / 1000),
    by: "mean",
  },
]

const round = (n: number): number =>
  Math.round(n * (Math.abs(n) < 1 ? 100 : 10)) / (Math.abs(n) < 1 ? 100 : 10)

function combine(
  values: ReadonlyArray<number | null>,
  by: "mean" | "max" | "sum"
): number | null {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return null
  const total = known.reduce((a, b) => a + b, 0)
  return round(
    by === "sum"
      ? total
      : by === "max"
        ? Math.max(...known)
        : total / known.length
  )
}

/** This week's value of each chart row, from its takes' measures. */
function weekCells(
  questions: ReadonlyArray<QuestionOwed>,
  reads: ReadonlyArray<ReadOwed>
): Array<{ name: string; of: "answers" | "reads"; value: number | null }> {
  const answers = questions.flatMap((q) =>
    q.answer.kind === "take" ? [q.answer.measured] : []
  )
  const readings = reads.flatMap((r) =>
    r.answer.kind === "take" ? [r.answer.measured] : []
  )
  return [
    ...ANSWER_ROWS.map((row) => ({
      name: row.name,
      of: "answers" as const,
      value: answers.length === 0 ? null : combine(answers.map(row.of), row.by),
    })),
    ...READ_ROWS.map((row) => ({
      name: row.name,
      of: "reads" as const,
      value:
        readings.length === 0 ? null : combine(readings.map(row.of), row.by),
    })),
  ]
}

/** One week's column of the chart: each row's value that week. */
type Column = {
  readonly week: string
  readonly cells: ReturnType<typeof weekCells>
}

/** A chart's own week's column: each row's last cell. */
const lastColumn = (week: string, rows: ReadonlyArray<ChartRow>): Column => ({
  week,
  cells: rows.map((row) => ({
    name: row.name,
    of: row.of,
    value: row.cells.at(-1) ?? null,
  })),
})

/**
 * The chart over the weeks: the newest `CHART_WEEKS - 1` earlier columns
 * before `week` (the essays `brief` holds, and those prepared earlier in this
 * run), then this week's cells.
 */
function chartOf(
  week: string,
  cells: ReturnType<typeof weekCells>,
  earlier: ReadonlyArray<Column>
): EssayOwed["chart"] {
  const before = earlier
    .filter((column) => column.week < week)
    .sort((a, b) => (a.week < b.week ? -1 : 1))
    .slice(-(CHART_WEEKS - 1))
  const valueIn = (column: Column, name: string, of: string): number | null =>
    column.cells.find((c) => c.name === name && c.of === of)?.value ?? null
  return {
    weeks: [...before.map((c) => c.week), week],
    rows: cells.map((cell) => ({
      name: cell.name,
      of: cell.of,
      cells: [...before.map((c) => valueIn(c, cell.name, cell.of)), cell.value],
    })),
  }
}

type Owed = { ok: true; essay: EssayOwed } | { ok: false; why: string }

function owed(
  record: WeekRecord,
  week: InterviewWeek | undefined,
  heard: ReadonlyMap<string, Heard>,
  earlier: ReadonlyArray<Column>
): Owed {
  if (week === undefined)
    return { ok: false, why: "brief holds no readable week file for it" }
  const heardOf = (
    take: string | null,
    what: string,
    // The opening is played, never measured, so it needs no word times.
    measured = true
  ): { ok: true; heard: Heard } | { ok: false; why: string } => {
    const got: Heard | undefined =
      take === null ? { hearing: "silent" } : heard.get(take)
    if (got?.hearing === "silent" || got?.hearing === "unheard")
      return { ok: true, heard: got }
    if (got === undefined || got.text.trim() === "")
      return { ok: false, why: `home hasn't heard ${what}'s take yet` }
    if (measured && (got.words === null || got.words.length === 0))
      return {
        ok: false,
        why: `home heard ${what}'s take without its words, which the measures count from`,
      }
    return { ok: true, heard: got }
  }
  /** A silence, or a take home couldn't make out, as the bundle restates it. */
  const left = (
    hearing: Exclude<Heard, { hearing: "heard" }>
  ): { kind: "silence" } | { kind: "unheard" } =>
    hearing.hearing === "silent" ? { kind: "silence" } : { kind: "unheard" }
  const questions: Array<QuestionOwed> = []
  for (const question of week.questions) {
    const held = record.questions.find((q) => q.question === question.id)
    const got = heardOf(held?.take ?? null, question.id)
    if (!got.ok) return got
    questions.push({
      id: question.id,
      family: question.family,
      prompt: question.prompt,
      guidelines: question.guidelines,
      targetSeconds: question.targetSeconds,
      answer:
        got.heard.hearing !== "heard"
          ? left(got.heard)
          : {
              kind: "take",
              transcript: got.heard.text,
              measured: measureAnswer({
                words: got.heard.words ?? [],
                targetMs: question.targetSeconds * 1000,
                takeMs: null,
              }),
            },
    })
  }
  const reads: Array<ReadOwed> = []
  let opening: EssayOwed["opening"] = null
  for (const card of week.cards) {
    const held = record.cards.find((c) => c.card === card.id)
    const got = heardOf(
      held?.take ?? null,
      `the read of ${card.id}`,
      !isOpening(card)
    )
    if (!got.ok) return got
    if (isOpening(card)) {
      if (got.heard.hearing === "heard") {
        opening = { transcript: got.heard.text }
      }
      continue
    }
    reads.push({
      id: card.id,
      situation: card.situation,
      script: card.script,
      answer:
        got.heard.hearing !== "heard"
          ? left(got.heard)
          : {
              kind: "take",
              transcript: got.heard.text,
              measured: measureRead({
                words: got.heard.words ?? [],
                script: card.script,
              }),
            },
    })
  }
  return {
    ok: true,
    essay: {
      week: week.id,
      from: week.opens.slice(0, 10),
      to: week.due.slice(0, 10),
      company: week.company,
      role: week.role,
      questions,
      reads,
      opening,
      chart: chartOf(week.id, weekCells(questions, reads), earlier),
      // A minute past Sunday 23:59 is the next week's Monday.
      next: weekAround(new Date(new Date(week.due).getTime() + 60_000)).id,
    },
  }
}

export type PreparedEssays = { readonly bundle: EssayBundle }

/**
 * The essays owed at `now`: from `brief` (weeks and essays), home's index of
 * final records (`records`, the index's body) and the transcripts it names.
 */
export function prepareEssays(input: {
  readonly now: Date
  readonly brief: ReadonlyArray<MailboxFile>
  readonly index: unknown
  readonly transcripts: ReadonlyArray<MailboxFile>
}): PreparedEssays {
  const weeks = new Map<string, InterviewWeek>()
  for (const file of input.brief) {
    if (!WEEK_FILE.test(file.name)) continue
    const read = readWeek(file.body)
    if (read.ok) weeks.set(read.week.id, read.week)
  }
  const essays = essaysIn(input.brief)
  // Every essay `brief` names is written, read or not: a second put under its name is refused.
  const written = new Set(
    input.brief.flatMap((file) => ESSAY_FILE.exec(file.name)?.[1] ?? [])
  )
  const heard = heardByNote(input.transcripts)
  const due = indexWeeks(input.index)
    .filter((record) => !written.has(record.week))
    .sort((a, b) => (a.week < b.week ? -1 : 1))
  const owedEssays: Array<EssayOwed> = []
  const waiting: Array<{ week: string; why: string }> = []
  const columns = essays.map((e) => lastColumn(e.week.id, e.weeks.rows))
  for (const record of due) {
    const result = owed(record, weeks.get(record.week), heard, columns)
    if (!result.ok) waiting.push({ week: record.week, why: result.why })
    else if (owedEssays.length < ESSAYS_PER_RUN) {
      owedEssays.push(result.essay)
      columns.push(lastColumn(result.essay.week, result.essay.chart.rows))
    }
  }
  return {
    bundle: {
      schema: ESSAY_BUNDLE_SCHEMA,
      now: input.now.toISOString(),
      essays: owedEssays,
      waiting,
    },
  }
}
