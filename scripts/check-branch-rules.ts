#!/usr/bin/env node
// Guardrail: GC1 in the assurance ledger (docs/operational-assurance.md,
// "What `pnpm check:branch-rules` holds"). The rules live in
// packages/assurance/src/branch-rules.ts.
//
//   node scripts/check-branch-rules.ts
//
// GitHub answers `rules/branches/main` for a public repository to anyone, but
// the anonymous rate limit is per address and a shared runner's runs out, so
// CI passes its token in GITHUB_TOKEN (as scripts/retention.ts reads it). A
// 5xx or a lost answer is asked once more, after 2 s; an answer still missing fails as
// unknown, never as a pass.

// Relative imports on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import type { BranchRules } from "../packages/assurance/src/branch-rules.ts"
// eslint-disable-next-line no-restricted-imports
import {
  readBranchRules,
  REQUIRED_CHECKS,
} from "../packages/assurance/src/branch-rules.ts"

const TIMEOUT_MS = 20_000
const ATTEMPTS = 2
const RETRY_AFTER_MS = 2_000

const err = (line: string): void => void process.stderr.write(`${line}\n`)

async function rules(repo: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN
  let last = ""
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1)
      await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS))
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/rules/branches/main`,
        {
          headers: {
            accept: "application/vnd.github+json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      )
      if (response.ok) return await response.json()
      last = `GitHub answered ${response.status}: ${(await response.text()).slice(0, 200)}`
      if (response.status < 500) break
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(`${repo}: the rules could not be read (${last})`)
}

async function main(): Promise<void> {
  const verdicts: Array<BranchRules> = []
  for (const { repo, checks } of REQUIRED_CHECKS) {
    try {
      verdicts.push(readBranchRules(repo, checks, await rules(repo)))
    } catch (error) {
      verdicts.push({
        verdict: "unknown",
        problem: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const broken = verdicts.flatMap((v) =>
    v.verdict === "broken" ? v.problems : []
  )
  const unknown = verdicts.flatMap((v) =>
    v.verdict === "unknown" ? [v.problem] : []
  )
  for (const line of [...broken, ...unknown]) err(`[branch-rules] ${line}`)
  if (broken.length > 0)
    err(
      "[branch-rules] GC1 in packages/assurance/src/ledger.json no longer holds."
    )
  else if (unknown.length > 0)
    err("[branch-rules] GC1 could not be confirmed, which is not a pass.")
  if (broken.length > 0 || unknown.length > 0) process.exitCode = 1
  else process.stdout.write("[branch-rules] ok\n")
}

await main()
