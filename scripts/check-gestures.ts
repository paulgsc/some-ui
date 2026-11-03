#!/usr/bin/env node
// Guardrail: GES5 (#2524), one pager for the phone's paged cards. The rule,
// and what it leaves to review, live in packages/eslint/src/gestures.ts.
//
// Wired into the root `lint` script and pr.yml's `gestures` job, which CI
// Gate requires. Runs on Node's built-in type stripping, with no install (see
// scripts/check-test-layout.ts).
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  describeGestureViolation,
  findGestureViolations,
} from "../packages/eslint/src/gestures.ts"
// eslint-disable-next-line no-restricted-imports
import { repoRoot, worktreeFiles } from "../packages/eslint/src/git-tree.ts"

const root = repoRoot()
const tracked = worktreeFiles(root)
const violations = findGestureViolations(tracked, (path) =>
  readFileSync(join(root, path), "utf8")
)

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(`[gestures] ${describeGestureViolation(violation)}\n`)
  }
  process.stderr.write(
    `[gestures] ${violations.length} violation(s). See packages/ui/shared/src/lib/pager (GES5).\n`
  )
  process.exitCode = 1
} else {
  process.stdout.write(`[gestures] ok (${tracked.length} files)\n`)
}
