/**
 * Studio's asks (SFEED1, #2731): what waits on the owner to decide, as the
 * open issues labelled `ask` in the two repositories hold them
 * (`docs/asks.md`), read through GitHub's public list of issues. Pure: what
 * each answer reads as, and in what order the asks are listed. The read
 * itself is `./index`'s.
 *
 * An ask whose block `parseAskBody` refuses is still listed, by its title,
 * so the owner sees that it is there and can open its page.
 */
import type { AskFile, Repo } from "@some-ui/video-render"
import { readAskIssue } from "@some-ui/video-render"
import { z } from "zod"

/** One issue as GitHub lists it: a pull request carries `pull_request`. */
const IssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  html_url: z.url(),
  body: z.string().nullable(),
  pull_request: z.unknown().optional(),
})

export const IssuesSchema = z.array(IssueSchema)

export type Issues = z.infer<typeof IssuesSchema>

/** An open ask, as Studio lists it. */
export type StudioAsk = {
  /** Its repository and number (`askId`), as its page's address names it. */
  readonly id: string
  readonly repo: Repo
  readonly number: number
  /** Its page on GitHub. */
  readonly url: string
  /** Its issue's title, with the `[ASK]` the filing rule puts first left out. */
  readonly title: string
  /** The ask its block carries, or `null` when the block can't be read. */
  readonly ask: AskFile | null
}

/** What the list says first: the question, or the title when unread. */
export const questionOf = (ask: StudioAsk): string =>
  ask.ask?.question ?? ask.title

/** The open asks among `issues` of `repo`; pull requests are never asks. */
export function asksOf(repo: Repo, issues: Issues): Array<StudioAsk> {
  return issues
    .filter((issue) => issue.pull_request === undefined)
    .map((issue) => {
      const { id, ask } = readAskIssue(repo, {
        number: issue.number,
        body: issue.body ?? "",
      })
      return {
        id,
        repo,
        number: issue.number,
        url: issue.html_url,
        title: issue.title.replace(/^\s*\[ASK\]\s*/i, ""),
        ask,
      }
    })
}

/** Every repository's asks, A to Z by what each asks, so none comes first. */
export function aToZ(
  byRepo: ReadonlyArray<ReadonlyArray<StudioAsk>>
): Array<StudioAsk> {
  return byRepo
    .flat()
    .sort(
      (a, b) =>
        questionOf(a).localeCompare(questionOf(b), "en") ||
        a.id.localeCompare(b.id, "en")
    )
}
