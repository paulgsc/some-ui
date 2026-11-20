/**
 * The Monday routine's prepare step (RR18, paulgsc/some-ui#2693): from what
 * the mailbox holds, everything a model needn't decide, as one bundle.
 *
 * It decides which weeks are owed an essay (each week past its deadline with
 * no essay in the mailbox, oldest first, at most `ESSAYS_MOST` a run), whether
 * each can be written yet (home's record final, every take heard), what each
 * ticket's answer was (a take and what home heard in it, or the silence and
 * how often the ticket was opened), and next week's frame: its id, when it
 * opens and is due, and its seeds and topics (`chooseTopics`), the decay
 * record's concepts due first (RR19, `@rust-rounds/lib/decay`). The model then
 * writes only the values `values.ts` asks for; `finish.ts` builds and checks
 * the two files from the bundle and those values.
 */
import type { DueConcept, Judged } from "@rust-rounds/lib/decay"
import { dueAt, recordOf, weeksBetween } from "@rust-rounds/lib/decay"
import { REFERENCES } from "@rust-rounds/lib/formats/week"
import type { Reference, Ticket, Week } from "@rust-rounds/lib/formats/week"
import { heardByNote, readFinalRecord } from "@rust-rounds/lib/monday/record"
import type { Heard, WeekRecord } from "@rust-rounds/lib/monday/record"
import { chooseTopics } from "@rust-rounds/lib/monday/topics"
import type { Seed, Topic, TopicChoice } from "@rust-rounds/lib/monday/topics"
import { readWeek } from "@rust-rounds/lib/week-check"
import { pacificDay, weekAround } from "@some-ui/core-utils"
import type { Essay } from "@some-ui/video-render"
import { parseEssay } from "@some-ui/video-render"

const BUNDLE_SCHEMA = "some-ui.rust-monday/1"

/** The most essays one run writes, so a run after a gap catches up over a few Mondays. */
export const ESSAYS_MOST = 2

/**
 * How many weeks before next week an ended week still waiting on home keeps
 * its concepts off the due list; a week this run writes always does.
 */
const PENDING_WEEKS = 2

/** A file from the mailbox: its name and its body, parsed. */
export type MailboxFile = { readonly name: string; readonly body: unknown }

const WEEK_NAME = /^rust-week-(\d{4}-w\d{2})\.json$/
const ESSAY_NAME = /^rust-essay-(\d{4}-w\d{2})(?:-r(\d+))?\.json$/

/** What home heard in a take of one speak-to point (RR24): its words, nothing said, or nothing made out. */
type EndedPoint = {
  /** The point, by its place in `forks`, from 1. */
  readonly point: number
  readonly answer:
    | { readonly kind: "take"; readonly transcript: string }
    | {
        readonly kind: "silence" | "unheard"
        /** How often its ticket was opened. */
        readonly opened: number
      }
}

/**
 * One ticket of a week that ended, as the essay restates it, with its
 * answer: a take of the whole ticket, a silence, a take home couldn't make
 * out, or `by-points`, no take of the whole ticket and some of its points
 * answered by takes of their own (RR24). `points` lists those, in order.
 */
export type EndedTicket = Ticket & {
  readonly answer:
    | { readonly kind: "take"; readonly transcript: string }
    | {
        readonly kind: "silence" | "unheard" | "by-points"
        readonly opened: number
      }
  readonly points: ReadonlyArray<EndedPoint>
}

/** A week owed its essay, ready to write. */
export type EndedWeek = {
  readonly week: string
  readonly from: string
  readonly to: string
  readonly company: Week["company"]
  readonly story: string
  readonly sla: Week["sla"]
  readonly references: ReadonlyArray<string>
  /**
   * The opening conversation (#3269, C738): each of the week's opening
   * questions whose answer has a take home resolved (C736) and heard
   * something in, with what it heard and that take's id, in order. Absent
   * when none has, and the essay opens as before.
   */
  readonly opening?: {
    readonly exchanges: ReadonlyArray<{
      readonly n: number
      readonly ask: string
      readonly transcript: string
      readonly take: string
    }>
  }
  readonly tickets: ReadonlyArray<EndedTicket>
}

