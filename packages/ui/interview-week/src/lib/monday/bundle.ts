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
  readWeek,
  SLUG_MAX,
  TARGET_SECONDS,
} from "@interview-week/lib/week"
import { assertNever, weekAround } from "@some-ui/core-utils"

const BUNDLE_SCHEMA = "some-ui.interview-monday-bundle/1"

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

type Next = {
  readonly id: string
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
    default: {
      return assertNever(source)
    }
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
    next = {
      id: around.id,
      opens: around.opens,
      due: around.due,
      earlierCompanies: [...new Set(weeks.map((w) => w.company.name))],
      questions: questions(input.corpus.calls, asked),
      cards: cards(input.corpus, asked),
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
