/**
 * What a lesson's manifest entry says about its level, and the level the
 * learner holds. Pure and total.
 */

import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"

/** A lesson's level tag: `topik-1` … `topik-6`. */
const LEVEL_TAG = /^topik-([1-6])$/

/** The TOPIK level a lesson's tags carry, if any. */
export function topikLevelOf(tags: Array<string> = []): number | undefined {
  for (const tag of tags) {
    const match = LEVEL_TAG.exec(tag)
    if (match) return Number(match[1])
  }
  return undefined
}

/**
 * The level the learner holds until they choose another: the level of the
 * lesson they last reported on, else 1. The report itself never moves it
 * (canon Rem. 3.3); it only remembers where the learner was.
 */
export function heldLevel(reports: Array<SurveyReport>): number {
  return reports.find((report) => report.level !== undefined)?.level ?? 1
}
