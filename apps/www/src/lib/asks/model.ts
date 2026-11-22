/**
 * The asks: what waits on the owner to decide or do, as the issues
 * labelled `ask` in the two repositories hold them (`docs/asks.md`), read
 * through GitHub's public list of issues. An open issue waits; a closed one
 * was answered (C1200). Pure: what each answer reads as, and in what order
 * the asks are listed. The read itself is `./read`'s.
 *
 * An ask whose block `parseAskBody` refuses is still listed, by its title,
 * so the owner sees that it is there and can open its page.
 */
import type { AskFile, WorkRepo } from "@some-ui/video-render"
import { readAskIssue } from "@some-ui/video-render"
import { z } from "zod"

/** One issue as GitHub lists it: a pull request carries `pull_request`. */
const IssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  html_url: z.url(),
  body: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  closed_at: z.iso.datetime({ offset: true }).nullable(),
  pull_request: z.unknown().optional(),
})

export const IssuesSchema = z.array(IssueSchema)

export type Issues = z.infer<typeof IssuesSchema>

/** An ask's issue, waiting or answered, as the Asks page lists it. */
export type AskIssue = {
  /** Its repository and number (`askId`), as its page's address names it. */
  readonly id: string
  readonly repo: WorkRepo
  readonly number: number
  /** Its page on GitHub. */
  readonly url: string
  /** Its issue's title, with the `[ASK]` the filing rule puts first left out. */
  readonly title: string
  /** When its issue was filed, as GitHub says it (ISO 8601). */
  readonly opened: string
  /** When its issue was closed, which answers it, or `null` while it waits. */
  readonly answered: string | null
  /** The ask its block carries, or `null` when the block can't be read. */
  readonly ask: AskFile | null
}

/** What the list says first: the question, or the title when unread. */
export const questionOf = (ask: AskIssue): string =>
  ask.ask?.question ?? ask.title

/** The asks among `issues` of `repo`; pull requests are never asks. */
export function asksOf(repo: WorkRepo, issues: Issues): Array<AskIssue> {
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
        opened: issue.created_at,
        answered: issue.closed_at,
        ask,
      }
    })
}

/** Two asks A to Z by what each asks, then by id, so none ties. */
export const byQuestion = (a: AskIssue, b: AskIssue): number =>
  questionOf(a).localeCompare(questionOf(b), "en") ||
  a.id.localeCompare(b.id, "en")

/** Every repository's asks, A to Z by what each asks, so none comes first. */
export function aToZ(
  byRepo: ReadonlyArray<ReadonlyArray<AskIssue>>
): Array<AskIssue> {
  return byRepo.flat().sort(byQuestion)
}