/** Next week's frame: what code decides before the model writes it. */
type NextFrame = {
  readonly id: string
  readonly opens: string
  readonly due: string
  readonly seeds: ReadonlyArray<Seed>
  readonly notSeeded: ReadonlyArray<Seed>
  readonly topics: ReadonlyArray<Topic>
  /** The companies earlier weeks invented, so a new one is new. */
  readonly earlierCompanies: ReadonlyArray<string>
}

export type Bundle = {
  readonly schema: typeof BUNDLE_SCHEMA
  readonly now: string
  /** The decay record's concepts due next week (RR19), which come first among its topics. */
  readonly due: ReadonlyArray<DueConcept>
  readonly essays: ReadonlyArray<EndedWeek>
  /** Weeks owed an essay that can't be written this run, and why, in the owner's terms. */
  readonly waiting: ReadonlyArray<{
    readonly week: string
    readonly why: string
  }>
  /** Next week's frame, or null when the mailbox already holds it. */
  readonly next: NextFrame | null
  /** Mailbox files this run couldn't read, and why. */
  readonly unread: ReadonlyArray<{
    readonly name: string
    readonly why: string
  }>
}

/** Everything `finish` needs beyond the bundle: earlier weeks and essays, for the chart. */
export type History = {
  readonly weeks: ReadonlyArray<Week>
  readonly essays: ReadonlyArray<Essay>
}

export type Prepared = { readonly bundle: Bundle; readonly history: History }

/**
 * A week as the decay record reads it: each ticket's concepts and its SOLO
 * level in `answers` (an essay's tickets), or null for a silence. A take
 * home couldn't make out (HEARD2, #3072) is no check at all: it shows
 * nothing, isn't a silence and can't decay, so its ticket is left out (C431).
 * A ticket with no take of the whole ticket and points answered by takes of
 * their own (RR24) is at the lowest of their levels (C685): a concept is
 * shown as far as every point said of it shows it. A ticket whose every
 * point is answered only by takes home couldn't make out is left out too.
 */
export function judgedWeek(
  week: string,
  tickets: ReadonlyArray<Pick<Ticket, "id" | "concepts">>,
  answers: ReadonlyArray<
    Pick<Essay["tickets"][number], "id" | "answer" | "points">
  >
): Judged {
  return {
    week,
    tickets: tickets.flatMap((ticket) => {
      const held = answers.find((t) => t.id === ticket.id)
      const answer = held?.answer
      const own = (held?.points ?? []).flatMap((point) =>
        point.answer?.kind === "take" ? [point.answer.solo.level] : []
      )
      const level =
        answer?.kind === "take"
          ? answer.solo.level
          : own.length > 0
            ? Math.min(...own)
            : null
      // No check at all when every point's answer is a take home couldn't
      // make out, the ticket's or a point's own (C431).
      const unheard = (a: { readonly kind: string } | undefined): boolean =>
        a?.kind === "silence" && "unheard" in a && a.unheard === true
      if (
        level === null &&
        held?.points.every((point) => unheard(point.answer ?? held.answer)) ===
          true
      )
        return []
      return [{ concepts: ticket.concepts, level }]
    }),
  }
}

/** The weeks the mailbox holds an essay for, as the decay record reads them. */
export function judgedOf(history: History): Array<Judged> {
  return history.weeks.flatMap((week) => {
    const essay = history.essays.find((e) => e.week.id === week.id)
    return essay === undefined
      ? []
      : [judgedWeek(week.id, week.tickets, essay.tickets)]
  })
}

