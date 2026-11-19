/**
 * What the interview week's Monday routine hands the model (IW4, #2935):
 * next week's id and dates, and every choice code makes. Code chooses each
 * question's family and variant, each decision question's call, and each
 * card's source and situation. Each choice rotates over the weeks, least
 * recently asked first. The words are the model's (`values.ts`).
 */
import type {
  Call,
  Epic,
  Invariant,
  Material,
} from "@interview-week/lib/monday/corpus"
import type {
  CardSource,
  Family,
  InterviewWeek,
} from "@interview-week/lib/week"
import {
  FAMILIES,
  FAMILY_IDS,
  OPENING_CARD,
  readWeek,
  SLUG_MAX,
  TARGET_SECONDS,
} from "@interview-week/lib/week"
import { assertNever, weekAround } from "@some-ui/core-utils"
import { MONIKER, parseInterviewEssay } from "@some-ui/video-render"
import type { InterviewEssay } from "@some-ui/video-render"

const BUNDLE_SCHEMA = "some-ui.interview-monday-bundle/2"

/** A card's script runs 1 to 2 minutes: about 150 to 300 words (#2935). */
export const SCRIPT_WORDS = { min: 150, max: 300 } as const

/** How fast a script is read, for its target: 150 words a minute. */
export const READ_WORDS_PER_MINUTE = 150

/**
 * Where a read like a card's is given, a closed list rotated over the weeks.
 * The cue the owner reads after, so a script is written for one place. A
 * week keeps the text, not the key, so rewording one starts its rotation
 * over: add a situation rather than reword one.
 */
export const SITUATIONS: Readonly<Record<string, string>> = {
  "demo-opening":
    "You open a demo of this work for a team that hasn't seen it.",
  "interview-project":
    "An interviewer asks you to walk them through a project you built.",
  "talk-opening": "You give the first minutes of a short talk on this work.",
  "recorded-update":
    "You record a short update on this work for people who follow it.",
}

/** Where the opening is read: the cue the owner reads after. */
export const OPENING_SITUATION =
  "The opening of this week's interview essay, in your own voice."

/** A week in the mailbox's `brief`, by its name. */
export type MailboxFile = { readonly name: string; readonly body: unknown }

type QuestionSlot = {
  readonly id: string
  readonly family: Family
  readonly variant: string
  /** What the variant asks, for the model to word for the role. */
  readonly asks: string
  readonly targetSeconds: number
  /** A decision question's call, as the record holds it. */
  readonly call?: Call
}

type CardSlot = {
  readonly id: string
  readonly source: CardSource
  readonly situation: string
  readonly title: string
  /** The source's text, for the script to present its motivation. */
  readonly material: string
}

/**
 * A piece of the body of work a ready answer may cite, by its key
 * (`workSourceKey`); a doc's or invariant's file, which a citation must name
 * as written.
 */
export type WorkEntry = {
  readonly key: string
  readonly title: string
  readonly path?: string
}

type Next = {
  readonly id: string
  /** The commit the body of work was read at: every source a ready answer names is in `sources`. */
  readonly commit: string
  /** The body of work at `commit` (IW8): what a ready answer's claim may name as its source. */
  readonly sources: ReadonlyArray<WorkEntry>
  readonly opens: string
  readonly due: string
  /** The companies earlier weeks invented, so a new one is new. */
  readonly earlierCompanies: ReadonlyArray<string>
  readonly questions: ReadonlyArray<QuestionSlot>
  readonly cards: ReadonlyArray<CardSlot>
}

export type Bundle = {
  readonly schema: typeof BUNDLE_SCHEMA
  readonly now: string
  /** Null when the mailbox already holds this week. */
  readonly next: Next | null
  /** Files in `brief` that look like a week but don't read as one. */
  readonly unread: ReadonlyArray<{
    readonly name: string
    readonly why: string
  }>
}

export type Corpus = {
  /** The calls record, newest first (`callsOf`). */
  readonly calls: ReadonlyArray<Call>
  /** The epics that moved, newest first (`epicsOf`). */
  readonly epics: ReadonlyArray<Epic>
  /** `docs/`, by path (`docsOf`). */
  readonly docs: ReadonlyArray<Material & { readonly path: string }>
  /** Every declared invariant (`invariantsOf`). */
  readonly invariants: ReadonlyArray<Invariant>
  /** The pull requests that merged in the last week, in both repos (`render call-facts`). */
  readonly pulls: ReadonlyArray<Pull>
}

/** A merged pull request, as `render call-facts` lists it. */
type Pull = {
  readonly repo: "some-ui" | "server"
  readonly number: number
  readonly title: string
}

/**
 * The body of work a ready answer may cite (IW8, #3175), each once, by key:
 * the whole calls record and every doc and declared invariant of the
 * checkout, and of what `render call-facts` reads, the pull requests merged
 * and the epics that moved in the last week. An older pull request is
 * reached through the call that names it.
 */
