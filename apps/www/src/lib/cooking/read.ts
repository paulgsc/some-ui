/**
 * The Cooking page's read (C1115): the newest open `[ORCH]` issue's run
 * block, then what GitHub says of every pull request, workflow run and ask it
 * names (`@/lib/public-github`). A fact that can't be read is left `null`,
 * so one missing answer marks its stop instead of failing the page.
 */
import type { Leg, RunFile } from "@some-ui/video-render"
import {
  parseAskBody,
  parseRunBody,
  refKey,
  RUN_LABEL,
} from "@some-ui/video-render"
import { z } from "zod"

import { askTitle, IssueSchema, readGithub } from "@/lib/public-github"

import type { AskFacts, Facts, PrFacts, RunFacts, Train } from "./model"
import { runKey, trainsOf } from "./model"

const StatedIssueSchema = IssueSchema.extend({
  state: z.enum(["open", "closed"]),
  created_at: z.string(),
})

const PullSchema = z.object({
  html_url: z.url(),
  state: z.enum(["open", "closed"]),
  created_at: z.string(),
  merged_at: z.string().nullable(),
  head: z.object({ sha: z.string() }),
})

const ChecksSchema = z.object({
  check_runs: z.array(
    z.object({ status: z.string(), conclusion: z.string().nullable() })
  ),
})

