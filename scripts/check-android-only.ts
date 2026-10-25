#!/usr/bin/env node
// Guardrail: the tokens of "The phone is Android, and only Android" (CLAUDE.md,
// "The phone and the desktop web are separate surfaces"). The rule, and what it
// leaves to review, live in packages/eslint/src/android-only.ts.
//
// Wired into the root `lint` script and pr.yml's `android-only` job, which CI
// Gate requires. Runs on Node's built-in type stripping, with no install (see
// scripts/check-test-layout.ts).
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  describeAndroidOnlyViolation,
  findAndroidOnlyViolations,
} from "../packages/eslint/src/android-only.ts"
// eslint-disable-next-line no-restricted-imports
import { repoRoot, worktreeFiles } from "../packages/eslint/src/git-tree.ts"

const root = repoRoot()
const tracked = worktreeFiles(root)
const violations = findAndroidOnlyViolations(tracked, (path) =>
  readFileSync(join(root, path), "utf8")
)

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(
      `[android-only] ${describeAndroidOnlyViolation(violation)}\n`
    )
  }
  process.stderr.write(
    `[android-only] ${violations.length} violation(s). See CLAUDE.md, "The phone and the desktop web are separate surfaces".\n`
  )
  process.exitCode = 1
} else {
  process.stdout.write(`[android-only] ok (${tracked.length} files)\n`)
}
