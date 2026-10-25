#!/usr/bin/env node
// Guardrail: what the policy documents' text can hold (CLAUDE.md, "Gray-area
// invariants: declare them falsifiable"). The rules, and why this is a script
// and not an ESLint rule, live in packages/eslint/src/policy-docs.ts.
//
//   node scripts/check-policy-docs.ts [--base <ref>]
//
// Reads every tracked `*.md` plus untracked, non-ignored ones, uncached (a
// verdict depends on other files). The invariant IDs are held against the base
// ref's (`--base <ref>`, else `origin/main` where it exists). Wired into the
// root `lint` script and pr.yml's `policy-docs` job, which CI Gate requires.
//
// Runs on Node's built-in type stripping, with no install (see
// scripts/check-test-layout.ts).
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { resolveBaseRef } from "../packages/eslint/src/base-ref.ts"
import {
  declaredId,
  describePolicyViolation,
  findInvariantViolations,
  findReferenceViolations,
} from "../packages/eslint/src/policy-docs.ts"

const out = (line: string): void => void process.stdout.write(`${line}\n`)
const err = (line: string): void => void process.stderr.write(`${line}\n`)

/** Whether `error` is a child process that exited with `status`. */
function exitedWith(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === status
  )
}

/** The IDs declared in the base ref's markdown, which must still be declared. */
function baseIds(root: string, ref: string): Set<string> {
  let output: string
  try {
    output = execFileSync(
      "git",
      [
        "grep",
        "-I",
        "-h",
        "-E",
        "^[> \t]*\\*\\*[A-Z]{1,4}[0-9]+( \\((not reviewable|retired)\\))?:[[:space:]]",
        ref,
        "--",
        "*.md",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  } catch (error) {
    // `git grep` exits 1 when nothing matches: a base with no declarations.
    if (exitedWith(error, 1)) return new Set()
    throw new Error(`could not read the invariant IDs at ${ref}`, {
      cause: error,
    })
  }
  const ids = new Set<string>()
  for (const line of output.split("\n")) {
    const id = declaredId(line)
    if (id !== null) ids.add(id)
  }
  return ids
}

function main(): void {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim()
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  // `--cached` still lists a file deleted in the working tree until the
  // deletion is staged: describe the tree as it is now.
  const tracked = listed
    .split("\0")
    .filter((path) => path !== "" && existsSync(join(root, path)))
  const docs = new Map<string, string>()
  for (const path of tracked) {
    if (path.endsWith(".md"))
      docs.set(path, readFileSync(join(root, path), "utf8"))
  }

  let base: Set<string> | null
  let held: string
  try {
    const { ref, resolved } = resolveBaseRef(root, process.argv.slice(2))
    base = resolved ? baseIds(root, ref) : null
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
