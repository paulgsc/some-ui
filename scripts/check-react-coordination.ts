#!/usr/bin/env node
// Guardrail: R1 (docs/monorepo-boundaries.md, "Inside a React package: the
// component is not the coordinator"). Counts the await/promise-chain sites in
// every React module and compares them with scripts/react-coordination.allowlist,
// exactly. The rule, and why it is a count and not a verdict, live in
// packages/eslint/src/react-coordination.ts.
//
// Uncached and whole-tree, like check-test-layout.ts: a stale allowlist entry
// is a fact about a file that may no longer exist. Checks every tracked file
// plus untracked, non-ignored ones. Wired into the root `lint` script and the
// Node CI job in pr.yml. Needs an install (the TypeScript parser), so unlike
// test-layout it is a step in that job rather than a job of its own.
//
// Runs on Node's built-in type stripping: imports spell their `.ts` extension.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  ALLOWLIST_FILE,
  coordinationSites,
  describeCoordinationViolation,
  findCoordinationViolations,
  isInScope,
} from "../packages/eslint/src/react-coordination.ts"

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim()
const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
)

const actual = new Map<string, number>()
for (const path of listed.split("\0")) {
  if (path === "" || !isInScope(path)) continue
  const absolute = join(root, path)
  // Listed but deleted in the working tree (see check-test-layout.ts).
  if (!existsSync(absolute)) continue
  const sites = coordinationSites(path, readFileSync(absolute, "utf8"))
  if (sites !== null && sites > 0) actual.set(path, sites)
}

const allowlistPath = join(root, ALLOWLIST_FILE)
const violations = findCoordinationViolations(
  actual,
  existsSync(allowlistPath) ? readFileSync(allowlistPath, "utf8") : ""
)

if (violations.length > 0) {
  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(
      `[react-coordination] ${describeCoordinationViolation(violation)}`
    )
  }
  // eslint-disable-next-line no-console
  console.error(
    `[react-coordination] ${violations.length} violation(s). See docs/monorepo-boundaries.md, R1.`
  )
  process.exitCode = 1
} else {
  // eslint-disable-next-line no-console
  console.log(
    `[react-coordination] ok (${actual.size} React modules coordinate, all listed)`
  )
}
