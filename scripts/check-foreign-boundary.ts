#!/usr/bin/env node
// Guardrail: F1 (docs/monorepo-boundaries.md, "A port translates: the
// foreign boundary"). Counts the waits on a foreign API (a native plugin,
// `navigator`, `Notification`) outside `callForeign` in every source file and
// compares them with scripts/foreign-boundary.allowlist, exactly. The rule,
// and what it does not see, live in packages/eslint/src/foreign-boundary.ts.
//
// Uncached and whole-tree, like check-react-coordination.ts, and for the same
// reason: an allowlist entry is a fact about a file that may no longer exist.
// Wired into the root `lint` script and pr.yml's foreign-boundary job.
//
// Runs on Node's built-in type stripping: imports spell their `.ts` extension.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  ALLOWLIST_FILE,
  describeForeignBoundaryViolation,
  findForeignBoundaryViolations,
  foreignSites,
  isInScope,
} from "../packages/eslint/src/foreign-boundary.ts"

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
  const sites = foreignSites(path, readFileSync(absolute, "utf8"))
  if (sites > 0) actual.set(path, sites)
}

const allowlistPath = join(root, ALLOWLIST_FILE)
const violations = findForeignBoundaryViolations(
  actual,
  existsSync(allowlistPath) ? readFileSync(allowlistPath, "utf8") : ""
)

if (violations.length > 0) {
  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(
      `[foreign-boundary] ${describeForeignBoundaryViolation(violation)}`
    )
  }
  // eslint-disable-next-line no-console
  console.error(
    `[foreign-boundary] ${violations.length} violation(s). See docs/monorepo-boundaries.md, F1.`
  )
  process.exitCode = 1
} else {
  // eslint-disable-next-line no-console
  console.log(
    `[foreign-boundary] ok (${actual.size} files wait on a foreign API outside callForeign, all listed)`
  )
}
