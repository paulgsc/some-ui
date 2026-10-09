/**
 * What a lesson's manifest entry says about it: its TOPIK level and the
 * relations its probes exercise (`relation:` tags, derived, never authored),
 * and the level the learner holds.
 *
 * `relation:` tags are derived for the batch the lesson CRM serves
 * (adaptive-learning canon Rem. 3.5).
 *
 * Everything here is pure and total.
 */

import type { ConversationBatch, Probe } from "@topik/lib/topik"
import { GLOSS_RELATION } from "@topik/lib/topik"
import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"

/** A lesson's level tag: `topik-1` … `topik-6`. */
const LEVEL_TAG = /^topik-([1-6])$/

/** A relation a lesson's probes exercise: `relation:negation`. */
export const RELATION_TAG_PREFIX = "relation:"

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

/**
 * The level the learner holds until they choose another: the level of the
 * lesson they last reported on, else 1. The report itself never moves it
 * (canon Rem. 3.3); it only remembers where the learner was.
 */
export function heldLevel(reports: Array<SurveyReport>): number {
  return reports.find((report) => report.level !== undefined)?.level ?? 1
}
