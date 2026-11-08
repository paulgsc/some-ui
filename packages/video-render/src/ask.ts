/**
 * An ask: one thing an agent can't decide and the owner must, filed as its
 * own GitHub issue labelled `ask` (`ASK_LABEL`), so it has a stable number,
 * a public page, and an end: closing it answers it. Its body carries one
 * fenced block, ```` ```json ask ````, that this module reads
 * (`docs/asks.md` says how to file one):
 *
 * ```json ask
 * {
 *   "schema": "some-ui.ask/1",
 *   "question": "Who answers between turns of a conversation?",
 *   "whyYours": "It decides what the conversation is: a product call.",
 *   "options": [
 *     { "says": "A live model", "unblocks": "TALK3, TALK6 and TALK9" },
 *     { "says": "A scripted reply", "unblocks": "TALK3 only" }
 *   ],
 *   "recommended": 0,
 *   "refs": [{ "repo": "some-ui", "kind": "issue", "number": 2545 }]
 * }
 * ```
 *
 * The weekly run's facts (`render call-facts`) carry every open ask, read
 * or refused with why, under its id in the call (`askId`); the agent that
 * writes the week says each one in its "waiting on you" section.
 */

import { z } from "zod"

import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { words } from "./format"
import { OptionSchema, RefSchema } from "./refs"
import type { Repo } from "./refs"

export const ASK_SCHEMA = "some-ui.ask/1"

/** The label every ask issue carries. */
export const ASK_LABEL = "ask"

export const AskFileSchema = z
  .strictObject({
    schema: z.literal(ASK_SCHEMA),
    question: words,
    /** Why it is the owner's to decide, not an agent's. */
    whyYours: words,
    options: z.array(OptionSchema).min(2).max(4),
    /** The option the agent recommends, by its place in `options`. */
    recommended: z.number().int().nonnegative().optional(),
    /** The epic, stories and pull requests it is about. */
    refs: z.array(RefSchema).default([]),
  })
  .refine(
    (ask) =>
      ask.recommended === undefined || ask.recommended < ask.options.length,
    {
      message: "it recommends an option it doesn't list",
      path: ["recommended"],
    }
  )
  .refine(
    (ask) =>
      new Set(ask.options.map((o) => o.says)).size === ask.options.length,
    { message: "two options say the same", path: ["options"] }
  )

export type AskFile = z.infer<typeof AskFileSchema>

/** The block, indented or not (under a list item, say), empty or not. */
const FENCE =
  /^[ \t]*```json ask[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?[ \t]*```[ \t]*$/gm

/** The ask an issue's body carries, or every reason it carries none. */
export function parseAskBody(body: string): Parsed<AskFile> {
  const blocks = [...body.matchAll(FENCE)].map((m) => m[1] ?? "")
  if (blocks.length !== 1)
    return {
      ok: false,
      problems: [
        blocks.length === 0
          ? "it has no ```json ask block"
          : "it has more than one ```json ask block",
      ],
    }
  if ((blocks[0] ?? "").trim() === "")
    return { ok: false, problems: ["its ask block is empty"] }
  let raw: unknown
  try {
    raw = JSON.parse(blocks[0] ?? "")
  } catch (error) {
    return {
      ok: false,
      problems: [`its ask block isn't JSON: ${String(error)}`],
    }
  }
  const parsed = AskFileSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "ask") }
}

/** The id an ask's item takes in a call: its repository and number. */
export const askId = (issue: {
  readonly repo: Repo
  readonly number: number
}): string => `${issue.repo}-${issue.number}`

/** An `ask` issue of `repo`, read: its id, and its ask or why it has none. */
export function readAskIssue(
  repo: Repo,
  issue: { readonly number: number; readonly body: string }
): {
  readonly id: string
  readonly ask: AskFile | null
  readonly problems: ReadonlyArray<string>
} {
  const read = parseAskBody(issue.body)
  return {
    id: askId({ repo, number: issue.number }),
    ask: read.ok ? read.value : null,
    problems: read.ok ? [] : [...read.problems],
  }
}
