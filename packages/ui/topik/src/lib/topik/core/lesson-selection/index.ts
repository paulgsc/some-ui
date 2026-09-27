/**
 * Which served lesson comes next (adaptive-learning canon Rem. 3.5).
 *
 * The learner's recent survey reports order a small served batch on the
 * device. There is no model and no server, and nothing leaves the phone. The
 * reports never set the level: the order is taken within the level the
 * learner holds (Rem. 3.3). The reports act through three things a lesson's
 * manifest entry carries:
 *
 * - its `relation:` tags: a lesson that exercises a relation the learner
 *   named blocking comes first, so what blocked them returns;
 * - its size, in lines (`totalMessages`): "too hard" or "running out of
 *   steam" puts smaller lessons first, and "too easy" puts larger ones first.
 *   Lines are what the handheld plays; `totalQuestions` counts the desktop
 *   quiz, which the handheld never shows, so it says nothing about how long
 *   a lesson is here (Codex, #1555);
 * - its key: a lesson just reported on comes later, unless it brings back
 *   what blocked the learner. It is never dropped, because going through a
 *   lesson again is expected.
 *
 * Everything here is pure and total. A lesson with no tags, or reports with
 * nothing to say, leaves the served order as it was.
 */

import type { ConversationBatch, Probe, TopikMetadata } from "@topik/lib/topik"
import { GLOSS_RELATION } from "@topik/lib/topik"
import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"

/** A lesson's level tag: `topik-1` … `topik-6`. */
const LEVEL_TAG = /^topik-([1-6])$/

/** A relation a lesson's probes exercise: `relation:negation`. */
export const RELATION_TAG_PREFIX = "relation:"

/** Only the most recent reports steer the order: the delta, not the path. */
export const STEERING_REPORTS = 3

/** The TOPIK level a lesson's tags carry, if any. */
export function topikLevelOf(tags: Array<string> = []): number | undefined {
  for (const tag of tags) {
    const match = LEVEL_TAG.exec(tag)
    if (match) return Number(match[1])
  }
  return undefined
}

/** One spelling per relation, so "Negation " and "negation" are one tag. */
export function normalizeRelation(relation: string): string {
  return relation.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * The relations a probe exercises. A choice probe exercises every relation
 * its options stand in; a learner who was blocked by it cannot say which one
 * did it. The gloss is never among them: it is reserved and never probed as
 * an answer (canon Rem. 4.8).
 */
export function probeRelations(probe: Probe): Array<string> {
  const relations =
    probe.kind === "build"
      ? [probe.relation]
      : probe.options.map((option) => option.relation)
  return [
    ...new Set(
      relations
        .map(normalizeRelation)
        .filter((relation) => relation !== GLOSS_RELATION)
    ),
  ]
}

/**
 * A lesson's `relation:` tags, derived from its probes. Derived rather than
 * authored, so a model that mislabels its lesson cannot misdirect selection.
 */
export function relationTags(batches: Array<ConversationBatch>): Array<string> {
  const relations = new Set(
    batches.flatMap((batch) => (batch.probes ?? []).flatMap(probeRelations))
  )
  return [...relations].sort().map((relation) => RELATION_TAG_PREFIX + relation)
}

function relationsOf(item: TopikMetadata): Set<string> {
  return new Set(
    (item.tags ?? [])
      .filter((tag) => tag.startsWith(RELATION_TAG_PREFIX))
      .map((tag) => normalizeRelation(tag.slice(RELATION_TAG_PREFIX.length)))
  )
}

/** Why a lesson is where it is, for the line the learner reads. */
export type SelectionReason =
  | { kind: "brings-back"; relations: Array<string> }
  | { kind: "smaller"; because: "too-hard" | "drained" }
  | { kind: "larger" }

export type Selection = {
  item: TopikMetadata
  reasons: Array<SelectionReason>
  /** Reported on recently: ordered after the rest. */
  recent: boolean
}

type Size = "smaller" | "larger" | null

function sizePreference(reports: Array<SurveyReport>): {
  size: Size
  because?: "too-hard" | "drained"
} {
  const latest = reports.find(
    (report) =>
      report.difficulty !== undefined || report.enthusiasm !== undefined
  )
  // Running out of steam outranks "too easy": a learner who wants to stop
  // is not helped by a longer lesson, whatever it would have taught.
  if (latest?.enthusiasm === "drained") {
    return { size: "smaller", because: "drained" }
  }
  if (latest?.difficulty === "too-hard") {
    return { size: "smaller", because: "too-hard" }
  }
  if (latest?.difficulty === "too-easy") return { size: "larger" }
  return { size: null }
}

/** How long a lesson is on the handheld: the lines it plays. */
const sizeOf = (item: TopikMetadata): number => item.totalMessages

/**
 * The lessons at `level`, in the order the learner should meet them. Lessons
 * with no level tag follow, in served order: they suit any level. Lessons at
 * other levels are not returned; the caller lists them separately.
 *
 * `reports` is newest first, as the survey store lists them.
 */
export function orderLessons(
  items: Array<TopikMetadata>,
  reports: Array<SurveyReport>,
  level: number
): Array<Selection> {
  const steering = reports.slice(0, STEERING_REPORTS)
  const blocked = new Set(
    steering.flatMap((report) =>
      report.stuck.flatMap((item) =>
        (item.relations ?? []).map(normalizeRelation)
      )
    )
  )
  const recentKeys = new Set(steering.map((report) => report.topikKey))
  const { size, because } = sizePreference(steering)

  const candidates = items
    .map((item, served) => ({ item, served, level: topikLevelOf(item.tags) }))
    .filter((entry) => entry.level === level || entry.level === undefined)

  const scored = candidates.map((entry) => {
    const brought = [...relationsOf(entry.item)].filter((relation) =>
      blocked.has(relation)
    )
    return {
      ...entry,
      brought,
      recent: recentKeys.has(entry.item.key),
      unleveled: entry.level === undefined,
    }
  })

  scored.sort(
    (a, b) =>
      Number(a.unleveled) - Number(b.unleveled) ||
      // What blocked the learner outranks having just played it: when the
      // only lesson that exercises it is the one just reported on, it is
      // exactly the lesson to go back to (Codex, #1555).
      b.brought.length - a.brought.length ||
      Number(a.recent) - Number(b.recent) ||
      (size === "smaller"
        ? sizeOf(a.item) - sizeOf(b.item)
        : size === "larger"
          ? sizeOf(b.item) - sizeOf(a.item)
          : 0) ||
      a.served - b.served
  )

  return scored.map((entry) => ({
    item: entry.item,
    recent: entry.recent,
    reasons: [
      ...(entry.brought.length > 0
        ? [{ kind: "brings-back" as const, relations: entry.brought.sort() }]
        : []),
      ...(size === "smaller" && because
        ? [{ kind: "smaller" as const, because }]
        : size === "larger"
          ? [{ kind: "larger" as const }]
          : []),
    ],
  }))
}

/**
 * The level the learner holds, for choosing within it: the level of the
 * lesson they last reported on, else of the lesson they last left, else 1.
 * The survey itself never moves it (canon Rem. 3.3): the learner does, by
 * choosing another level.
 */
export function heldLevel(
  reports: Array<SurveyReport>,
  lastPlayed?: TopikMetadata
): number {
  return (
    reports.find((report) => report.level !== undefined)?.level ??
    topikLevelOf(lastPlayed?.tags) ??
    1
  )
}
