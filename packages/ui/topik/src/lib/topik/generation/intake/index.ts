/**
 * Taking a lesson back from the learner's model.
 *
 * The learner pastes whatever their model replied - fenced JSON blocks, bare
 * JSON, prose around it. This finds the lesson in it, holds it to the schema,
 * and runs the same audit `check:topik-probes` runs (`core/probe-audit`), in
 * the browser: the app that gave the model its grammar is the thing that
 * checks the answer (adaptive-learning canon v1.7). Nothing is sent anywhere.
 *
 * Counts in the manifest entry are recomputed from the conversations rather
 * than trusted: a model that miscounts should not be able to mislabel a
 * lesson.
 */

import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import { TopikFileSchema } from "@topik/lib/topik"
import type { ProbeFinding } from "@topik/lib/topik/core/probe-audit"
import { auditTopikFile } from "@topik/lib/topik/core/probe-audit"

/** Keys of lessons kept on this device; never confused with a served one. */
export const LOCAL_LESSON_PREFIX = "local:"

export type Intake =
  | {
      ok: true
      meta: TopikMetadata
      batches: Array<ConversationBatch>
      /** Probe-level findings: the lesson plays, minus what they name. */
      findings: Array<ProbeFinding>
    }
  | { ok: false; error: string }

const FENCE = /```(?:json)?\s*\n([\s\S]*?)```/g

function jsonValues(text: string): Array<unknown> {
  const fenced = [...text.matchAll(FENCE)].map((match) => match[1] ?? "")
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
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

const DIFFICULTY_BY_LEVEL: Record<number, TopikMetadata["difficulty"]> = {
  1: "beginner",
  2: "beginner",
  3: "intermediate",
  4: "intermediate",
  5: "advanced",
  6: "advanced",
}

/** The TOPIK level a lesson's tags carry (`topik-2`), if any. */
export function topikLevelOf(tags: Array<string> = []): number | undefined {
  for (const tag of tags) {
    const match = /^topik-([1-6])$/.exec(tag)
    if (match) return Number(match[1])
  }
  return undefined
}

/** Reads a pasted reply. Never throws. */
export function intakeLesson(reply: string): Intake {
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
  const batches = parsed.data
  if (batches.length === 0) {
    return { ok: false, error: "The lesson has no conversations." }
  }

  const entry = values.find(isRecord) ?? {}
  const displayName = text(entry.displayName) ?? "Untitled lesson"
  const tags = Array.isArray(entry.tags)
    ? entry.tags.filter((tag): tag is string => typeof tag === "string")
    : undefined
  const level = topikLevelOf(tags)
  const difficulty =
    (level ? DIFFICULTY_BY_LEVEL[level] : undefined) ??
    (entry.difficulty === "beginner" ||
    entry.difficulty === "intermediate" ||
    entry.difficulty === "advanced"
      ? entry.difficulty
      : undefined)

  const meta: TopikMetadata = {
    key: `${LOCAL_LESSON_PREFIX}${slug(text(entry.key) ?? displayName)}`,
    displayName,
    description: text(entry.description) ?? "",
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
    ...(tags && tags.length > 0 ? { tags } : {}),
  }

  return {
    ok: true,
    meta,
    batches,
    // The audit reads the raw value: the schema already dropped malformed
    // probes from `batches`, and the point is to say which.
    findings: auditTopikFile(raw).filter((finding) => finding.batch !== null),
  }
}

/**
 * The findings, as a message the learner sends back to their model: the loop
 * that fixes a lesson runs between the learner and their model, not through
 * us.
 */
export function fixRequest(findings: Array<ProbeFinding>): string {
  const lines = findings.map(
    (finding) =>
      `- ${finding.severity}: conversation ${finding.batch ?? "?"}${
        finding.probe ? `, probe ${finding.probe}` : ""
      }: ${finding.message}`
  )
  return [
    "The app checked the lesson you wrote and found these problems. Fix them and return the whole lesson again, in the same two JSON blocks:",
    "",
    ...lines,
    "",
  ].join("\n")
}
