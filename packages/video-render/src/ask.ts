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
 * The weekly call reads every open ask (`callAskOf`) into its "waiting on
 * you" section; the words it says over one are the run's own.
 */

import { z } from "zod"

import { OptionSchema, RefSchema } from "./call"
import type { CallWeek } from "./call"
import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { words } from "./format"

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

const FENCE = /^```json ask[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm

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

/** An ask issue as the search API gives it. */
export type AskIssue = {
  readonly repo: "some-ui" | "server"
  readonly number: number
  readonly body: string
}

/** The id an ask's item takes in a call: its repository and number. */
export const askId = (issue: Pick<AskIssue, "repo" | "number">): string =>
  `${issue.repo}-${issue.number}`

type CallAsk = CallWeek["asks"][number]

/**
 * An ask issue as the call's item, with the words to say over it, or every
 * reason its body can't be read. The issue itself is always among its refs.
 */
export function callAskOf(issue: AskIssue, said: string): Parsed<CallAsk> {
  const ask = parseAskBody(issue.body)
  if (!ask.ok)
    return {
      ok: false,
      problems: ask.problems.map((p) => `${issue.repo}#${issue.number}: ${p}`),
    }
  const self = {
    repo: issue.repo,
    kind: "issue" as const,
    number: issue.number,
  }
  const refs = [
    self,
    ...ask.value.refs.filter(
      (r) => !(r.repo === self.repo && r.number === self.number)
    ),
  ]
  return {
    ok: true,
    value: {
      id: askId(issue),
      question: ask.value.question,
      said,
      whyYours: ask.value.whyYours,
      options: ask.value.options,
      ...(ask.value.recommended === undefined
        ? {}
        : { recommended: ask.value.recommended }),
      refs,
    },
  }
}
