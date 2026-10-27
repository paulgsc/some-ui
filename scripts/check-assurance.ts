#!/usr/bin/env node
// Guardrail: the assurance ledger (docs/operational-assurance.md). Its shape,
// that a promise that holds names a proof that exists and one that does not
// names its issue, that every server route module is placed, and the ratchet
// against the base branch's ledger. The rules live in
// packages/assurance/src/rules.ts.
//
//   node scripts/check-assurance.ts [--base <ref>]
//
// The ratchet compares with the base ref's ledger (`--base <ref>`, else
// `origin/main` where it exists). Wired into the root `lint` script and
// pr.yml's `assurance` job, which CI Gate needs. Runs on Node's built-in type
// stripping, with no install (see scripts/check-test-layout.ts).
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Relative imports on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  parseLedger,
  readLedgerLeniently,
} from "../packages/assurance/src/ledger.ts"
// eslint-disable-next-line no-restricted-imports
import type { Ledger } from "../packages/assurance/src/ledger.ts"
// eslint-disable-next-line no-restricted-imports
import type { Finding } from "../packages/assurance/src/rules.ts"
// eslint-disable-next-line no-restricted-imports
import {
  findLedgerViolations,
  findRatchetViolations,
} from "../packages/assurance/src/rules.ts"
// eslint-disable-next-line no-restricted-imports
import {
  gitOrNull,
  repoRoot,
  resolveBaseRef,
  worktreeFiles,
} from "../packages/eslint/src/git-tree.ts"
// eslint-disable-next-line no-restricted-imports
import { parseDeclarations } from "../packages/eslint/src/policy-docs.ts"

const LEDGER = "packages/assurance/src/ledger.json"
const ROUTES = "packages/contract-harness/routes.server.json"

const out = (line: string): void => void process.stdout.write(`${line}\n`)
const err = (line: string): void => void process.stderr.write(`${line}\n`)

function read(text: string, where: string): Ledger {
  const parsed = parseLedger(JSON.parse(text))
  if (!parsed.ok) {
    throw new Error(
      `${where} is not a ledger:\n  ${parsed.problems.join("\n  ")}`
    )
  }
  return parsed.ledger
}

function routeModules(root: string): Array<string> {
  const snapshot: unknown = JSON.parse(readFileSync(join(root, ROUTES), "utf8"))
  const routes =
    typeof snapshot === "object" && snapshot !== null
      ? Reflect.get(snapshot, "routes")
      : undefined
  if (!Array.isArray(routes)) throw new Error(`${ROUTES} has no routes`)
  return routes.map((route: unknown, i) => {
    const module =
      typeof route === "object" && route !== null
        ? Reflect.get(route, "module")
        : undefined
    if (typeof module !== "string")
      throw new Error(`${ROUTES} route ${i} has no module`)
    return module
  })
}

function declaredIds(root: string, files: ReadonlyArray<string>): Set<string> {
  const ids = new Set<string>()
  for (const path of files) {
    if (!path.endsWith(".md")) continue
    const text = readFileSync(join(root, path), "utf8")
    for (const declaration of parseDeclarations(path, text))
      ids.add(declaration.id)
  }
  return ids
}

/**
 * The base ref's ledger, read leniently: an older grammar wrote it, and this
 * PR may be the one changing the grammar. Null when the base has none.
 */
function baseLedger(root: string, ref: string): Ledger | null {
  if (gitOrNull(root, ["cat-file", "-e", `${ref}:${LEDGER}`]) === null)
    return null
  const text = gitOrNull(root, ["show", `${ref}:${LEDGER}`])
  if (text === null) throw new Error(`could not read ${LEDGER} at ${ref}`)
  const ledger = readLedgerLeniently(JSON.parse(text))
  if (!ledger) throw new Error(`${LEDGER} at ${ref} is not an object`)
  return ledger
}

function main(): void {
  const root = repoRoot()
  let findings: Array<Finding>
  let held: string
  try {
    const ledger = read(readFileSync(join(root, LEDGER), "utf8"), LEDGER)
    const files = worktreeFiles(root)
    const tracked = new Set(files)
    findings = [
      ...findLedgerViolations(ledger, {
        isFile: (path) => tracked.has(path),
        exists: (path) =>
          tracked.has(path) ||
          files.some((file) => file.startsWith(`${path.replace(/\/$/, "")}/`)),
        contains: (path, text) =>
          readFileSync(join(root, path), "utf8").includes(text),
        routeModules: routeModules(root),
        declaredIds: declaredIds(root, files),
      }),
    ]
    const { ref, resolved } = resolveBaseRef(root, process.argv.slice(2))
    const base = resolved ? baseLedger(root, ref) : null
    if (base) findings.push(...findRatchetViolations(base, ledger))
    held = base
      ? `held against ${ref}`
      : resolved
        ? `${ref} has no ledger to hold it against`
        : `not compared, no ${ref}`
  } catch (error) {
    err(`[assurance] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }

  const errors = findings.filter((f) => f.level === "error")
  for (const { id, message, level } of findings)
    err(
      `[assurance] ${level === "warning" ? "warning: " : ""}${id}: ${message}`
    )
  if (errors.length > 0) {
    err(
      `[assurance] ${errors.length} finding(s). See docs/operational-assurance.md, "What \`pnpm check:assurance\` holds".`
    )
    process.exitCode = 1
  } else {
    out(`[assurance] ok (${held})`)
  }
}

main()
