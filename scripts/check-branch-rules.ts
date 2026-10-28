#!/usr/bin/env node
// Guardrail: GC1 in the assurance ledger. `main` in each repository still
// requires the checks packages/assurance/src/branch-rules.ts lists. GitHub
// answers `rules/branches/main` for a public repository to anyone, but the
// anonymous rate limit is per address and a shared runner's runs out, so CI
// passes its token in GH_TOKEN.
//
//   node scripts/check-branch-rules.ts
//
// In pr.yml's `branch-rules` job, which CI Gate needs, and daily in
// branch-rules.yml, because a setting can be switched off with no diff. An
// answer that never comes, or one this cannot read, fails: unknown is not a
// pass (docs/operational-assurance.md).

// Relative imports on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  branchRuleProblems,
  REQUIRED_CHECKS,
} from "../packages/assurance/src/branch-rules.ts"

const TIMEOUT_MS = 20_000

const err = (line: string): void => void process.stderr.write(`${line}\n`)

async function rules(repo: string): Promise<unknown> {
  const token = process.env.GH_TOKEN
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
  if (!response.ok)
    throw new Error(
      `${repo}: GitHub answered ${response.status}: ${(await response.text()).slice(0, 200)}`
    )
  return response.json()
}

async function main(): Promise<void> {
  const problems: Array<string> = []
  for (const { repo, checks } of REQUIRED_CHECKS) {
    try {
      problems.push(...branchRuleProblems(repo, checks, await rules(repo)))
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error))
    }
  }
  for (const problem of problems) err(`[branch-rules] ${problem}`)
  if (problems.length > 0) {
    err(
      `[branch-rules] ${problems.length} finding(s). GC1 in packages/assurance/src/ledger.json no longer holds.`
    )
    process.exitCode = 1
  } else {
    process.stdout.write("[branch-rules] ok\n")
  }
}

await main()
