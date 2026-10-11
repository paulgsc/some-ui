/**
 * What the app hands the learner to give their own model: the lesson prompt
 * or the scene-tree prompt, with their request and, for a tree, the last
 * drama they played to an ending (`core/last-drama`).
 *
 * The app provides the grammar - the prompt, its schema and its invariants -
 * and the learner's model does the generating (adaptive-learning canon
 * Rem. 4.8, v1.7). Nothing here calls a model or a server: it builds text the
 * learner copies, and the lesson comes back the same way (see `parse`).
 */

import { FEELING_KEYS } from "@some-ui/styles/theme"
import { FIGURE_KEYS, FIGURE_WORDS } from "@topik/lib/topik/core/cast"
import { FEELING_WORDS } from "@topik/lib/topik/core/feeling"
import type {
  Enjoyed,
  KoreanNext,
  LastDrama,
} from "@topik/lib/topik/core/last-drama"

import LESSON_PROMPT from "./lesson-prompt.md?raw"
import TREE_PROMPT from "./tree-prompt.md?raw"

export { LESSON_PROMPT }

export const TOPIK_LEVELS = [1, 2, 3, 4, 5, 6] as const
export type TopikLevel = (typeof TOPIK_LEVELS)[number]

/** Which prompt: a conversation lesson, or a scene tree (the drama). */
export type LessonFormat = "conversations" | "tree"

/** The operator's weekly batch of conversation lessons (canon Cor. 8.3). */
export type LessonRequest = {
  level: TopikLevel
  /** A premise for the scene; the model invents one when absent. */
  scene?: string
  /** Beats in the scene. */
  conversations?: number
}

export type TreeRequest = Omit<LessonRequest, "conversations"> & {
  /** Genres for the drama (`core/feed-card`); the default is the prompt's. */
  genres?: Array<string>
  /** `lastDramaText` of the last session; omitted when there is none. */
  lastDrama?: string
  /**
   * Who the drama is for. `learner` (the default) is one person's next
   * drama, and a missing last drama means it is their first. `batch` is the
   * operator's batch (canon Cor. 8.3), served to every learner at the level:
   * no one learner's last drama applies, and the prompt says so rather than
   * calling it anyone's first.
   */
  audience?: "learner" | "batch"
}

/** What the learner asks for: a tree request without its history. */
export type DramaRequest = Pick<TreeRequest, "level" | "scene" | "genres">

export const DEFAULT_CONVERSATIONS = 3

const ENJOYED_TEXT: Record<Enjoyed, string> = {
  loved: "loved it",
  fine: "it was OK",
  "not-for-me": "not for them",
}

const KOREAN_TEXT: Record<KoreanNext, string> = {
  easier: "easier to follow",
  right: "about the same",
  stretch: "more of a stretch",
}

/**
 * The last session, as plain text for the tree prompt: what the learner
 * reached and first chose, then what they said.
 */
export function lastDramaText(record: LastDrama): string {
  const place = (id: string): string => {
    const scene = record.scenes.find((reached) => reached.id === id)
    return scene ? `${scene.place} (${scene.feeling})` : id
  }
  const { review } = record
  const next = review?.next?.trim()
  const said = review
    ? [
        review.enjoyed && ENJOYED_TEXT[review.enjoyed],
        review.korean && `the Korean next time: ${KOREAN_TEXT[review.korean]}`,
        review.more && `more of: ${review.more.map(place).join(", ")}`,
        next && `what next: "${next}"`,
      ].filter(Boolean)
    : []
  return [
    `"${record.title}", level ${record.level}.`,
    `Scenes reached: ${record.scenes.map(({ id }) => place(id)).join(", ")}.`,
    ...(record.tries.length > 0
      ? [
          "First tries:",
          ...record.tries.map(
            (first) =>
              `- ${first.prompt} -> "${first.chosen}": ${
                first.answered ? "answered it" : "missed it"
              }.`
          ),
        ]
      : []),
    said.length > 0
      ? `Review: ${said.join("; ")}.`
      : "Review: none - they skipped it.",
  ].join("\n")
}

/** `prompt`, then this request (its level, scene and `extra` lines). */
function withRequest(
  prompt: string,
  request: { level: TopikLevel; scene?: string },
  extra: Array<string>
): string {
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

/** Where the tree prompt takes the figure vocabulary. */
const FIGURES_MARKER = "<!-- figures -->"

/** The cast figures as the tree prompt lists them, from the app's keys. */
const figureTable = (): string =>
  [
    "| Key | Drawn as | Suits |",
    "| --- | -------- | ----- |",
    ...FIGURE_KEYS.map(
      (key) =>
        `| \`${key}\` | ${FIGURE_WORDS[key].name} | ${FIGURE_WORDS[key].suits} |`
    ),
  ].join("\n")

/**
 * The scene-tree prompt (docs/makjang/README.md, "4. Authoring"), with the
 * figure and feeling vocabularies filled in and this request appended. A tree
 * is one scene, so the request has no conversation count.
 */
export function buildTreePrompt(request: TreeRequest): string {
  const last = request.lastDrama?.trim()
  const genres = request.genres ?? []
  return withRequest(
    TREE_PROMPT.replace(FIGURES_MARKER, figureTable()).replace(
      FEELINGS_MARKER,
      feelingTable()
    ),
    request,
    [
      `Genre: ${genres.length > 0 ? genres.join(", ") : "(none picked)"}`,
      "",
      last
        ? `Last drama:\n${last}`
        : request.audience === "batch"
          ? "Last drama: none - this drama joins the batch every learner at this level chooses from."
          : "Last drama: none yet - this is their first.",
    ]
  )
}

/**
 * The next scene's prompt as a file for the learner's drive, under a note
 * telling an agent what to write and its name (docs/makjang/README.md, "The
 * file contract"). The stamp is the moment in UTC to the millisecond, so
 * neither a clock change nor two quick shares make two exports share a name.
 */
export function nextSceneFile(
  prompt: string,
  at: Date
): { name: string; text: string } {
  const stamp = `drama-${at.toISOString().replace(/[-:.]/g, "")}`
  return {
    name: `${stamp}.prompt.md`,
    text: [
      `> **For an agent:** follow the prompt below. Write the drama it asks for as one JSON file next to this one, named \`${stamp}.json\`, holding the bare JSON, not the fenced block **Output** asks for. Write nothing else, and do not change this file.`,
      "",
      prompt,
    ].join("\n"),
  }
}
