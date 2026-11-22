#!/usr/bin/env node
// Guardrail: the calls record (ST37, #2637, #2976). The rule lives in
// packages/eslint/src/calls.ts; the record is read by calls-record.ts.
//
//   node scripts/check-calls.ts [--base <ref>]
//
// docs/calls/: every file `C<n>.json`, named for the one call it holds, each
// call in shape; and the record only grew since the base ref's (`--base
// <ref>`, else `origin/main` where it exists), read in whichever layout the
// base holds, so a base from before the split is held too (a base with no
// record holds nothing). Wired into the root `lint` script and pr.yml's
// `guards` job, which CI Gate requires. Runs on Node's built-in type
// stripping, with no install (see scripts/check-test-layout.ts).

// Relative imports on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  callsAtCommit,
  callsInTree,
} from "../packages/eslint/src/calls-record.ts"
// eslint-disable-next-line no-restricted-imports
import {
  CALLS_DIR,
  describeCallsFinding,
  ratchetCalls,
} from "../packages/eslint/src/calls.ts"
// eslint-disable-next-line no-restricted-imports
import { repoRoot, resolveBaseRef } from "../packages/eslint/src/git-tree.ts"

function fail(lines: ReadonlyArray<string>): void {
  for (const line of lines) process.stderr.write(`[calls] ${line}\n`)
  process.stderr.write(
    `[calls] ${lines.length} problem(s). See CLAUDE.md, "Two kinds of pull request".\n`
  )
  process.exitCode = 1
}

function main(): void {
  const root = repoRoot()
  const head = callsInTree(root)
  if (head.layout !== "folder") {
    fail([`${CALLS_DIR}/ is missing: the record is one file per call there.`])
    return
  }
  if (head.calls === null) {
    fail(head.findings.map(describeCallsFinding))
    return
  }
  let held = "not compared, no base"
  let findings: Array<string> = []
  try {
    const { ref, resolved } = resolveBaseRef(root, process.argv.slice(2))
    if (resolved) {
      const base = callsAtCommit(root, ref)
      if (base.layout === "none") {
        held = `not compared, ${ref} has no record`
      } else {
        if (base.calls === null)
          throw new Error(`the record at ${ref} cannot be read`)
        findings = ratchetCalls(base.calls, head.calls).map(
          describeCallsFinding
        )
        held = `held against ${ref}${base.layout === "array" ? "'s one-array file" : ""}`
      }
    }
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)])
    return
  }
  if (findings.length > 0) {
    fail(findings)
    return
  }
  process.stdout.write(`[calls] ok (${head.calls.length} calls, ${held})\n`)
}

main()
