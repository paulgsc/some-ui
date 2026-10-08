/**
 * What the app hands the learner to give their own model: the lesson prompt
 * or the scene-tree prompt, with their request and the delta their recent
 * surveys record.
 *
 * The app provides the grammar - the prompt, its schema and its invariants -
 * and the learner's model does the generating (adaptive-learning canon
 * Rem. 4.8, v1.7). Nothing here calls a model or a server: it builds text the
 * learner copies, and the lesson comes back the same way (see `parse`).
 */

import { FEELING_KEYS, FEELING_WORDS } from "@topik/lib/topik/core/feeling"
import type {
  Difficulty,
  Enthusiasm,
  SurveyItem,
  SurveyReport,
  Worthwhile,
} from "@topik/lib/topik/core/lesson-survey"

import LESSON_PROMPT from "./lesson-prompt.md?raw"
import TREE_PROMPT from "./tree-prompt.md?raw"

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
  /**
   * Who the lesson is for. `learner` (the default) is one person's next
   * lesson, and a missing survey means it is their first. `batch` is the
   * operator's weekly batch (canon Cor. 8.3), served to every learner at the
   * level: no one learner's survey applies, and the prompt says so rather
   * than calling it anyone's first lesson.
   */
  audience?: "learner" | "batch"
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

/**
 * `prompt`, then this request (its level, scene and `extra` lines) and its
 * survey; ready to copy.
 */
function withRequest(
  prompt: string,
  request: Pick<LessonRequest, "level" | "scene" | "survey" | "audience">,
  extra: Array<string> = []
): string {
  const survey = request.survey?.trim()
  return [
    prompt.trimEnd(),
    "",
    "---",
    "",
    "## This request",
    "",
    `Level: ${request.level}`,
    `Scene: ${request.scene?.trim() || "(invent one)"}`,
    ...extra,
    "",
    survey
      ? `Survey (newest first):\n${survey}`
      : request.audience === "batch"
        ? "Survey: none - this lesson joins the weekly batch every learner at this level chooses from."
        : "Survey: none yet - this is their first lesson.",
    "",
  ].join("\n")
}

/** The prompt, with this request appended; ready to copy. */
export function buildLessonPrompt(request: LessonRequest): string {
  return withRequest(LESSON_PROMPT, request, [
    `Conversations: ${request.conversations ?? DEFAULT_CONVERSATIONS}`,
  ])
}

/** Where the tree prompt takes the feeling vocabulary. */
const FEELINGS_MARKER = "<!-- feelings -->"

/** The vocabulary as the tree prompt lists it: the app's keys, never a copy. */
const feelingTable = (): string =>
  [
    "| Key | Feeling | What it is |",
    "| --- | ------- | ---------- |",
    ...FEELING_KEYS.map(
      (key) =>
        `| \`${key}\` | ${FEELING_WORDS[key].name} | ${FEELING_WORDS[key].meaning} |`
    ),
  ].join("\n")

/**
 * The scene-tree prompt (docs/makjang/README.md, "4. Authoring"), with the
 * feeling vocabulary filled in and this request appended. A tree is one
 * scene, so the request has no conversation count.
 */
export function buildTreePrompt(
  request: Omit<LessonRequest, "conversations">
): string {
  return withRequest(
    TREE_PROMPT.replace(FEELINGS_MARKER, feelingTable()),
    request
  )
}
