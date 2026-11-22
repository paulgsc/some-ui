/**
 * The asks, read: two `GET`s of GitHub's public list of issues labelled
 * `ask` per repository, the open ones (every one, up to 100) and the 100
 * closed ones updated most lately (C1201), through the shared fetch client
 * (`@some-ui/fetch-kit`, FK1's deadline). Nothing of the owner's is sent: the
 * issues are public, and the read carries no account. What each answer
 * reads as is `./model`'s; when it is read is the query's (`./index`).
 */
import { apiClient } from "@some-ui/fetch-kit"
import type { WorkRepo } from "@some-ui/video-render"
import { ASK_LABEL, WORK_REPOS } from "@some-ui/video-render"

import type { AskIssue } from "./model"
import { asksOf, aToZ, IssuesSchema } from "./model"

type State = "open" | "closed"

/** Where `repo`'s asks in `state` are listed: one page, of up to 100. */
const asksUrl = (repo: WorkRepo, state: State): URL =>
  new URL(
    `https://api.github.com/repos/paulgsc/${repo}/issues?labels=${ASK_LABEL}&state=${state}&sort=updated&per_page=100`
  )

async function readRepo(
  repo: WorkRepo,
  state: State
): Promise<Array<AskIssue>> {
  const issues = await apiClient.get(
    asksUrl(repo, state),
    {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    },
    IssuesSchema
  )
  return asksOf(repo, issues)
}

/**
 * The asks, waiting and answered, A to Z, each once (one closed between
 * the two reads is in both: its closing wins); rejects when any read fails.
 */
export const readAsks = async (): Promise<Array<AskIssue>> => {
  const read = await Promise.all(
    WORK_REPOS.flatMap((repo) => [
      readRepo(repo, "closed"),
      readRepo(repo, "open"),
    ])
  )
  const once = new Map<string, AskIssue>()
  for (const issue of read.flat())
    if (!once.has(issue.id)) once.set(issue.id, issue)
  return aToZ([[...once.values()]])
}
