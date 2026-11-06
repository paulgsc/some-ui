/**
 * The weekly call's facts: what happened in both repositories over one
 * week, read from GitHub by the weekly run (`render call-facts`) and handed
 * to the agent that writes the week (`call.ts`). Everything here is read,
 * none of it judged: the agent groups the pull requests, picks what the
 * call says and writes its words.
 *
 * - **Merged pull requests**, each with its change kind and its "Calls I
 *   made" section (the PR template's), so the call can say what was
 *   decided without the owner.
 * - **Promises** declared or amended, from commits' `Promise:` and
 *   `Relates:` trailers: the gray-area calls.
 * - **Open asks** (`ask.ts`), each read or refused with why.
 * - **Epics that moved**, with their "Where we are" as the epic says it.
 */

import { z } from "zod"

/**
 * The text under `## <heading>` in an issue's or a pull request's body, to
 * the next heading of its level or above. The heading may go on after a
 * space or a colon, as an epic's "Where we are (2026-11-04)" does.
 */
export function sectionOf(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/)
  const head = `## ${heading.toLowerCase()}`
  const start = lines.findIndex((l) => {
    const line = l.trim().toLowerCase()
    return (
      line === head ||
      (line.startsWith(head) && /^[ :]/.test(line.slice(head.length)))
    )
  })
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^#{1,2} /.test(l))
  const text = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim()
  return text === "" ? null : text
}

/** What a "Calls I made" section says, unless it says there were none. */
export function callsOf(body: string): string | null {
  const text = sectionOf(body, "Calls I made")
  if (text === null) return null
  return /^none\b/i.test(text.replace(/^[-*]\s*/, "")) ? null : text
}

/** The change kind a pull request's body names: its first `story` or `defect`. */
export function changeKindOf(body: string): "story" | "defect" | null {
  const text = sectionOf(body, "Change kind") ?? ""
  const kind = /`?(story|defect)`?/i.exec(text)?.[1]?.toLowerCase()
  return kind === "story" || kind === "defect" ? kind : null
}

/** A commit message's `Promise:` and `Relates:` trailers, in order. */
export const trailersOf = (message: string): Array<string> =>
  message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(Promise|Relates):\s/.test(l))

/** The "Where we are" an epic's body carries, cut to `most` characters. */
export function whereWeAreOf(body: string, most = 4000): string | null {
  const text = sectionOf(body, "Where we are")
  if (text === null) return null
  return text.length > most ? `${text.slice(0, most)}…` : text
}

const repo = z.enum(["some-ui", "server"])

export const CallFactsSchema = z.strictObject({
  week: z.strictObject({ from: z.iso.date(), to: z.iso.date() }),
  pulls: z.array(
    z.strictObject({
      repo,
      number: z.number().int().positive(),
      title: z.string(),
      author: z.string(),
      mergedAt: z.string(),
      change: z.enum(["story", "defect"]).nullable(),
      calls: z.string().nullable(),
    })
  ),
  promises: z.array(
    z.strictObject({ repo, sha: z.string(), trailers: z.array(z.string()) })
  ),
  asks: z.array(
    z.strictObject({
      repo,
      number: z.number().int().positive(),
      title: z.string(),
      createdAt: z.string(),
      body: z.string(),
      problems: z.array(z.string()),
    })
  ),
  epics: z.array(
    z.strictObject({
      repo,
      number: z.number().int().positive(),
      title: z.string(),
      whereWeAre: z.string().nullable(),
    })
  ),
})

export type CallFacts = z.infer<typeof CallFactsSchema>
