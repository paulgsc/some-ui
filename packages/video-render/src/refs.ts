/**
 * What the weekly call and an ask both name (`call.ts`, `ask.ts`): a pull
 * request or an issue in one of the two repositories, and an option the
 * owner can choose. Its own module, so Studio's Asks on the phone (SFEED1)
 * read an ask without the call's template, which only the desktop's stage
 * draws.
 */

import { z } from "zod"

import { words } from "./format"

/** The two repositories. */
export const REPOS = ["some-ui", "server"] as const

export type Repo = (typeof REPOS)[number]

/** A pull request or an issue in one of the two repositories. */
export const RefSchema = z.strictObject({
  repo: z.enum(REPOS),
  kind: z.enum(["pr", "issue"]),
  number: z.number().int().positive(),
})

export type CallRef = z.infer<typeof RefSchema>

/** Where `ref` is on GitHub. */
export const refUrl = (ref: CallRef): string =>
  `https://github.com/paulgsc/${ref.repo}/${ref.kind === "pr" ? "pull" : "issues"}/${ref.number}`

/** An option an ask or the call offers the owner. */
export const OptionSchema = z.strictObject({
  says: words,
  /** What choosing it lets go ahead. */
  unblocks: words,
})
