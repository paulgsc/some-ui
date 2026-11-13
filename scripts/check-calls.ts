#!/usr/bin/env node
// Guardrail: the calls record (ST37, #2637). The rule lives in
// packages/eslint/src/calls.ts.
//
//   node scripts/check-calls.ts [--base <ref>]
//
// docs/calls.json's shape, and that it only grew since the base ref's
// (`--base <ref>`, else `origin/main` where it exists; a base without the file
// holds nothing). Wired into the root `lint` script and pr.yml's `guards`
// job, which CI Gate requires. Runs on Node's built-in type stripping, with no
// install (see scripts/check-test-layout.ts).
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  CALLS_FILE,
  describeCallsFinding,
  ratchetCalls,
  readCalls,
} from "../packages/eslint/src/calls.ts"
// eslint-disable-next-line no-restricted-imports
import {
  gitOrNull,
  repoRoot,
  resolveBaseRef,
} from "../packages/eslint/src/git-tree.ts"

function fail(lines: ReadonlyArray<string>): void {
  for (const line of lines) process.stderr.write(`[calls] ${line}\n`)
  process.stderr.write(
    `[calls] ${lines.length} problem(s). See CLAUDE.md, "Two kinds of pull request".\n`
  )
  process.exitCode = 1
}

function main(): void {
  const root = repoRoot()
  const head = readCalls(readFileSync(join(root, CALLS_FILE), "utf8"))
  if (head.calls === null) {
    fail(head.findings.map(describeCallsFinding))
    return
  }
  let held = "not compared, no base"
  let findings: Array<string> = []
  try {
    const { ref, resolved } = resolveBaseRef(root, process.argv.slice(2))
    if (resolved) {
      const text = gitOrNull(root, ["show", `${ref}:${CALLS_FILE}`])
      if (text === null) {
        held = `not compared, ${ref} has no ${CALLS_FILE}`
      } else {
        const base = readCalls(text)
        if (base.calls === null)
          throw new Error(`${CALLS_FILE} at ${ref} cannot be read`)
        findings = ratchetCalls(base.calls, head.calls).map(
          describeCallsFinding
        )
        held = `held against ${ref}`
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
