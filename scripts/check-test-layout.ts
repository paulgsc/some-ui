#!/usr/bin/env node
// Guardrail: the test-layout convention (#772, #1475). At most one *.test.*
// file per source directory (more go to <dir>/__tests__/), and none in a
// src/routes/ tree outside __tests__/. The rule itself, and why it is not an
// ESLint rule, live in packages/eslint/src/test-layout.ts.
//
// Uncached and whole-tree on purpose: the verdict for one file depends on its
// siblings, which is exactly what a per-file, content-keyed lint cache cannot
// see. Checks every tracked file plus untracked, non-ignored ones, so a stray
// test fails `pnpm check:test-layout` locally before it is ever committed.
// Wired into the root `lint` script and into pr.yml as its own job, which
// runs on every PR (extension-only ones included) and which CI Gate requires.
//
// Runs on Node's built-in type stripping (on by default since Node 22.18 and
// 23.6; the nix CI shell ships nodejs_latest), with no install: no enums,
// namespaces or path aliases here or in the imported module, and imports
// spell their `.ts` extension.
import { repoRoot, worktreeFiles } from "../packages/eslint/src/git-tree.ts"
import {
  describeTestLayoutViolation,
  findTestLayoutViolations,
} from "../packages/eslint/src/test-layout.ts"

const violations = findTestLayoutViolations(worktreeFiles(repoRoot()))

if (violations.length > 0) {
  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(`[test-layout] ${describeTestLayoutViolation(violation)}`)
  }
  // eslint-disable-next-line no-console
  console.error(
    `[test-layout] ${violations.length} violation(s). See CLAUDE.md "Test layout".`
  )
  process.exitCode = 1
} else {
  // eslint-disable-next-line no-console
  console.log("[test-layout] ok")
}
