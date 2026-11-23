/**
 * The asks: what waits on the owner to decide or do, as the open issues
 * labelled `ask` in the two repositories hold them (`docs/asks.md`), read
 * through GitHub's public list of issues. Pure: what each answer reads as,
 * and in what order the asks are listed. The read itself is `./read`'s.
 *
 * An ask whose block `parseAskBody` refuses is still listed, by its title,
 * so the owner sees that it is there and can open its page.
 */
import type { AskFile, WorkRepo } from "@some-ui/video-render"
import { readAskIssue } from "@some-ui/video-render"
import { z } from "zod"

import { askTitle, IssueSchema } from "@/lib/public-github"

export const IssuesSchema = z.array(IssueSchema)

export type Issues = z.infer<typeof IssuesSchema>

/** An open ask, as the Asks page lists it. */
export type OpenAsk = {
  /** Its repository and number (`askId`), as its page's address names it. */
  readonly id: string
  readonly repo: WorkRepo
  readonly number: number
  /** Its page on GitHub. */
  readonly url: string
  /** Its issue's title, with the `[ASK]` the filing rule puts first left out. */
  readonly title: string
  /** The ask its block carries, or `null` when the block can't be read. */
  readonly ask: AskFile | null
}

/** What the list says first: the question, or the title when unread. */
export const questionOf = (ask: OpenAsk): string =>
  ask.ask?.question ?? ask.title

/** The open asks among `issues` of `repo`; pull requests are never asks. */
export function asksOf(repo: WorkRepo, issues: Issues): Array<OpenAsk> {
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
        title: askTitle(issue.title),
        ask,
      }
    })
}

/** Every repository's asks, A to Z by what each asks, so none comes first. */
export function aToZ(
  byRepo: ReadonlyArray<ReadonlyArray<OpenAsk>>
): Array<OpenAsk> {
  return byRepo
    .flat()
    .sort(
      (a, b) =>
        questionOf(a).localeCompare(questionOf(b), "en") ||
        a.id.localeCompare(b.id, "en")
    )
}
