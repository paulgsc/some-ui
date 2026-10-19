#!/usr/bin/env node
// Runs the retention state machine (packages/eslint/src/retention.ts) against
// the repository's artifacts and Actions caches, from
// .github/workflows/retention.yml. RETENTION_MODE=report prints the plan;
// =delete also carries it out, largest first, at most RETENTION_MAX_DELETIONS
// per sweep and never below RATE_FLOOR requests of the token's hourly budget,
// which every workflow in the repo shares: the next sweep continues.
//
// Runs on Node's built-in type stripping with no install, like
// check-workflows.ts.
import { appendFileSync } from "node:fs"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  artifactFamily,
  plan,
  type Artifact,
  type Cache,
  type Deletion,
  type RunState,
} from "../packages/eslint/src/retention.ts"

const RATE_FLOOR = 300

const token = process.env.GITHUB_TOKEN ?? ""
const repo = process.env.GITHUB_REPOSITORY ?? ""
const mode = process.env.RETENTION_MODE === "delete" ? "delete" : "report"
const maxDeletions = Number(process.env.RETENTION_MAX_DELETIONS ?? "200")
if (token === "" || repo === "") {
  throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required")
}

let remaining = Number.POSITIVE_INFINITY

async function request(path: string, method = "GET"): Promise<Response> {
  const url = path.startsWith("https://")
    ? path
    : `https://api.github.com/repos/${repo}${path}`
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  })
  const left = response.headers.get("x-ratelimit-remaining")
  if (left !== null) remaining = Number(left)
  return response
}

// The API's JSON, read field by field: a missing or mistyped field reads as
// absent rather than being trusted.
type Json = Record<string, unknown>

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

async function pages(path: string, field?: string): Promise<Array<Json>> {
  const items: Array<Json> = []
  let next: string | undefined = path
  while (next) {
    const response = await request(next)
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} for ${next}`)
    }
    const body: unknown = await response.json()
    const list: unknown =
      field === undefined ? body : isJson(body) ? body[field] : undefined
    if (Array.isArray(list)) items.push(...list.filter(isJson))
    next = /<([^>]+)>;\s*rel="next"/.exec(
      response.headers.get("link") ?? ""
    )?.[1]
  }
  return items
}

const artifacts: Array<Artifact> = []
for (const a of await pages("/actions/artifacts?per_page=100", "artifacts")) {
  const run = a.workflow_run
  if (a.expired !== false || !isJson(run)) continue
  artifacts.push({
    id: num(a.id),
    name: str(a.name),
    runId: num(run.id),
    branch: str(run.head_branch),
    bytes: num(a.size_in_bytes),
  })
}

const runs = new Map<number, RunState>()
for (const runId of new Set(
  artifacts.filter((a) => artifactFamily(a.name)).map((a) => a.runId)
)) {
  const response = await request(`/actions/runs/${runId}`)
  if (!response.ok) continue
  const run: unknown = await response.json()
  if (!isJson(run)) continue
  runs.set(
    runId,
    run.status !== "completed"
      ? "pending"
      : run.conclusion === "success"
        ? "validated"
        : "failed"
  )
}

const caches: Array<Cache> = (
  await pages("/actions/caches?per_page=100", "actions_caches")
).map((c) => ({
  id: num(c.id),
  key: str(c.key),
  ref: str(c.ref),
  createdAt: str(c.created_at),
  bytes: num(c.size_in_bytes),
}))

const liveRefs = new Set<string>()
for (const branch of await pages("/branches?per_page=100")) {
  liveRefs.add(`refs/heads/${str(branch.name)}`)
}
for (const pull of await pages("/pulls?state=open&per_page=100")) {
  liveRefs.add(`refs/pull/${num(pull.number)}/merge`)
  liveRefs.add(`refs/pull/${num(pull.number)}/head`)
}
// A tag's caches are read by runs on that tag; this repo prunes no tags.
for (const c of caches) if (c.ref.startsWith("refs/tags/")) liveRefs.add(c.ref)

const result = plan({ artifacts, runs, caches, liveRefs })

const mb = (bytes: number): string => (bytes / 1e6).toFixed(1)
const lines: Array<string> = [
  `## Retention (${mode})`,
  "",
  `${artifacts.length} live artifacts, ${caches.length} caches; ${result.deletions.length} to delete (${mb(result.deletions.reduce((sum, d) => sum + d.item.bytes, 0))} MB).`,
  "",
  "| Target | Family | Reason | Count | MB |",
  "|---|---|---|---|---|",
]
const tally = new Map<string, { count: number; bytes: number }>()
for (const d of result.deletions) {
  const key = `${d.target} | ${d.family} | ${d.reason}`
  const entry = tally.get(key) ?? { count: 0, bytes: 0 }
  tally.set(key, { count: entry.count + 1, bytes: entry.bytes + d.item.bytes })
}
for (const [key, { count, bytes }] of [...tally].sort(
  (a, b) => b[1].bytes - a[1].bytes
)) {
  lines.push(`| ${key} | ${count} | ${mb(bytes)} |`)
}
const undeclared = new Map<string, number>()
for (const a of result.undeclaredArtifacts) {
  const name = `artifact ${a.name.replace(/[0-9a-f]{40}/g, "<sha>")}`
  undeclared.set(name, (undeclared.get(name) ?? 0) + 1)
}
for (const c of result.undeclaredCaches) {
  const name = `cache ${c.key.split("-").slice(0, 2).join("-")}…`
  undeclared.set(name, (undeclared.get(name) ?? 0) + 1)
}
if (undeclared.size > 0) {
  lines.push("", "Undeclared, left to expire:", "")
  for (const [name, count] of undeclared) lines.push(`- ${name} (${count})`)
}

let deleted = 0
if (mode === "delete") {
  const ordered = [...result.deletions].sort(
    (a: Deletion, b: Deletion) => b.item.bytes - a.item.bytes
  )
  for (const d of ordered.slice(0, maxDeletions)) {
    if (remaining < RATE_FLOOR) break
    const path =
      d.target === "artifact"
        ? `/actions/artifacts/${d.item.id}`
        : `/actions/caches/${d.item.id}`
    const response = await request(path, "DELETE")
    if (response.ok || response.status === 404) deleted += 1
  }
  lines.push(
    "",
    `Deleted ${deleted} of ${result.deletions.length}; ${remaining} API requests left this hour.`
  )
}

const report = lines.join("\n")
console.log(report)
const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) appendFileSync(summary, `${report}\n`)
