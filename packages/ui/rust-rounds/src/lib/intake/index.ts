/**
 * Taking a tutor's reply, pasted from a chat or read from a file home holds:
 * its ``` and ```json blocks, with any prose around them ignored, or, when it
 * has no fence, the whole reply as JSON. It finds the one round and the one
 * set of tutor notes in them and holds both to their schemas. Nothing is
 * sent anywhere.
 *
 * A malformed reply is refused, with a fix request to send back to the
 * tutor: every problem, one per line. A round that parses is taken, with
 * the content lint's findings beside it (`lib/lint`), which never refuse.
 */
import type { Round, RoundLog, TutorNotes } from "@rust-rounds/lib/formats"
import {
  LOG_SCHEMA,
  NOTES_SCHEMA,
  ROUND_SCHEMA,
  RoundSchema,
  TutorNotesSchema,
} from "@rust-rounds/lib/formats"
import type { Finding } from "@rust-rounds/lib/lint"
import { lintRound } from "@rust-rounds/lib/lint"
import { isRecord, jsonValues } from "@some-ui/core-utils"
import type { z } from "zod"

export type ReplyIntake =
  | {
      ok: true
      round: Round
      /** Null when the reply carried none; the round still plays. */
      notes: TutorNotes | null
      findings: Array<Finding>
    }
  | {
      ok: false
      /** One line per problem, for the tutor. */
      violations: Array<string>
      /** The text to send back to the tutor. */
      fixRequest: string
    }

/** Keys a tutor might add to grade an answer. The app grades nothing. */
const GRADING_KEYS = new Set([
  "correct",
  "isCorrect",
  "answer",
  "right",
  "rubric",
  "score",
  "points",
  "level",
])

type Issue = z.core.$ZodIssue

function child(value: unknown, key: PropertyKey): unknown {
  if (Array.isArray(value) && typeof key === "number") {
    const items: Array<unknown> = value
    return items[key]
  }
  return isRecord(value) && typeof key === "string" ? value[key] : undefined
}

/** `cards[1] ("b").choices[0].say`: the path, with each card's id. */
function pathOf(path: ReadonlyArray<PropertyKey>, value: unknown): string {
  let text = ""
  let at = value
  for (const key of path) {
    at = child(at, key)
    if (typeof key !== "number") {
      text += `${text === "" ? "" : "."}${String(key)}`
      continue
    }
    const id = isRecord(at) && typeof at.id === "string" ? ` ("${at.id}")` : ""
    text += `[${key}]${id}`
  }
  return text
}

function describeIssue(issue: Issue, value: unknown, label: string): string {
  const where = pathOf(issue.path, value)
  const at = where === "" ? label : `${label} ${where}`
  if (issue.code === "unrecognized_keys") {
    return issue.keys
      .map((key) =>
        GRADING_KEYS.has(key)
          ? `${at}: remove \`${key}\`. Rust Rounds never grades: no choice is right or wrong, and no card carries a rubric or a score.`
          : `${at}: \`${key}\` is not part of the format; remove it.`
      )
      .join("\n")
  }
  if (issue.code === "invalid_value" && where === "schema") {
    const tag = child(value, "schema")
    const expected = issue.values
      .map((each) => JSON.stringify(each))
      .join(" or ")
    return tag === undefined
      ? `${at}: missing; it must be ${expected}.`
      : `${at}: ${JSON.stringify(tag)} is not this format's tag; it must be ${expected}.`
  }
  return `${at}: ${issue.message}`
}

function violationsOf(
  result: z.ZodSafeParseResult<unknown>,
  value: unknown,
  label: string
): Array<string> {
  if (result.success) return []
  return result.error.issues.flatMap((issue) =>
    describeIssue(issue, value, label).split("\n")
  )
}

/** The JSON objects in a reply; an array of them counts as each of them. */
function objectsIn(reply: string): Array<Record<string, unknown>> {
  return jsonValues(reply)
    .flatMap(
      (value): Array<unknown> => (Array.isArray(value) ? value : [value])
    )
    .filter(isRecord)
}