function workOf(corpus: Corpus): Array<WorkEntry> {
  const entries: Array<WorkEntry> = [
    ...corpus.pulls.map((p) => ({
      key: `pull:${p.repo}#${p.number}`,
      title: p.title,
    })),
    ...corpus.calls.map((c) => ({ key: `call:${c.id}`, title: c.chose })),
    ...corpus.epics.map((e) => ({ key: e.key, title: e.title })),
    ...corpus.docs.map((d) => ({ key: d.key, title: d.title, path: d.path })),
    ...corpus.invariants.map((i) => ({
      key: i.key,
      title: i.title,
      path: i.path,
    })),
  ]
  const seen = new Set<string>()
  return entries.filter((e) => !seen.has(e.key) && seen.add(e.key))
}

/** An essay's name in `brief`: `interview-essay-<week>.json`, `-r2` on for a correction. */
export const ESSAY_FILE = /^interview-essay-(\d{4}-w\d{2})(?:-r(\d+))?\.json$/
export const essayFileName = (week: string): string =>
  `interview-essay-${week}.json`

/** The week an essay's file `name` is of, and its revision (1 for the first); null for another file. */
function essayRevision(
  name: string
): { readonly week: string; readonly r: number } | null {
  const [, week, r] = ESSAY_FILE.exec(name) ?? []
  if (week === undefined) return null
  return { week, r: r === undefined ? 1 : Number(r) }
}

export const WEEK_FILE = /^interview-week-(\d{4}-w\d{2})\.json$/

/** `name` as a week's file in `brief`. */
export const weekFileName = (id: string): string => `interview-week-${id}.json`

/** Each key's latest week, so a choice never asked sorts before one asked. */
type Asked = ReadonlyMap<string, string>

/**
 * The item of `items` asked longest ago, never asked first; ties go to the
 * earliest in `items`, which each caller orders on purpose.
 */
function leastRecent<T>(
  items: ReadonlyArray<T>,
  key: (item: T) => string,
  asked: Asked
): T | undefined {
  let best: T | undefined
  let bestAt = ""
  for (const item of items) {
    const at = asked.get(key(item)) ?? ""
    if (best === undefined || at < bestAt) {
      best = item
      bestAt = at
    }
  }
  return best
}

function askedIn(weeks: ReadonlyArray<InterviewWeek>): Map<string, string> {
  const asked = new Map<string, string>()
  const mark = (key: string, week: string): void => {
    if ((asked.get(key) ?? "") < week) asked.set(key, week)
  }
  for (const week of weeks) {
    for (const q of week.questions) {
      mark(`variant:${q.family}:${q.variant}`, week.id)
      if (q.source !== undefined) mark(`call:${q.source.id}`, week.id)
    }
    for (const card of week.cards) {
      mark(sourceKey(card.source), week.id)
      const situation = Object.entries(SITUATIONS).find(
        ([, text]) => text === card.situation
      )?.[0]
      if (situation !== undefined) mark(`situation:${situation}`, week.id)
    }
  }
  return asked
}

/** A card source's key across weeks, as `Material.key` writes it. */
function sourceKey(source: CardSource): string {
  switch (source.kind) {
    case "issue": {
      return `issue:${source.repo}#${source.number}`
    }
    case "doc": {
      return `doc:${source.path}`
    }
    case "invariant": {
      return `invariant:${source.id}`
    }
    case "opening": {
      return "opening"
    }
    default: {
      return assertNever(source)
    }
  }
}

/** The newest essay of each week `brief` holds: a correction's over the first. */
export function essaysIn(
  brief: ReadonlyArray<MailboxFile>
): Array<InterviewEssay> {
  const best = new Map<string, { r: number; essay: InterviewEssay }>()
  for (const file of brief) {
    const of = essayRevision(file.name)
    if (of === null) continue
    const parsed = parseInterviewEssay(file.body)
    if (!parsed.ok) continue
    const held = best.get(of.week)
    if (held === undefined || of.r > held.r)
      best.set(of.week, { r: of.r, essay: parsed.value })
  }
  return [...best.values()].map((b) => b.essay)
}

/**
 * What last week's essay said comes next (IW6's `next`): the essay in `brief`
 * whose `next` is `week`; null while there is none, as when last week's essay
 * still waits on a take.
 */
export function lastNext(
  brief: ReadonlyArray<MailboxFile>,
  week: string
): InterviewEssay["next"] | null {
  return essaysIn(brief).find((essay) => essay.next.week === week)?.next ?? null
}

/** The essay's opening, the week's first card: its material is what the week trains. */
function opening(
  questions: ReadonlyArray<QuestionSlot>,
  last: ReturnType<typeof lastNext>
): CardSlot {
  return {
    id: OPENING_CARD,
    source: { kind: "opening" },
    situation: OPENING_SITUATION,
    title: "The essay's opening, in your voice",
    material: [
      `Say "${MONIKER}" first, then what this week trains, in a sentence or two. No rating, no "how ready", no finish line: the practice goes on.`,
      `This week asks: ${questions.map((q) => q.asks).join(" ")}`,
      last === null
        ? "There is no earlier essay yet."
        : `Last week's essay pointed next to: ${[last.said, ...last.topics].join(" ")}`,
    ].join("\n"),
  }
}

