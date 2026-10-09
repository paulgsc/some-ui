/**
 * Taking a conversation lesson back from a model: the operator's lesson CRM
 * pastes whatever the model replied - fenced JSON blocks, bare JSON, prose
 * around it. This finds the lesson in it and holds it to the schema. Nothing
 * is sent anywhere.
 *
 * Counts in the manifest entry are recomputed from the conversations rather
 * than trusted: a model that miscounts should not be able to mislabel a
 * lesson.
 */

import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import { TopikFileSchema } from "@topik/lib/topik"
import { topikLevelOf } from "@topik/lib/topik/core/lesson-selection"

export type Intake =
  | {
      ok: true
      meta: TopikMetadata
      batches: Array<ConversationBatch>
    }
  | { ok: false; error: string }

const FENCE = "```"
const LANGUAGE = "json"

/** Spaces, tabs and a CR are allowed between a fence's opening and its newline. */
const isInlineSpace = (char: string | undefined): boolean =>
  char === " " || char === "\t" || char === "\r"

/**
 * The body of every ``` or ```json fence in `text`, in order.
 *
 * A scan, not a regular expression: this reads whatever was pasted, and a
 * `\s*\n` pattern backtracks polynomially on many whitespace-and-newline
 * pairs (CodeQL, #1564). Each fence is visited once: linear in `text`.
 */
export function fencedBodies(text: string): Array<string> {
  const bodies: Array<string> = []
  let from = 0
  for (;;) {
    const open = text.indexOf(FENCE, from)
    if (open === -1) return bodies
    let at = open + FENCE.length
    if (text.startsWith(LANGUAGE, at)) at += LANGUAGE.length
    while (isInlineSpace(text[at])) at += 1
    if (text[at] !== "\n") {
      // Not an opening fence (```ts, or text after the backticks): look again
      // from the next character, as the pattern did.
      from = open + 1
      continue
    }
    const close = text.indexOf(FENCE, at + 1)
    if (close === -1) return bodies
    bodies.push(text.slice(at + 1, close))
    from = close + FENCE.length
  }
}

/** Every JSON value in a pasted reply: its fenced blocks, or the whole text. */
export function jsonValues(text: string): Array<unknown> {
  const fenced = fencedBodies(text)
  const candidates = fenced.length > 0 ? fenced : [text]
  return candidates.flatMap((candidate) => {
    try {
      const value: unknown = JSON.parse(candidate)
      return [value]
    } catch {
      return []
    }
  })
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined

const slug = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "lesson"

export const DIFFICULTY_BY_LEVEL: Record<number, TopikMetadata["difficulty"]> =
  {
    1: "beginner",
    2: "beginner",
    3: "intermediate",
    4: "intermediate",
    5: "advanced",
    6: "advanced",
  }

/**
 * Reads a pasted reply. Never throws.
 *
 * `entry`, when given, stands in for any manifest entry in the reply. The
 * operator's lesson CRM keeps the entry in a form, and a lesson file it reads
 * back from the server carries none; its authored tags (`topik-3`) must
 * survive an edit all the same. Counts are derived either way.
 */
export function intakeLesson(
  reply: string,
  entry?: Record<string, unknown>
): Intake {
  const values = jsonValues(reply)
  const raw = values.find(Array.isArray)
  if (raw === undefined) {
    return {
      ok: false,
      error:
        "No lesson found. The reply should contain the lesson as a JSON array of conversations.",
    }
  }
  const parsed = TopikFileSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: `The lesson doesn't match the schema${
        issue ? `: ${issue.path.join(".")} ${issue.message}` : ""
      }.`,
    }
  }
  if (parsed.data.length === 0) {
    return { ok: false, error: "The lesson has no conversations." }
  }
  const batches = parsed.data
  const repeated = repeatedId(batches)
  if (repeated !== undefined) {
    return { ok: false, error: `The lesson can't be played: ${repeated}.` }
  }

  const given = entry ?? values.find(isRecord) ?? {}
  const displayName = text(given.displayName) ?? "Untitled lesson"
  const tags = Array.isArray(given.tags)
    ? given.tags.filter((tag): tag is string => typeof tag === "string")
    : []
  const level = topikLevelOf(tags)
  const difficulty =
    (level ? DIFFICULTY_BY_LEVEL[level] : undefined) ??
    (given.difficulty === "beginner" ||
    given.difficulty === "intermediate" ||
    given.difficulty === "advanced"
      ? given.difficulty
      : undefined)

  const meta: TopikMetadata = {
    key: slug(text(given.key) ?? displayName),
    displayName,
    description: text(given.description) ?? "",
    batchCount: batches.length,
    totalQuestions: batches.reduce(
      (sum, batch) => sum + batch.questions.length,
      0
    ),
    totalMessages: batches.reduce(
      (sum, batch) => sum + batch.messages.length,
      0
    ),
    ...(difficulty ? { difficulty } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  }

  return { ok: true, meta, batches }
}

/**
 * The first conversation or line id used twice, said as the operator reads
 * it. They are identities, not labels: the desktop session keys its
 * conversations and the lines it speaks by them.
 */
function repeatedId(batches: Array<ConversationBatch>): string | undefined {
  const conversations = new Set<number>()
  for (const batch of batches) {
    if (conversations.has(batch.id)) {
      return `conversation id ${batch.id} is used by more than one conversation`
    }
    conversations.add(batch.id)
    const lines = new Set<string>()
    for (const message of batch.messages) {
      if (lines.has(message.id)) {
        return `conversation ${batch.id}: line id "${message.id}" is used by more than one line`
      }
      lines.add(message.id)
    }
  }
  return undefined
}
