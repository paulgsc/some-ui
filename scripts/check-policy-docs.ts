#!/usr/bin/env node
// Guardrail: what the policy documents' text can hold (CLAUDE.md, "Gray-area
// invariants: declare them falsifiable"). The rules, and why this is a script
// and not an ESLint rule, live in packages/eslint/src/policy-docs.ts.
//
//   node scripts/check-policy-docs.ts [--base <ref>]
//
// The invariant IDs are held against the base ref's (`--base <ref>`, else
// `origin/main` where it exists). Wired into the root `lint` script and
// pr.yml's `policy-docs` job, which CI Gate requires. Runs on Node's built-in
// type stripping, with no install (see scripts/check-test-layout.ts).
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  readFilesAt,
  repoRoot,
  resolveBaseRef,
  worktreeFiles,
} from "../packages/eslint/src/git-tree.ts"
// eslint-disable-next-line no-restricted-imports
import {
  describePolicyViolation,
  findInvariantViolations,
  findReferenceViolations,
} from "../packages/eslint/src/policy-docs.ts"

const out = (line: string): void => void process.stdout.write(`${line}\n`)
const err = (line: string): void => void process.stderr.write(`${line}\n`)
const MARKDOWN = ".md"

function main(): void {
  const root = repoRoot()
  const tracked = worktreeFiles(root)
  const docs = new Map<string, string>()
  for (const path of tracked) {
    if (path.endsWith(MARKDOWN))
      docs.set(path, readFileSync(join(root, path), "utf8"))
  }

  let base: Map<string, string> | null
  let held: string
  try {
    const { ref, resolved } = resolveBaseRef(root, process.argv.slice(2))
    base = resolved ? readFilesAt(root, ref, MARKDOWN) : null
    held = resolved ? `IDs kept since ${ref}` : `IDs not compared, no ${ref}`
  } catch (error) {
    err(
      `[policy-docs] ${error instanceof Error ? error.message : String(error)}`
    )
    process.exitCode = 1
    return
  }

  const violations = [
    ...findInvariantViolations(docs, base),
    ...findReferenceViolations(docs, tracked),
  ]
  for (const violation of violations) {
    err(`[policy-docs] ${describePolicyViolation(violation)}`)
  }
  if (violations.length > 0) {
    err(
      `[policy-docs] ${violations.length} violation(s). See CLAUDE.md, "Gray-area invariants: declare them falsifiable".`
    )
    process.exitCode = 1
  } else {
    out(`[policy-docs] ok (${docs.size} markdown files; ${held})`)
  }
}

main()
