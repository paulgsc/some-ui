/**
 * An ask: one thing an agent can't decide and the owner must, filed as its
 * own GitHub issue labelled `ask` (`ASK_LABEL`), so it has a stable number,
 * a public page, and an end: closing it answers it. Its body carries one
 * fenced block, ```` ```json ask ````, that this module reads
 * (`docs/asks.md` says how to file one):
 *
 * ```json ask
 * {
 *   "schema": "some-ui.ask/3",
 *   "kind": "decision",
 *   "question": "Who answers between turns of a conversation?",
 *   "whyYours": "It decides what the conversation is: a product call.",
 *   "waits": "claude",
 *   "call": "story",
 *   "unblocks": "the conversation's next stories (TALK3, TALK6, TALK9)",
 *   "options": [
 *     { "says": "A live model", "unblocks": "TALK3, TALK6 and TALK9" },
 *     { "says": "A scripted reply", "unblocks": "TALK3 only" }
 *   ],
 *   "recommended": 0,
 *   "refs": [{ "repo": "some-ui", "kind": "issue", "number": 2545 }]
 * }
 * ```
 *
 * Every ask says, whatever its kind, who `waits` on it, which kind of
 * `call` it is, and what answering it `unblocks` (C1200). Its kind's own
 * part is the only one that differs: a decision's `options`, a
 * `checklist`'s `steps` (each with what to do, where, and what to paste
 * back). A block filed before `/3` still reads, with what it never said
 * (`waits`, `call`, a decision's `unblocks`) as `null`: unclassified.
 * The desktop web's Asks page (`apps/www`, `lib/asks`) lists every kind.
 *
 * The weekly run's facts (`render call-facts`) carry every open ask, read
 * or refused with why, under its id in the call (`askId`); the agent that
 * writes the week says each one in its "waiting on you" section.
 */

import { assertNever, isRecord } from "@some-ui/core-utils"
import { z } from "zod"

import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { words } from "./format"
import { OptionSchema, RefSchema, WORK_REPOS } from "./refs"
import type { Repo, WorkRepo } from "./refs"

/** The schema an ask is filed in: its shared part, and its kind's. */
export const ASK_SCHEMA = "some-ui.ask/3"

/** The second schema, kinds without the shared part, still read. */
export const ASK_SCHEMA_V2 = "some-ui.ask/2"

/** The first schema, a decision alone, still read. */
export const ASK_SCHEMA_V1 = "some-ui.ask/1"

/** Who is held up until the ask is answered. */
export const ASK_WAITS = ["claude", "pipeline", "home"] as const

export type AskWaits = (typeof ASK_WAITS)[number]

/** The kinds of call an ask is, in the owner's own list (#3425). */
export const ASK_CALLS = [
  "architecture",
  "mechanical",
  "hardware",
  "software",
  "environment",
  "story",
  "idiom",
] as const

export type AskCall = (typeof ASK_CALLS)[number]

/** The label every ask issue carries. */
export const ASK_LABEL = "ask"

/** Why an ask is the owner's, and what it is about: every kind has these. */
const asked = {
  question: words,
  /** Why it is the owner's to decide or do, not an agent's. */
  whyYours: words,
  /** The epic, stories and pull requests it is about. */
  refs: z.array(RefSchema).default([]),
}

/** What `/3` adds to every kind: who waits, the kind of call, what it frees. */
const shared = {
  waits: z.enum(ASK_WAITS),
  call: z.enum(ASK_CALLS),
  /** What answering it lets go ahead, in the owner's words. */
  unblocks: words,
}

/** What a block filed before `/3` never said: unclassified. */
const UNSAID = { waits: null, call: null } as const

/** A decision: the options the owner chooses between. */
const decision = {
  ...asked,
  options: z.array(OptionSchema).min(2).max(4),
  /** The option the agent recommends, by its place in `options`. */
  recommended: z.number().int().nonnegative().optional(),
}

/**
 * One step of a checklist: what to do, in order, and where; and, when the
 * step has a result worth handing back (a log, an address, "done"), what
 * to paste. Never a secret's value: a step that makes one says where it is
 * pasted instead.
 */
export const StepSchema = z.strictObject({
  /** The step in a few words: "A Grafana key for home's photographer". */
  says: words,
  /** Where it is done: "Grafana on home", "a terminal in paulgsc/server". */
  where: words.optional(),
  /** What to do, in order, one line each. */
  do: z.array(words).min(1).max(12),
  /** What to paste back once it's done, when there is anything. */
  paste: words.optional(),
})

export type AskStep = z.infer<typeof StepSchema>

/** The most steps a checklist holds: more is two asks. */
const STEPS_MOST = 12

/** A checklist: steps only the owner can take, each ticked off in turn. */
const checklist = {
  ...asked,
  steps: z.array(StepSchema).min(1).max(STEPS_MOST),
}

const recommendsListed = (ask: {
  readonly recommended?: number | undefined
  readonly options: ReadonlyArray<unknown>
}): boolean =>
  ask.recommended === undefined || ask.recommended < ask.options.length

const optionsDiffer = (ask: {
  readonly options: ReadonlyArray<{ readonly says: string }>
}): boolean =>
  new Set(ask.options.map((o) => o.says)).size === ask.options.length