function readBrief(brief: ReadonlyArray<MailboxFile>): {
  weeks: Array<Week>
  essays: Map<string, { rev: number; essay: Essay }>
  essayNames: Set<string>
  unread: Array<{ name: string; why: string }>
} {
  const weeks: Array<Week> = []
  const essays = new Map<string, { rev: number; essay: Essay }>()
  const essayNames = new Set<string>()
  const unread: Array<{ name: string; why: string }> = []
  for (const file of brief) {
    const week = WEEK_NAME.exec(file.name)
    if (week !== null) {
      const read = readWeek(file.body)
      if (read.ok && read.week.id === week[1]) weeks.push(read.week)
      else unread.push({ name: file.name, why: "not a week this build reads" })
      continue
    }
    const [, id, rev] = ESSAY_NAME.exec(file.name) ?? []
    if (id === undefined) continue
    essayNames.add(id)
    const read = parseEssay(file.body)
    const n = rev === undefined ? 1 : Number(rev)
    if (!read.ok) {
      unread.push({ name: file.name, why: "not an essay this build reads" })
    } else if ((essays.get(id)?.rev ?? 0) < n) {
      essays.set(id, { rev: n, essay: read.value })
    }
  }
  weeks.sort((a, b) => (a.id < b.id ? -1 : 1))
  return { weeks, essays, essayNames, unread }
}

/**
 * A take's answer from what home heard in it: its words, a silence when
 * nothing was said, `unheard` when nothing was made out; null while home
 * hasn't heard it yet.
 */
function answerHeard(
  hearing: Heard | undefined,
  opened: number
):
  | { readonly kind: "take"; readonly transcript: string }
  | { readonly kind: "silence" | "unheard"; readonly opened: number }
  | null {
  if (hearing?.hearing === "silent" || hearing?.hearing === "unheard")
    return {
      kind: hearing.hearing === "silent" ? "silence" : "unheard",
      opened,
    }
  if (hearing === undefined || hearing.text.trim() === "") return null
  return { kind: "take", transcript: hearing.text }
}

/**
 * The week's opening conversation as the essay plays it (#3269): for each
 * of the week's opening questions, the take home resolved for its answer
 * (C736) when it is of the week's opening version, and what home heard in
 * it. A question with no take, or one home heard nothing in or couldn't make
 * out, is left out; one whose take home hasn't heard yet holds the essay.
 */
export function openingOf(
  week: Week,
  record: WeekRecord,
  heard: ReadonlyMap<string, Heard>
):
  | {
      readonly ok: true
      readonly exchanges: NonNullable<EndedWeek["opening"]>["exchanges"]
    }
  | { readonly ok: false; readonly why: string } {
  const exchanges: Array<
    NonNullable<EndedWeek["opening"]>["exchanges"][number]
  > = []
  for (const [i, { ask }] of (week.opening?.exchanges ?? []).entries()) {
    const n = i + 1
    const take = record.opening.find(
      (t) => t.n === n && t.version === week.opening?.version
    )
    if (take === undefined) continue
    const read = answerHeard(heard.get(take.take), 0)
    if (read === null)
      return {
        ok: false,
        why: `home hasn't heard the take on the opening's question ${n} yet`,
      }
    if (read.kind === "take")
      exchanges.push({ n, ask, transcript: read.transcript, take: take.take })
  }
  return { ok: true, exchanges }
}

/** A week's tickets with their answers, or why the essay can't be written yet. */
function answersOf(
  week: Week,
  record: WeekRecord,
  heard: ReadonlyMap<string, Heard>
): { ok: true; tickets: Array<EndedTicket> } | { ok: false; why: string } {
  const tickets: Array<EndedTicket> = []
  for (const ticket of week.tickets) {
    const held = record.tickets.find((t) => t.ticket === ticket.id)
    if (held === undefined) {
      return { ok: false, why: `home's record has no ${ticket.id}` }
    }
    const points: Array<EndedPoint> = []
    for (const own of held.points) {
      if (own.point > ticket.forks.length) {
        return {
          ok: false,
          why: `home's record answers point ${own.point} of ${ticket.id}, which has ${ticket.forks.length}`,
        }
      }
      const read = answerHeard(heard.get(own.take), held.opens)
      if (read === null) {
        return {
          ok: false,
          why: `home hasn't heard the take on point ${own.point} of ${ticket.id} yet`,
        }
      }
      points.push({ point: own.point, answer: read })
    }
    if (held.take === null && points.length > 0) {
      tickets.push({
        ...ticket,
        answer: { kind: "by-points", opened: held.opens },
        points,
      })
      continue
    }
    const read = answerHeard(
      held.take === null ? { hearing: "silent" } : heard.get(held.take),
      held.opens
    )
    if (read === null) {
      return {
        ok: false,
        why: `home hasn't heard the take on ${ticket.id} yet`,
      }
    }
    tickets.push({ ...ticket, answer: read, points })
  }
  return { ok: true, tickets }
}