const WorkflowRunSchema = z.object({
  html_url: z.url(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

/** What the page shows: no run today, a run it can't read, or the trains. */
export type Cooking =
  | { readonly kind: "none" }
  | { readonly kind: "unread"; readonly url: string }
  | {
      readonly kind: "run"
      readonly url: string
      /** How many of GitHub's answers it couldn't read this time. */
      readonly unread: number
      readonly day: string
      readonly trains: ReadonlyArray<Train>
    }

/** A finished check that didn't fail: passed, skipped or neutral. */
const PASSING = new Set(["success", "skipped", "neutral"])

type Checks = PrFacts["checks"]

/** Where one check stands: approval waits on a person, the rest on the checks or Claude. */
function countCheck(
  checks: Checks,
  status: string,
  conclusion: string | null
): Checks {
  const bump = (k: keyof Checks): Checks => ({ ...checks, [k]: checks[k] + 1 })
  if (status === "completed") {
    if (conclusion === "action_required") return bump("approval")
    // A stale check never starts again by itself: it needs re-running.
    if (conclusion === "stale") return bump("failed")
    return bump(PASSING.has(conclusion ?? "") ? "passed" : "failed")
  }
  if (status === "waiting") return bump("approval")
  return bump(status === "in_progress" ? "running" : "waiting")
}

/** Merged pull requests, which can't change again, kept for the tab's life. */
const mergedPrs = new Map<string, PrFacts>()

/** `readPr`, unless the pull request was merged when last read. */
async function readPrOnce(repo: string, number: number): Promise<PrFacts> {
  const key = refKey({ repo, number })
  const known = mergedPrs.get(key)
  if (known !== undefined) return known
  const pr = await readPr(repo, number)
  if (pr.state === "merged") mergedPrs.set(key, pr)
  return pr
}

/** For tests: forget what was kept, so each starts from GitHub. */
export function forgetEnded(): void {
  mergedPrs.clear()
}

async function readPr(repo: string, number: number): Promise<PrFacts> {
  const pull = await readGithub(`${repo}/pulls/${String(number)}`, PullSchema)
  let checks: Checks = {
    waiting: 0,
    running: 0,
    passed: 0,
    failed: 0,
    approval: 0,
  }
  if (pull.state === "open") {
    const runs = await readGithub(
      `${repo}/commits/${pull.head.sha}/check-runs?per_page=100`,
      ChecksSchema
    )
    for (const run of runs.check_runs)
      checks = countCheck(checks, run.status, run.conclusion)
  }
  return {
    url: pull.html_url,
    state: pull.merged_at !== null ? "merged" : pull.state,
    openedAt: pull.created_at,
    mergedAt: pull.merged_at,
    checks,
  }
}

/** How a workflow run stands, from GitHub's status and conclusion. */
function runStateOf(
  status: string | null,
  conclusion: string | null
): RunFacts["state"] {
  if (status === "completed") {
    if (conclusion === "action_required") return "approval"
    return conclusion === "success" ? "passed" : "failed"
  }
  if (status === "waiting" || status === "action_required") return "approval"
  if (status === "in_progress") return "running"
  return "waiting"
}

async function readRun(repo: string, run: number): Promise<RunFacts> {
  const r = await readGithub(
    `${repo}/actions/runs/${String(run)}`,
    WorkflowRunSchema
  )
  const state = runStateOf(r.status, r.conclusion)
  return {
    url: r.html_url,
    state,
    startedAt: r.created_at,
    endedAt: state === "passed" || state === "failed" ? r.updated_at : null,
  }
}

async function readAsk(repo: string, number: number): Promise<AskFacts> {
  const issue = await readGithub(
    `${repo}/issues/${String(number)}`,
    StatedIssueSchema
  )
  const ask = parseAskBody(issue.body ?? "")
  return {
    url: issue.html_url,
    open: issue.state === "open",
    filedAt: issue.created_at,
    question: ask.ok ? ask.value.question : askTitle(issue.title),
    steps:
      ask.ok && ask.value.kind === "checklist"
        ? ask.value.steps.map((s) => s.says)
        : [],
  }
}

/** Each key once, read; `null` for one that couldn't be. */
async function readEach<T>(
  keys: ReadonlyMap<string, () => Promise<T>>
): Promise<Map<string, T | null>> {
  const entries = [...keys]
  const settled = await Promise.allSettled(entries.map(([, read]) => read()))
  return new Map(
    entries.map(([key], i) => {
      const s = settled.at(i)
      return [key, s?.status === "fulfilled" ? s.value : null]
    })
  )
}

/** Every fact the run's legs need, read once each. */
async function readFacts(run: RunFile): Promise<Facts> {
  const legs: Array<Leg> = run.goals.flatMap((g) => g.legs)
  const prs = new Map<string, () => Promise<PrFacts>>()
  const runs = new Map<string, () => Promise<RunFacts>>()
  const asks = new Map<string, () => Promise<AskFacts>>()
  for (const leg of legs) {
    if (leg.leg === "merge")
      prs.set(refKey(leg.pr), () => readPrOnce(leg.pr.repo, leg.pr.number))
    if (leg.leg === "run")
      runs.set(runKey(leg.repo, leg.run), () => readRun(leg.repo, leg.run))
    if (leg.leg === "yours" && leg.ask !== undefined) {
      const ask = leg.ask
      asks.set(refKey(ask), () => readAsk(ask.repo, ask.number))
    }
  }
  const [p, r, a] = await Promise.all([
    readEach(prs),
    readEach(runs),
    readEach(asks),
  ])
  return { prs: p, runs: r, asks: a }
}

/** Today's cooking: the newest open run's trains, or why there are none. */
export async function readCooking(): Promise<Cooking> {
  const issues = await readGithub(
    `some-ui/issues?labels=${RUN_LABEL}&state=open&sort=created&direction=desc&per_page=5`,
    z.array(StatedIssueSchema)
  )
  const newest = issues.at(0)
  if (newest === undefined) return { kind: "none" }
  const run = parseRunBody(newest.body ?? "")
  if (!run.ok) return { kind: "unread", url: newest.html_url }
  const facts = await readFacts(run.value)
  const missing = [
    ...facts.prs.values(),
    ...facts.runs.values(),
    ...facts.asks.values(),
  ]
  return {
    kind: "run",
    url: newest.html_url,
    unread: missing.filter((f) => f === null).length,
    day: run.value.day,
    trains: trainsOf(run.value, facts),
  }
}
