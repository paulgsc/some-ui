/**
 * The asks, read: one `GET` of GitHub's public list of open issues labelled
 * `ask` per repository (`@/lib/public-github`). What each answer reads as is
 * `./model`'s; when it is read is the query's (`./index`).
 */
import type { WorkRepo } from "@some-ui/video-render"
import { ASK_LABEL, WORK_REPOS } from "@some-ui/video-render"

import { readGithub } from "@/lib/public-github"

import type { OpenAsk } from "./model"
import { asksOf, aToZ, IssuesSchema } from "./model"

async function readRepo(repo: WorkRepo): Promise<Array<OpenAsk>> {
  // A page holds every open ask, up to 100.
  const issues = await readGithub(
    `${repo}/issues?labels=${ASK_LABEL}&state=open&per_page=100`,
    IssuesSchema
  )
  return asksOf(repo, issues)
}

/** Every open ask, A to Z; rejects when either repository's can't be read. */
export const readOpenAsks = async (): Promise<Array<OpenAsk>> =>
  aToZ(await Promise.all(WORK_REPOS.map(readRepo)))
