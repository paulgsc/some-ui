/**
 * What the app hands the learner to give their own model: the lesson prompt,
 * with their request and the delta their recent surveys record.
 *
 * The app provides the grammar - the prompt, its schema and its invariants -
 * and the learner's model does the generating (adaptive-learning canon
 * Rem. 4.8, v1.7). Nothing here calls a model or a server: it builds text the
 * learner copies, and the lesson comes back the same way (see `parse`).
 */

import type {
  Difficulty,
  Enthusiasm,
  SurveyItem,
  SurveyReport,
  Worthwhile,
} from "@topik/lib/topik/core/lesson-survey"

import LESSON_PROMPT from "./lesson-prompt.md?raw"

export { LESSON_PROMPT }

export const TOPIK_LEVELS = [1, 2, 3, 4, 5, 6] as const
export type TopikLevel = (typeof TOPIK_LEVELS)[number]

export type LessonRequest = {
  level: TopikLevel
  /** A premise for the scene; the model invents one when absent. */
  scene?: string
  /** Beats in the scene. */
  conversations?: number
  /** `surveyDigest` of recent reports; omitted when there are none. */
  survey?: string
}

export const DEFAULT_CONVERSATIONS = 3

/** How many recent lessons a digest describes: the delta, not the path. */
export const DIGEST_LESSONS = 5

const WORTHWHILE_TEXT: Record<Worthwhile, string> = {
  yes: "worthwhile",
  somewhat: "somewhat worthwhile",
  no: "not worthwhile",
}

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  "too-easy": "too easy",
  right: "about right",
  "too-hard": "too hard",
}

const ENTHUSIASM_TEXT: Record<Enthusiasm, string> = {
  keen: "keen for the next one",
  neutral: "either way about the next one",
  drained: "running out of steam",
}

const describe = (item: SurveyItem): string => {
  const source = item.source ? `${item.source}` : item.probeId
  return item.prompt ? `${source} ("${item.prompt}")` : source
}

/**
 * The learner's recent verdicts, as plain text for the prompt. Newest first,
 * the last `limit` lessons only: the next lesson needs the delta, not the
 * learner's whole path. Empty when there is nothing to say.
 */
export function surveyDigest(
  reports: Array<SurveyReport>,
  limit: number = DIGEST_LESSONS
): string {
  return reports
    .slice(0, limit)
    .map((report, index) => {
      const verdict = [
        report.worthwhile && WORTHWHILE_TEXT[report.worthwhile],
        report.difficulty && `felt ${DIFFICULTY_TEXT[report.difficulty]}`,
        report.enthusiasm && ENTHUSIASM_TEXT[report.enthusiasm],
      ].filter(Boolean)
      const lines = [
        `${index + 1}. ${report.displayName ?? report.topikKey}${
          verdict.length > 0 ? `: ${verdict.join("; ")}.` : ""
        }`,
        ...report.stuck.map((item) => `   Blocking: ${describe(item)}`),
        ...(report.flagged ?? []).map(
          (item) => `   Flagged as keyed wrong: ${describe(item)}`
        ),
        ...(report.becoming
          ? [`   Making them into: "${report.becoming}"`]
          : []),
      ]
      return lines.join("\n")
    })
    .join("\n")
}

/** The prompt, with this request appended; ready to copy. */
export function buildLessonPrompt(request: LessonRequest): string {
  const lines = [
    `Level: ${request.level}`,
    `Scene: ${request.scene?.trim() || "(invent one)"}`,
    `Conversations: ${request.conversations ?? DEFAULT_CONVERSATIONS}`,
  ]
  const survey = request.survey?.trim()
  return [
    LESSON_PROMPT.trimEnd(),
    "",
    "---",
    "",
    "## This request",
    "",
    ...lines,
    "",
    survey
      ? `Survey (newest first):\n${survey}`
      : "Survey: none yet - this is their first lesson.",
    "",
  ].join("\n")
}
