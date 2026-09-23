#!/usr/bin/env tsx
// Guardrail: the test-layout convention (#772, #1475). At most one *.test.*
// file per source directory (more go to <dir>/__tests__/), and none in a
// src/routes/ tree outside __tests__/. The rule itself, and why it is not an
// ESLint rule, live in packages/eslint/src/test-layout.ts.
//
// Uncached and whole-tree on purpose: the verdict for one file depends on its
// siblings, which is exactly what a per-file, content-keyed lint cache cannot
// see. Checks every tracked file plus untracked, non-ignored ones, so a stray
// test fails `pnpm check:test-layout` locally before it is ever committed.
// Wired into the root `lint` script and into pr.yml as a repo-wide guardrail
// next to the catalog-drift check.
import { execFileSync } from "node:child_process"

import {
  describeTestLayoutViolation,
  findTestLayoutViolations,
} from "../packages/eslint/src/test-layout.ts"

const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
)
const violations = findTestLayoutViolations(listed.split("\0").filter(Boolean))

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