/** A kebab slug of `text`, at most `SLUG_MAX` characters. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, "")
}

function questions(
  calls: ReadonlyArray<Call>,
  asked: Asked
): Array<QuestionSlot> {
  return FAMILY_IDS.flatMap((family): Array<QuestionSlot> => {
    const variants: Readonly<Record<string, string>> = FAMILIES[family]
    const variant =
      leastRecent(
        Object.keys(variants),
        (v) => `variant:${family}:${v}`,
        asked
      ) ?? ""
    const base = {
      family,
      variant,
      asks: variants[variant] ?? "",
      targetSeconds: TARGET_SECONDS[family],
    }
    if (family !== "decision") return [{ id: variant, ...base }]
    const call = leastRecent(calls, (c) => `call:${c.id}`, asked)
    if (call === undefined) return []
    return [{ id: `decision-${call.id.toLowerCase()}`, ...base, call }]
  })
}

type Candidate = {
  readonly material: Material
  readonly id: string
  readonly source: CardSource
}

function candidates(corpus: Corpus): Array<Array<Candidate>> {
  return [
    corpus.epics.map((e) => ({
      material: e,
      id:
        e.repo === "some-ui"
          ? `epic-${e.number}`
          : `epic-${e.repo}-${e.number}`,
      source: { kind: "issue", repo: e.repo, number: e.number } as const,
    })),
    corpus.docs.map((d) => ({
      material: d,
      id: slug(`doc-${d.path.replace(/^docs\//, "").replace(/\.md$/, "")}`),
      source: { kind: "doc", path: d.path } as const,
    })),
    corpus.invariants.map((i) => ({
      material: i,
      id: `invariant-${i.id.toLowerCase()}`,
      source: { kind: "invariant", id: i.id, path: i.path } as const,
    })),
  ]
}

/** Cards a week carries: one of each kind where it can, topped up from any kind. */
const CARDS = 3

function cards(corpus: Corpus, asked: Map<string, string>): Array<CardSlot> {
  const kinds = candidates(corpus)
  const chosen: Array<Candidate> = []
  const taken = new Set<string>()
  const take = (pool: ReadonlyArray<Candidate>): void => {
    const free = pool.filter((c) => !taken.has(c.id))
    const pick = leastRecent(free, (c) => c.material.key, asked)
    if (pick === undefined) return
    chosen.push(pick)
    taken.add(pick.id)
  }
  for (const kind of kinds) take(kind)
  while (chosen.length < CARDS && kinds.flat().some((c) => !taken.has(c.id))) {
    take(kinds.flat())
  }
  return chosen.map((c) => {
    const situation =
      leastRecent(Object.keys(SITUATIONS), (s) => `situation:${s}`, asked) ?? ""
    // A situation is spent once per week, so each card gets its own.
    asked.set(`situation:${situation}`, "￿")
    return {
      id: c.id,
      source: c.source,
      situation: SITUATIONS[situation] ?? "",
      title: c.material.title,
      material: c.material.text,
    }
  })
}

export type Prepared = {
  readonly bundle: Bundle
  /** The earlier weeks, as read. */
  readonly weeks: ReadonlyArray<InterviewWeek>
}

/** The bundle for `now`, from the mailbox's weeks and the corpus. */
export function prepare(input: {
  readonly now: Date
  /** The checkout's commit, which the corpus was read at. */
  readonly commit: string
  readonly brief: ReadonlyArray<MailboxFile>
  readonly corpus: Corpus
}): Prepared {
  const weeks: Array<InterviewWeek> = []
  const unread: Array<{ name: string; why: string }> = []
  for (const file of input.brief) {
    if (!WEEK_FILE.test(file.name)) continue
    const read = readWeek(file.body)
    if (read.ok) weeks.push(read.week)
    else unread.push({ name: file.name, why: read.problems.join("; ") })
  }
  weeks.sort((a, b) => a.id.localeCompare(b.id))
  const around = weekAround(input.now)
  let next: Next | null = null
  if (!weeks.some((w) => w.id === around.id)) {
    const asked = askedIn(weeks)
    const slots = questions(input.corpus.calls, asked)
    next = {
      id: around.id,
      commit: input.commit,
      sources: workOf(input.corpus),
      opens: around.opens,
      due: around.due,
      earlierCompanies: [...new Set(weeks.map((w) => w.company.name))],
      questions: slots,
      cards: [
        opening(slots, lastNext(input.brief, around.id)),
        ...cards(input.corpus, asked),
      ],
    }
  }
  return {
    bundle: {
      schema: BUNDLE_SCHEMA,
      now: input.now.toISOString(),
      next,
      unread,
    },
    weeks,
  }
}
