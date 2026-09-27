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
 * lesson. So are its `relation:` tags, which selection reads (canon
 * Rem. 3.5): they come from the probes, whatever the model wrote. The
 * operator's weekly batch goes through this same intake, so served entries
 * carry derived tags too.
 */

import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import { TopikFileSchema } from "@topik/lib/topik"
import {
  RELATION_TAG_PREFIX,
  relationTags,
  topikLevelOf,
} from "@topik/lib/topik/core/lesson-selection"
import type { ProbeFinding } from "@topik/lib/topik/core/probe-audit"
import { auditTopikFile } from "@topik/lib/topik/core/probe-audit"

export { topikLevelOf }

/** Keys of lessons pasted this session; never confused with a served one. */
export const LOCAL_LESSON_PREFIX = "local:"

export type Intake =
  | {
      ok: true
      meta: TopikMetadata
      /** The lesson as it will play: every probe an error names is withheld. */
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
  if (parsed.data.length === 0) {
    return { ok: false, error: "The lesson has no conversations." }
  }
  // The audit reads the raw value: the schema already dropped malformed
  // probes from `parsed.data`, and the point is to say which.
  const findings = auditTopikFile(raw).filter(
    (finding) => finding.batch !== null
  )
  // What plays. Everything below - tags included - describes this, so a
  // withheld probe's relation is never advertised to selection.
  const batches = withholdErrors(parsed.data, findings)

  const entry = values.find(isRecord) ?? {}
  const displayName = text(entry.displayName) ?? "Untitled lesson"
  const authored = Array.isArray(entry.tags)
    ? entry.tags.filter(
        (tag): tag is string =>
          typeof tag === "string" && !tag.startsWith(RELATION_TAG_PREFIX)
      )
    : []
  const tags = [...authored, ...relationTags(batches)]
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
    ...(tags.length > 0 ? { tags } : {}),
  }

  return { ok: true, meta, batches, findings }
}

/**
 * The lesson minus every probe an error names. The schema lets through
 * probes that are well-formed but wrong - a keyed gloss, a blank reason, a
 * build that asks for its own source - and the audit only reports them, so
 * without this a pasted lesson would ask exactly what it was told it would
 * not. Warnings are authoring judgement and stay.
 */
export function withholdErrors(
  batches: Array<ConversationBatch>,
  findings: Array<ProbeFinding>
): Array<ConversationBatch> {
  const withheld = new Set(
    findings.flatMap((finding) =>
      finding.severity === "error" &&
      finding.batch !== null &&
      finding.probe !== null
        ? [`${finding.batch}:${finding.probe}`]
        : []
    )
  )
  if (withheld.size === 0) return batches
  return batches.map((batch) =>
    batch.probes
      ? {
          ...batch,
          probes: batch.probes.filter(
            (probe) => !withheld.has(`${batch.id}:${probe.id}`)
          ),
        }
      : batch
  )
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