const RECOMMENDS = {
  message: "it recommends an option it doesn't list",
  path: ["recommended"],
}
const SAME = { message: "two options say the same", path: ["options"] }

const stepsDiffer = (ask: {
  readonly steps: ReadonlyArray<{ readonly says: string }>
}): boolean => new Set(ask.steps.map((s) => s.says)).size === ask.steps.length

const SAME_STEPS = { message: "two steps say the same", path: ["steps"] }

/** A `some-ui.ask/1` block: a decision before kinds, read as one. */
const AskV1Schema = z
  .strictObject({ schema: z.literal(ASK_SCHEMA_V1), ...decision })
  .refine(recommendsListed, RECOMMENDS)
  .refine(optionsDiffer, SAME)
  .transform(({ schema: _schema, ...ask }) => ({
    schema: ASK_SCHEMA,
    kind: "decision" as const,
    ...ask,
    ...UNSAID,
    unblocks: null,
  }))

/** A `some-ui.ask/2` block: kinds, before the shared part. */
const AskV2Schema = z.discriminatedUnion("kind", [
  z
    .strictObject({
      schema: z.literal(ASK_SCHEMA_V2),
      kind: z.literal("decision"),
      ...decision,
    })
    .refine(recommendsListed, RECOMMENDS)
    .refine(optionsDiffer, SAME)
    .transform(({ schema: _schema, ...ask }) => ({
      schema: ASK_SCHEMA,
      ...ask,
      ...UNSAID,
      unblocks: null,
    })),
  z
    .strictObject({
      schema: z.literal(ASK_SCHEMA_V2),
      kind: z.literal("checklist"),
      ...checklist,
      unblocks: words,
    })
    .refine(stepsDiffer, SAME_STEPS)
    .transform(({ schema: _schema, ...ask }) => ({
      schema: ASK_SCHEMA,
      ...ask,
      ...UNSAID,
    })),
])

/** A `some-ui.ask/3` block: the shared part, and its kind's. */
const AskV3Schema = z.discriminatedUnion("kind", [
  z
    .strictObject({
      schema: z.literal(ASK_SCHEMA),
      kind: z.literal("decision"),
      ...decision,
      ...shared,
    })
    .refine(recommendsListed, RECOMMENDS)
    .refine(optionsDiffer, SAME),
  z
    .strictObject({
      schema: z.literal(ASK_SCHEMA),
      kind: z.literal("checklist"),
      ...checklist,
      ...shared,
    })
    .refine(stepsDiffer, SAME_STEPS),
])

type AskSchema = typeof AskV1Schema | typeof AskV2Schema | typeof AskV3Schema

/**
 * An ask, of any kind and schema; an earlier block reads as `/3` with what
 * it never said as `null`, so every ask filed before still reads. The kinds
 * are one family (C1095): a new kind is a member here, and every reader's
 * `switch` on `kind` (the call's `callOptionsOf`, the Asks page's receipt)
 * fails to compile until it says the new one. A block is checked against
 * its own `schema` alone, so a refusal says why.
 */
function askSchemaOf(raw: unknown): AskSchema {
  const schema = isRecord(raw) ? raw.schema : undefined
  if (schema === ASK_SCHEMA_V1) return AskV1Schema
  if (schema === ASK_SCHEMA_V2) return AskV2Schema
  return AskV3Schema
}

export type AskFile = z.output<AskSchema>
export type DecisionAsk = Extract<AskFile, { kind: "decision" }>
export type ChecklistAsk = Extract<AskFile, { kind: "checklist" }>

/** What an ask offers the owner to choose, as the weekly call says it. */
export type CallOptions = {
  readonly options: ReadonlyArray<{
    readonly says: string
    readonly unblocks: string
  }>
  readonly recommended?: number
}

/**
 * What the weekly call offers for `ask`: a decision's own options; for a
 * checklist, "Done", unblocking what finishing it does, and "Not yet",
 * with "Done" recommended.
 */
export function callOptionsOf(ask: AskFile): CallOptions {
  switch (ask.kind) {
    case "decision": {
      return ask.recommended === undefined
        ? { options: ask.options }
        : { options: ask.options, recommended: ask.recommended }
    }
    case "checklist": {
      return {
        options: [
          { says: "Done", unblocks: ask.unblocks },
          { says: "Not yet", unblocks: "nothing yet" },
        ],
        recommended: 0,
      }
    }
    default: {
      return assertNever(ask)
    }
  }
}

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
  const parsed = askSchemaOf(raw).safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "ask") }
}

/** The id an ask's item takes in a call: its repository and number. */
export const askId = (issue: {
  readonly repo: Repo
  readonly number: number
}): string => `${issue.repo}-${issue.number}`

/** The ask an `askId` names, or `null` when it names none. */
export function parseAskId(
  id: string
): { readonly repo: WorkRepo; readonly number: number } | null {
  const match = /^(.+)-([1-9]\d*)$/.exec(id)
  const repo = z.enum(WORK_REPOS).safeParse(match?.[1])
  return repo.success && match?.[2] !== undefined
    ? { repo: repo.data, number: Number(match[2]) }
    : null
}

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