/** A format's name: its tag without the version, `some-ui.rust-round`. */
const nameOf = (tag: string): string => tag.slice(0, tag.lastIndexOf("/"))

/**
 * What an object is meant to be: a `schema` naming a round or notes in any
 * version (or with any suffix) says so, and an object with no such tag is a
 * round when it has `cards` and notes when it has `concepts`. A mistagged
 * one is still found, so its schema refuses it rather than the reply
 * dropping it unseen.
 */
function shapeOf(object: Record<string, unknown>): "round" | "notes" | null {
  const { schema } = object
  if (typeof schema === "string" && !schema.startsWith(nameOf(LOG_SCHEMA))) {
    if (schema.startsWith(nameOf(NOTES_SCHEMA))) return "notes"
    if (schema.startsWith(nameOf(ROUND_SCHEMA))) return "round"
  }
  if ("cards" in object) return "round"
  if ("concepts" in object) return "notes"
  return null
}

/** Every round id the log has a card from. */
const roundsPlayed = (log: RoundLog): Set<string> =>
  new Set(
    log.sessions.flatMap((session) => session.cards.map((event) => event.round))
  )

/**
 * Reads a tutor's reply. Never throws. `log` is the log the tutor was given
 * (a log with no sessions when there was none): a round must not reuse an
 * id it names, and the lint checks a refine card's note against it.
 */
export function intakeReply(reply: string, log: RoundLog): ReplyIntake {
  const objects = objectsIn(reply)
  const rounds = objects.filter((object) => shapeOf(object) === "round")
  const allNotes = objects.filter((object) => shapeOf(object) === "notes")

  const [roundValue] = rounds
  if (roundValue === undefined) {
    return refused([
      `No round found: reply with the round as one \`\`\`json block whose \`schema\` is "${ROUND_SCHEMA}".`,
    ])
  }
  const several = [
    ...(rounds.length > 1
      ? [`The reply holds ${rounds.length} rounds: send exactly one.`]
      : []),
    ...(allNotes.length > 1
      ? [
          `The reply holds ${allNotes.length} sets of tutor notes: send exactly one, rewritten whole.`,
        ]
      : []),
  ]
  if (several.length > 0) return refused(several)

  const [notesValue] = allNotes
  const round = RoundSchema.safeParse(roundValue)
  const notes =
    notesValue === undefined ? null : TutorNotesSchema.safeParse(notesValue)
  const violations = [
    ...violationsOf(round, roundValue, "round"),
    ...(notes === null ? [] : violationsOf(notes, notesValue, "tutor notes")),
  ]
  if (round.success && roundsPlayed(log).has(round.data.id)) {
    violations.push(
      `round id: "${round.data.id}" is a round the log already played; give this round a new id, never reused.`
    )
  }
  if (
    round.success &&
    notes?.success === true &&
    notes.data.round !== round.data.id
  ) {
    violations.push(
      `tutor notes round: "${notes.data.round}" must be the id of the round it travels with, "${round.data.id}".`
    )
  }
  if (!round.success || violations.length > 0) return refused(violations)

  const noNotes: Array<Finding> =
    notes === null ? [{ kind: "no-tutor-notes" }] : []
  return {
    ok: true,
    round: round.data,
    notes: notes?.success === true ? notes.data : null,
    findings: [...noNotes, ...lintRound(round.data, log)],
  }
}

function refused(violations: Array<string>): ReplyIntake {
  return { ok: false, violations, fixRequest: fixRequest(violations) }
}

/** The text sent back to a tutor whose reply was refused. */
function fixRequest(violations: ReadonlyArray<string>): string {
  return [
    "Rust Rounds checked your reply and could not take the round. Fix exactly",
    "these problems, keep everything else the same, and reply with the whole",
    "round in one ```json block and the tutor notes in another:",
    "",
    ...violations.map((violation) => `- ${violation}`),
    "",
  ].join("\n")
}
