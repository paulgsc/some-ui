/**
 * Studio's asks, read (SFEED1, #2731): one `GET` of GitHub's public list of
 * open issues labelled `ask` per repository, through the shared fetch client
 * (`@some-ui/fetch-kit`, FK1's deadline). Nothing of the owner's is sent: the
 * issues are public, and the read carries no account. What each answer
 * reads as is `./model`'s; when it is read is the query's (`./index`).
 */
import { apiClient } from "@some-ui/fetch-kit"
import type { WorkRepo } from "@some-ui/video-render"
import { ASK_LABEL, WORK_REPOS } from "@some-ui/video-render"

import type { StudioAsk } from "./model"
import { asksOf, aToZ, IssuesSchema } from "./model"

/** Where `repo`'s open asks are listed: a page holds every one, up to 100. */
const asksUrl = (repo: WorkRepo): URL =>
  new URL(
    `https://api.github.com/repos/paulgsc/${repo}/issues?labels=${ASK_LABEL}&state=open&per_page=100`
  )

async function readRepo(repo: WorkRepo): Promise<Array<StudioAsk>> {
  const issues = await apiClient.get(
    asksUrl(repo),
    {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    },
    IssuesSchema
  )
  return asksOf(repo, issues)
}

/** Every open ask, A to Z; rejects when either repository's can't be read. */
export const readStudioAsks = async (): Promise<Array<StudioAsk>> =>
  aToZ(await Promise.all(WORK_REPOS.map(readRepo)))
