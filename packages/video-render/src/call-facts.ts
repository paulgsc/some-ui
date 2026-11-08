/**
 * The weekly call's facts: what happened in both repositories over one
 * week, read from GitHub by the weekly run (`render call-facts`) and handed
 * to the agent that writes the week (`call.ts`). Everything here is read,
 * none of it judged: the agent groups the pull requests, picks what the
 * call says and writes its words.
 *
 * - **Merged pull requests**, each with its change kind (its squash
 *   commit's `Change-Kind:` trailer).
 * - **Calls** that reached the calls record (`docs/calls.json`, ST37 #2637)
 *   on `main` in the week, or were agreed to in it, so the call can say what
 *   was decided without the owner, and on whose authority.
 * - **Promises** declared or amended, from commits' `Promise:` and
 *   `Relates:` trailers: the gray-area calls.
 * - **Open asks** (`ask.ts`), each read or refused with why.
 * - **Epics that moved**, with their "Where we are" as the epic says it.
 */

import { z } from "zod"

import type { AskFile } from "./ask"
import type { Repo } from "./refs"

/** A fence's opening or closing line: three or more backticks or tildes. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/** Each line of `body`, and whether it sits inside a fenced code block. */
function linesOf(body: string): Array<{ text: string; fenced: boolean }> {
  let open: string | null = null
  return body.split(/\r?\n/).map((text) => {
    const mark = FENCE.exec(text)?.[1]
    if (mark === undefined) return { text, fenced: open !== null }
    if (open === null) {
      open = mark
      return { text, fenced: true }
    }
    if (mark[0] === open[0] && mark.length >= open.length) open = null
    return { text, fenced: true }
  })
}

/**
 * The text under `## <heading>` in an issue's or a pull request's body, to
 * the next heading of its level or above, outside any fenced code block.
 * The heading may go on after a space or a colon, as an epic's "Where we are
 * (2026-11-04)" does.
 */
export function sectionOf(body: string, heading: string): string | null {
  const lines = linesOf(body)
  const head = `## ${heading.toLowerCase()}`
  const start = lines.findIndex(({ text, fenced }) => {
    const line = text.trim().toLowerCase()
    return (
      !fenced &&
      (line === head ||
        (line.startsWith(head) && /^[ :]/.test(line.slice(head.length))))
    )
  })
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(
    ({ text, fenced }) => !fenced && /^#{1,2} /.test(text)
  )
  const text = (end === -1 ? rest : rest.slice(0, end))
    .map((l) => l.text)
    .join("\n")
    .trim()
  return text === "" ? null : text
}

/**
 * A call in the calls record (`docs/calls.json`), as the routine reads it.
 * The record's own check is `@some-ui/eslint`'s `calls.ts`, which runs with
 * no install and so can't be imported here; this reads only what it picks by.
 */
const CallSchema = z.looseObject({
  id: z.string(),
  made: z.iso.date(),
  by: z.enum(["claude", "owner"]),
  agreed: z.iso.date().optional(),
})

export type RecordedCall = z.infer<typeof CallSchema>

const CallsFileSchema = z.object({
  schema: z.literal("some-ui.calls/1"),
  calls: z.array(CallSchema),
})

/**
 * The calls that entered the record over a week, or gained the owner's
 * `agreed` in it: what `after` (the record on `main` as the week ended)
 * holds that `before` (as it began, null where there was none) did not.
 * Read by when it reached `main`, not by `made`, so a call made one week and
 * merged the next is voiced once, in the week it merged.
 */
export function callsEntered(
  before: string | null,
  after: string
): Array<RecordedCall> {
  const was = new Map(
    (before === null
      ? []
      : CallsFileSchema.parse(JSON.parse(before)).calls
    ).map((c) => [c.id, c])
  )
  return CallsFileSchema.parse(JSON.parse(after)).calls.filter((c) => {
    const earlier = was.get(c.id)
    return (
      earlier === undefined ||
      (earlier.agreed === undefined && c.agreed !== undefined)
    )
  })
}

/** A commit message's `Promise:` and `Relates:` trailers, in order. */
export const trailersOf = (message: string): Array<string> =>
  message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(Promise|Relates):\s/.test(l))

/**
 * The change kind a squash commit's trailers name, and the pull request its
 * header ends with (`… (#2624)`): `defect` if any of its commits was one.
 */
export function changeOf(
  message: string
): { readonly pull: number; readonly change: "story" | "defect" } | null {
  const lines = message.split(/\r?\n/)
  const pull = /\(#(\d+)\)\s*$/.exec(lines[0] ?? "")?.[1]
  const kinds = lines
    .map((l) => /^Change-Kind:\s*(story|defect)\s*$/.exec(l.trim())?.[1])
    .filter((k) => k !== undefined)
  if (pull === undefined || kinds.length === 0) return null
  return {
    pull: Number(pull),
    change: kinds.includes("defect") ? "defect" : "story",
  }
}

/** The "Where we are" an epic's body carries, cut to `most` characters. */
export function whereWeAreOf(body: string, most = 4000): string | null {
  const text = sectionOf(body, "Where we are")
  if (text === null) return null
  return text.length > most ? `${text.slice(0, most)}…` : text
}

/** What the weekly run reads, for the agent that writes the week. */
export type CallFacts = {
  readonly week: { readonly from: string; readonly to: string }
  readonly pulls: Array<{
    readonly repo: Repo
    readonly number: number
    readonly title: string
    readonly author: string
    readonly mergedAt: string
    /** From its squash commit's trailers; absent where none names one. */
    readonly change?: "story" | "defect"
  }>
  /** The calls that entered the record in the week (`callsEntered`). */
  readonly calls: Array<RecordedCall>
  readonly promises: Array<{
    readonly repo: Repo
    readonly sha: string
    readonly trailers: ReadonlyArray<string>
  }>
  readonly asks: Array<{
    /** Its id in the call (`askId`). */
    readonly id: string
    readonly repo: Repo
    readonly number: number
    readonly title: string
    readonly createdAt: string
    /** The ask its body carries, or null with `problems` saying why not. */
    readonly ask: AskFile | null
    readonly problems: ReadonlyArray<string>
  }>
  readonly epics: Array<{
    readonly repo: Repo
    readonly number: number
    readonly title: string
    readonly whereWeAre: string | null
  }>
}
