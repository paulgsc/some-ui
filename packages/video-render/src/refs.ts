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
