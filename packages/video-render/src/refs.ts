/**
 * What the weekly call and an ask both name (`call.ts`, `ask.ts`): a pull
 * request or an issue in a repository it may point to, and an option the
 * owner can choose. Its own module, so Studio's Asks on the phone (SFEED1)
 * read an ask without the call's template, which only the desktop's stage
 * draws.
 */

import { z } from "zod"

import { words } from "./format"

/**
 * Where a ref may point: the two code repositories, and paulgsc/testing,
 * whose pull requests carry data (a call may cite its guard, testing#6).
 */
export const REF_REPOS = ["some-ui", "server", "testing"] as const

export type Repo = (typeof REF_REPOS)[number]

/**
 * Where the work is filed: the repositories whose asks Studio and the call
 * read, and whose merged changes, trailers and epics the call's facts hold.
 * Testing holds data, not work, so it isn't one.
 */
export const WORK_REPOS = [
  "some-ui",
  "server",
] as const satisfies ReadonlyArray<Repo>

export type WorkRepo = (typeof WORK_REPOS)[number]

/** A pull request or an issue in a repository a ref may point to. */
export const RefSchema = z.strictObject({
  repo: z.enum(REF_REPOS),
  kind: z.enum(["pr", "issue"]),
  number: z.number().int().positive(),
})

export type CallRef = z.infer<typeof RefSchema>

export const PrSchema = RefSchema.extend({ kind: z.literal("pr") })
export const IssueSchema = RefSchema.extend({ kind: z.literal("issue") })

/** An epic's tag, as its title carries it: "STUDIO". */
export const epicTag = z.string().regex(/^[A-Z][A-Z0-9-]{0,23}$/)

/**
 * A call an agent made without the owner's word: the options it had, the one
 * it took, why, and how the owner undoes it. The weekly call's `mine` and a
 * session's note (`session-note.ts`) both say one.
 */
export const ChoiceSchema = z.strictObject({
  title: words,
  options: z.array(words).min(2).max(4),
  /** The option it took, by its place in `options`. */
  chose: z.number().int().nonnegative(),
  why: words,
  /** How the owner undoes it, if they would rather not. */
  undo: words,
})

/** Every reason a call's options contradict it: one taken it doesn't list, or two the same. */
export function choiceProblems(
  name: string,
  choice: z.infer<typeof ChoiceSchema>
): Array<string> {
  return [
    ...(new Set(choice.options).size === choice.options.length
      ? []
      : [`${name}: two options say the same`]),
    ...(choice.chose < choice.options.length
      ? []
      : [`${name}: it chose an option it doesn't list`]),
  ]
}

/** Where `ref` is on GitHub. */
export const refUrl = (ref: CallRef): string =>
  `https://github.com/paulgsc/${ref.repo}/${ref.kind === "pr" ? "pull" : "issues"}/${ref.number}`

/** An option an ask or the call offers the owner. */
export const OptionSchema = z.strictObject({
  says: words,
  /** What choosing it lets go ahead. */
  unblocks: words,
})
