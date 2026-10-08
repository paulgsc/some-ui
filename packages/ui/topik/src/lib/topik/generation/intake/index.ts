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

/**
 * Reads a pasted reply. Never throws.
 *
 * `entry`, when given, stands in for any manifest entry in the reply. The
 * operator's lesson CRM keeps the entry in a form, and a lesson file it reads
 * back from the server carries none; its authored tags (`topik-3`) must
 * survive an edit all the same. Counts and `relation:` tags are derived
 * either way.
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
  // The audit reads the raw value: the schema already dropped malformed
  // probes from `parsed.data`, and the point is to say which.
  const audit = auditTopikFile(raw)
  // An error about no one probe is about the lesson's structure - a
  // conversation or line id used twice - and no probe can be withheld to
  // mend it: the lesson is sent back instead.
  const structural = audit.find(
    (finding) => finding.severity === "error" && finding.probe === null
  )
  if (structural) {
    return {
      ok: false,
      error: `The lesson can't be played: ${structural.batch === null ? "" : `conversation ${structural.batch}: `}${structural.message}.`,
    }
  }
  const findings = audit.filter((finding) => finding.batch !== null)
  // What plays. Everything below - tags included - describes this, so a
  // withheld probe's relation is never advertised to selection.
  const batches = withholdErrors(parsed.data, findings)

  const given = entry ?? values.find(isRecord) ?? {}
  const displayName = text(given.displayName) ?? "Untitled lesson"
  const authored = Array.isArray(given.tags)
    ? given.tags.filter(
        (tag): tag is string =>
          typeof tag === "string" && !tag.startsWith(RELATION_TAG_PREFIX)
      )
    : []
  const tags = [...authored, ...relationTags(batches)]
  const level = topikLevelOf(tags)
  const difficulty =
    (level ? DIFFICULTY_BY_LEVEL[level] : undefined) ??
    (given.difficulty === "beginner" ||
    given.difficulty === "intermediate" ||
    given.difficulty === "advanced"
      ? given.difficulty
      : undefined)

  const meta: TopikMetadata = {
    key: `${LOCAL_LESSON_PREFIX}${slug(text(given.key) ?? displayName)}`,
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

  return { ok: true, meta, batches, findings }
}

/**
 * The lesson minus every probe an error names. The schema lets through
 * probes that are well-formed but wrong - a keyed gloss, a blank reason, a
 * build that asks for its own source - and the audit only reports them, so
 * without this a pasted lesson would ask exactly what it was told it would
 * not. Warnings are authoring judgement and stay.
 */
function withholdErrors(
  batches: Array<ConversationBatch>,
  findings: Array<ProbeFinding>
): Array<ConversationBatch> {
  // By position among the probes that loaded, not by id: when two probes
  // share an id only the later is in error, and the first still plays.
  // A probe that did not load has no position, and is gone.
  const withheld = new Set(
    findings.flatMap((finding) =>
      finding.severity === "error" &&
      finding.batch !== null &&
      finding.index !== undefined
        ? [`${finding.batch}:${finding.index}`]
        : []
    )
  )
  if (withheld.size === 0) return batches
  return batches.map((batch) =>
    batch.probes
      ? {
          ...batch,
          probes: batch.probes.filter(
            (_probe, index) => !withheld.has(`${batch.id}:${index}`)
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
