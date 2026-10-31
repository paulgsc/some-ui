/**
 * An idea's round trip with Claude (STUDIO ST19), as text both ways: the
 * idea goes out through the share sheet as one small document of the
 * owner's words (`ideaFile`), and what a session made of it comes back
 * through a file pick (`readReply`), the way Claude's version of a video
 * does. Nothing here holds or sends sound.
 *
 * The idea, as the session reads it (`some-ui.studio-idea/1`):
 *
 * ```json
 * {
 *   "schema": "some-ui.studio-idea/1",
 *   "idea": { "id": "…", "at": "…", "answers": [ … ], "asked": [ … ] },
 *   "questions": { "what": "What's the video?", "ask-1": "Which week?" },
 *   "scenes": null,
 *   "reply": { "schema": "some-ui.studio-idea-reply/1", "idea": "…", "askAtMost": 3 }
 * }
 * ```
 *
 * `idea` is the record as kept: each answer's versions, oldest first, the
 * last its words now. `scenes` is the last primer the phone kept for it, if
 * any. What a session sends back (`some-ui.studio-idea-reply/1`):
 *
 * ```json
 * {
 *   "schema": "some-ui.studio-idea-reply/1",
 *   "idea": "…",
 *   "ask": ["Which week's picks is this about?"],
 *   "primer": { "version": 2, "title": "…", "cuts": [
 *     { "id": "path", "artifact": "…", "point": "…", "keep": [],
 *       "targetSec": 20, "from": ["what", "spark"] } ] }
 * }
 * ```
 *
 * - `ask`: questions back where the answers leave a gap, at most
 *   `askAtMost` (three in an idea's life, `FOLLOW_UPS`). The owner answers
 *   them by voice in a later sitting.
 * - `primer`: a primer v2 (`journal/primer.ts`); each cut's `from` names
 *   the answers it came from, which must be answers the idea has. A cut
 *   that names none is Claude's idea, never the owner's.
 *
 * At least one of the two. A reply naming another idea is refused whole. A
 * primer naming the idea (`idea`), sent on its own, reads as a reply that
 * carries it alone: Studio's Start points one here, since only the idea it
 * names can say whether the answers it cites are the owner's.
 */
import { isRecord, jsonOf } from "@some-ui/core-utils"
import type { Primer } from "@soundbites/lib/journal/primer"
import { primerOf } from "@soundbites/lib/journal/primer"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"

import type { AnswerTo, Idea } from "./model"
import { FOLLOW_UPS, isFollowUp, latestDraft, newAsks } from "./model"

const IDEA_SCHEMA = "some-ui.studio-idea/1"
const REPLY_SCHEMA = "some-ui.studio-idea-reply/1"

/** What a session made of an idea. */
export type Reply = {
  readonly primer: Primer | null
  readonly ask: ReadonlyArray<string>
}

export type ReplyReading =
  | { readonly ok: true; readonly reply: Reply }
  | {
      readonly ok: false
      /** What the screen says: not a reply, another idea's, or a wrong one. */
      readonly why: "notReply" | "otherIdea" | "wrong"
      /** What is wrong, for the session that wrote it; never on screen. */
      readonly problem: string
    }

/** How many more questions Claude may ask about `idea`. */
function askLeft(idea: Idea): number {
  return FOLLOW_UPS.length - (idea.asked ?? []).length
}

/** The words of each question `idea` answers or was asked, by id. */
function questionsOf(idea: Idea): Readonly<Record<string, string>> {
  const asked = new Map((idea.asked ?? []).map((each) => [each.id, each.words]))
  const words = (question: AnswerTo): string =>
    isFollowUp(question)
      ? (asked.get(question) ?? "")
      : STUDIO_WORDS.idea.questions[question].ask
  const ids = [
    ...idea.answers.map((answer) => answer.question),
    ...(idea.asked ?? []).map((each) => each.id),
  ]
  return Object.fromEntries(ids.map((id) => [id, words(id)]))
}

/** The idea as it goes out to a session: its name and its text. */
export function ideaFile(idea: Idea): {
  readonly name: string
  readonly data: string
} {
  const { drafts: _, ...record } = idea
  const body = {
    schema: IDEA_SCHEMA,
    idea: record,
    questions: questionsOf(idea),
    scenes: latestDraft(idea)?.primer ?? null,
    reply: { schema: REPLY_SCHEMA, idea: idea.id, askAtMost: askLeft(idea) },
  }
  return {
    name: `idea-${idea.id}.json`,
    data: `${JSON.stringify(body, null, 2)}\n`,
  }
}

/** Whether `source` says it is a reply about an idea, before it is read whole. */
export function isIdeaReply(source: string): boolean {
  const raw = jsonOf(source)
  return isRecord(raw) && raw.schema === REPLY_SCHEMA
}

const wrong = (problem: string): ReplyReading => ({
  ok: false,
  why: "wrong",
  problem,
})

function readAsk(raw: unknown): ReadonlyArray<string> | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const all = raw.map((each) =>
    typeof each === "string" && each.trim() !== "" ? each.trim() : null
  )
  return all.every((each): each is string => each !== null) ? all : null
}

/** A reply as sent, or a primer naming an idea as a reply carrying it alone. */
function asReply(raw: unknown): unknown {
  return isRecord(raw) &&
    raw.schema === undefined &&
    raw.version !== undefined &&
    raw.idea !== undefined
    ? { schema: REPLY_SCHEMA, idea: raw.idea, primer: raw }
    : raw
}

/** Reads what a session sent back about `idea`, or says why it can't. */
export function readReply(source: string, idea: Idea): ReplyReading {
  const raw = asReply(jsonOf(source))
  if (!isRecord(raw) || raw.schema !== REPLY_SCHEMA)
    return { ok: false, why: "notReply", problem: `schema: ${REPLY_SCHEMA}` }
  if (raw.idea !== idea.id)
    return {
      ok: false,
      why: "otherIdea",
      problem: `idea: this reply is about ${String(raw.idea)}`,
    }
  const ask = readAsk(raw.ask)
  if (ask === null) return wrong("ask: a list of questions, each written out")
  // A question already asked is kept already, so only new ones count.
  if (newAsks(idea, ask).length > askLeft(idea))
    return wrong(`ask: at most ${askLeft(idea)} more questions for this idea`)
  if (raw.primer === undefined || raw.primer === null) {
    return ask.length === 0
      ? wrong("a reply carries a primer, questions, or both")
      : { ok: true, reply: { primer: null, ask } }
  }
  const reading = primerOf(raw.primer)
  if (!reading.ok) return wrong(`primer: ${reading.problem}`)
  const { primer } = reading
  if (primer.idea !== undefined && primer.idea !== idea.id)
    return wrong(`primer.idea: should be ${idea.id}`)
  const answered = new Set<string>(idea.answers.map((each) => each.question))
  const strange = primer.cuts.flatMap((cut) =>
    (cut.from ?? [])
      .filter((answer) => !answered.has(answer))
      .map(
        (answer) => `${cut.id} cites ${answer}, which the idea hasn't answered`
      )
  )
  if (strange.length > 0) return wrong(`primer: ${strange.join("; ")}`)
  return { ok: true, reply: { primer: { ...primer, idea: idea.id }, ask } }
}