/** What the owner said about a pasted error, when home made it out. */
const saidOf = (hearing: Heard | undefined): string | null =>
  hearing?.hearing === "heard" ? hearing.text : null

const fullNames = (references: ReadonlyArray<Reference>): Array<string> =>
  references.map((reference) => REFERENCES[reference])

/** The bundle for a run at `now`, and the history `finish` draws the chart from. */
export function prepare({
  now,
  brief,
  records,
  transcripts,
}: {
  readonly now: Date
  /** The mailbox's `brief` folder's weeks and essays. */
  readonly brief: ReadonlyArray<MailboxFile>
  /** Home's records of the weeks owed an essay, as home gave them. */
  readonly records: ReadonlyArray<unknown>
  /** The mailbox's `transcript` folder's files. */
  readonly transcripts: ReadonlyArray<MailboxFile>
}): Prepared {
  const { weeks, essays, essayNames, unread } = readBrief(brief)
  const heard = heardByNote(transcripts)
  const finals = new Map<string, WeekRecord>()
  for (const input of records) {
    const read = readFinalRecord(input)
    if (read.ok) finals.set(read.record.week, read.record)
  }

  const owed = weeks
    .filter((week) => Date.parse(week.due) < now.getTime())
    .filter((week) => !essayNames.has(week.id))
    .slice(0, ESSAYS_MOST)
  const ended: Array<EndedWeek> = []
  const waiting: Array<{ week: string; why: string }> = []
  const seeds: Array<Seed> = []
  for (const week of owed) {
    const record = finals.get(week.id)
    if (record === undefined) {
      waiting.push({
        week: week.id,
        why: "home's final record of it isn't here",
      })
      continue
    }
    const answers = answersOf(week, record, heard)
    if (!answers.ok) {
      waiting.push({ week: week.id, why: answers.why })
      continue
    }
    const opening = openingOf(week, record, heard)
    if (!opening.ok) {
      waiting.push({ week: week.id, why: opening.why })
      continue
    }
    ended.push({
      week: week.id,
      from: pacificDay(new Date(week.opens)),
      to: pacificDay(new Date(week.due)),
      company: week.company,
      story: week.story,
      sla: week.sla,
      references: fullNames(week.references),
      ...(opening.exchanges.length > 0
        ? { opening: { exchanges: opening.exchanges } }
        : {}),
      tickets: answers.tickets,
    })
    for (const paste of record.pastes) {
      seeds.push({
        week: week.id,
        at: paste.at,
        text: paste.text,
        said: paste.note === null ? null : saidOf(heard.get(paste.note)),
      })
    }
  }

  const around = weekAround(now)
  const nextId = around.id
  const history: History = {
    weeks,
    essays: [...essays.values()].map(({ essay }) => essay),
  }
  const writing = new Set(ended.map((e) => e.week))
  const pending = new Set(
    weeks
      .filter((week) => Date.parse(week.due) < now.getTime())
      .filter((week) => !essayNames.has(week.id))
      .filter(
        (week) =>
          writing.has(week.id) || weeksBetween(week.id, nextId) <= PENDING_WEEKS
      )
      .flatMap((week) =>
        week.tickets.flatMap((t) => t.concepts.map((c) => c.id))
      )
  )
  const due = dueAt(recordOf(judgedOf(history)), nextId, pending)
  let next: NextFrame | null = null
  if (!weeks.some((week) => week.id === nextId)) {
    const choice: TopicChoice = chooseTopics({ weeks, seeds, due })
    next = {
      id: nextId,
      opens: around.opens,
      due: around.due,
      ...choice,
      earlierCompanies: [...new Set(weeks.map((week) => week.company.name))],
    }
  }

  return {
    bundle: {
      schema: BUNDLE_SCHEMA,
      now: now.toISOString(),
      due,
      essays: ended,
      waiting,
      next,
      unread,
    },
    history,
  }
}
