#!/usr/bin/env node
// Guardrail: C1029 (owner, #3399). A generated asset lives on home and is
// served by URL, never in the repo, a bundle or the phone's disk. The rule,
// its exemptions, its debt and what it leaves to review live in
// packages/eslint/src/assets.ts.
//
//   node scripts/check-assets.ts [--base <ref>]
//
// The debt is held against the base ref's copy of the rule (`--base <ref>`,
// else `origin/main` where it exists), so it only shrinks. Wired into the
// root `lint` script and pr.yml's `guards` job, which CI Gate requires. Runs
// on Node's built-in type stripping, with no install (see
// scripts/check-test-layout.ts).
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  ASSETS_RULE_FILE,
  debtKeysIn,
  describeAssetViolation,
  findAssetViolations,
  findStaleExemptions,
} from "../packages/eslint/src/assets.ts"
// eslint-disable-next-line no-restricted-imports
import {
  gitOrNull,
  readBlobs,
  repoRoot,
  resolveBaseRef,
  worktreeFiles,
} from "../packages/eslint/src/git-tree.ts"

function main(): void {
  const root = repoRoot()
  const tracked = worktreeFiles(root)

  let baseDebt: Map<string, number> | null = null
  let held: string
  try {
    const { ref, resolved } = resolveBaseRef(root, process.argv.slice(2))
    const spec = `${ref}:${ASSETS_RULE_FILE}`
    const atBase =
      resolved && gitOrNull(root, ["cat-file", "-e", spec]) !== null
    if (atBase) {
      baseDebt = debtKeysIn(readBlobs(root, [spec]).get(spec) ?? "")
      if (baseDebt === null)
        throw new Error(`${spec} has no debt:start/debt:end markers`)
      held = `debt held against ${ref}`
    } else {
      held = resolved
        ? `debt not compared, ${ref} has no ${ASSETS_RULE_FILE}`
        : `debt not compared, no ${ref}`
    }
  } catch (error) {
    process.stderr.write(
      `[assets] ${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exitCode = 1
    return
  }

  const read = (path: string): string => readFileSync(join(root, path), "utf8")
  const violations = [
    ...findAssetViolations(tracked, read, baseDebt),
    ...findStaleExemptions(tracked, read),
  ]
  if (violations.length > 0) {
    for (const violation of violations) {
      process.stderr.write(`[assets] ${describeAssetViolation(violation)}\n`)
    }
    process.stderr.write(
      `[assets] ${violations.length} violation(s). See ${ASSETS_RULE_FILE} and #3399.\n`
    )
    process.exitCode = 1
  } else {
    process.stdout.write(`[assets] ok (${tracked.length} files; ${held})\n`)
  }
}

main()
