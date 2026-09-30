#!/usr/bin/env node
// Guardrail over .github/: artifact retention (CLAUDE.md, "Workflow
// storage"), and the RS1 fingerprint and RS2 branch-name checks (CLAUDE.md,
// "Cross-repo coupling"). The rules live in
// packages/eslint/src/workflow-guards.ts.
//
// Wired into the root `lint` script and into pr.yml as its own job, which runs
// on every PR and which CI Gate requires. Like check-test-layout.ts, it runs on
// Node's built-in type stripping with no install, and reads tracked plus
// untracked, non-ignored files, so it describes the tree as it is now.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  checkRs1,
  describeWorkflowViolation,
  findRetentionViolations,
  findRs2Violations,
  isGuardedWorkflowPath,
  RS1_FILE,
  type WorkflowViolation,
} from "../packages/eslint/src/workflow-guards.ts"

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim()
const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z", ".github"],
  { cwd: root, encoding: "utf8" }
)
const files = listed
  .split("\0")
  .filter(
    (path) =>
      path !== "" && isGuardedWorkflowPath(path) && existsSync(join(root, path))
  )

const violations: Array<WorkflowViolation> = []
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8")
  violations.push(...findRetentionViolations(file, text))
  violations.push(...findRs2Violations(file, text))
}
const rs1Path = join(root, RS1_FILE)
violations.push(
  ...checkRs1(existsSync(rs1Path) ? readFileSync(rs1Path, "utf8") : null)
)

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`[workflows] ${describeWorkflowViolation(violation)}`)
  }
  console.error(`[workflows] ${violations.length} violation(s).`)
  process.exitCode = 1
} else {
  console.log(`[workflows] ok (${files.length} files)`)
}
