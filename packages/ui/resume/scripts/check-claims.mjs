#!/usr/bin/env node
// Claims regression check: prove the résumé's workspace counts and
// "production" language are still accurate, rather than remembered.
//
// Two things drift silently otherwise. Workspace membership changes every
// time a package is added or archived, so a hard-coded "24-crate" or
// "52-package" string in src/data/resume.typ is correct on the day it is
// written and false on every day after that until someone happens to
// re-read it. And a claim like "production APIs" reads very differently
// once you know the linked repository's own README says "no users, no
// traffic" — the 2026-08-29 ATS/positioning review flagged exactly this.
//
// So this script recomputes what it can (this repository's own workspace
// package and browser-extension counts) and fails if src/data/resume.typ's
// prose no longer matches, and separately scans that same file for a small
// forbidden/unqualified-term list the review named. It intentionally does
// NOT try to verify paulgsc/server's crate count: that repository is not
// checked out during this repository's CI, so src/data/resume.typ says "a
// multi-crate Rust workspace" instead of a number that this script could
// never actually check — see src/canon/resume.meta.typ's Counts note for
// the dated, manually-verified figure and how to re-derive it.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { packageDir } from "./typst.mjs"

const repoRoot = join(packageDir, "..", "..", "..")
const resumeSource = join(packageDir, "src", "data", "resume.typ")

// Mirrors pnpm-workspace.yaml's `packages:` globs. Not a general glob
// implementation — just enough to walk this repo's own layout, which is the
// only thing this check needs to agree with.
const WORKSPACE_ROOTS = [
  { glob: "packages/ui/*", depth: 1 },
  { glob: "apps/*", depth: 1 },
  { glob: "docs/canon", depth: 0 },
  { glob: "packages/*", depth: 1 },
  { glob: "crates/*", depth: 1 },
]

// The known-good counts as of the last recount (see resume.meta.typ's
// Counts section, which names the date and method). Update both places
// together when a recount genuinely changes the number.
const EXPECTED_PACKAGE_COUNT = 57
const EXPECTED_EXTENSION_COUNT = 6

function hasPackageJson(dir) {
  try {
    return statSync(join(dir, "package.json")).isFile()
  } catch {
    return false
  }
}

function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name))
  } catch {
    return []
  }
}

function countWorkspacePackages() {
  const found = new Set()

  for (const { glob, depth } of WORKSPACE_ROOTS) {
    const base = join(repoRoot, glob.replace(/\/\*$/, ""))
    if (depth === 0) {
      if (hasPackageJson(base)) found.add(base)
      continue
    }
    for (const dir of listDirs(base)) {
      if (hasPackageJson(dir)) found.add(dir)
    }
  }

  // extensions/** at any depth, excluding dist/ and node_modules/ — a
  // package.json can live several levels under extensions/ (e.g.
  // extensions/filter-classifier/...), unlike the single-level globs above.
  const stack = [join(repoRoot, "extensions")]
  while (stack.length) {
    const dir = stack.pop()
    if (dir.endsWith(`${"dist"}`) || dir.endsWith("node_modules")) continue
    if (hasPackageJson(dir)) found.add(dir)
    for (const child of listDirs(dir)) {
      if (child.endsWith("/dist") || child.endsWith("/node_modules")) continue
      stack.push(child)
    }
  }

  return found
}

// A shipped browser extension is a directory under extensions/ whose
// public/ carries an actual manifest JSON file — manifest.json for most,
// but suspender-ledger ships only manifest.firefox.json, so this matches
// the filename pattern rather than one exact name. Scoped to public/
// specifically so it doesn't also catch scripts/patch-test-manifest.mjs or
// this very script's comments.
function countBrowserExtensions() {
  const extensionsDir = join(repoRoot, "extensions")
  let count = 0
  for (const dir of listDirs(extensionsDir)) {
    let files
    try {
      files = readdirSync(join(dir, "public"))
    } catch {
      continue
    }
    if (files.some((name) => /^manifest.*\.json$/i.test(name))) count += 1
  }
  return count
}

// Forbidden outright: never supported by either repository, per the review.
const FORBIDDEN_TERMS = [
  "Entity Framework",
  "Kubernetes",
  "Spring Boot",
  "MongoDB",
  "Terraform",
  ".NET",
  "Azure",
  "SLA",
  "SLO",
  "on-call",
  "uptime",
  "high-volume",
]

function escapeRegExp(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Letter-boundary matched, not a bare substring check — "SLA" as a plain
// substring also matches inside "slack", which src/data/resume.typ uses
// legitimately ("informative slack" describing contract-harness findings).
// A lookaround on adjacent letters (rather than `\b`) is what lets this
// still catch ".NET", whose leading "." is not a word character itself.
function checkForbiddenTerms(text) {
  const offenders = FORBIDDEN_TERMS.filter((term) =>
    new RegExp(`(?<![A-Za-z])${escapeRegExp(term)}(?![A-Za-z])`, "i").test(text)
  )
  if (offenders.length) {
    throw new Error(
      `${relative(repoRoot, resumeSource)} names unsupported terms: ` +
        `${offenders.join(", ")}. Neither repository's evidence supports these ` +
        "— see the review's P1 'do not add' list."
    )
  }
}

// "production" is fine when it qualifies something ("production-oriented",
// "production-ready", "production backend service" is not, since it reads as
// a claim of live external usage — server/README.md says "no users, no
// traffic". Anything hyphenated right after the word is treated as a
// qualifier; bare "production" is not.
function checkUnqualifiedProduction(text) {
  const matches = [...text.matchAll(/\bproduction\b(?!-)/gi)]
  if (matches.length) {
    throw new Error(
      `${relative(repoRoot, resumeSource)} uses "production" unqualified ` +
        `${matches.length} time(s). Qualify it (production-oriented, ` +
        "production-ready, release-gated, ...) or cut it — this repository's " +
        "own systems have no external users or traffic to back an" +
        " unqualified production claim."
    )
  }
}

// A regression guard, not a fixer: this repo's package/crate counts drift
// with the workspace, and a bare number is stale the moment it's wrong.
// paulgsc/server's crate count can't be checked from here at all (separate
// repository, not part of this build) — src/data/resume.typ should never
// state one as a bare number for that reason.
function checkNoBareWorkspaceCounts(text) {
  const matches = [...text.matchAll(/\b\d[\d,]*[\s-](?:crates?|packages?)\b/gi)]
  if (matches.length) {
    throw new Error(
      `${relative(repoRoot, resumeSource)} states a bare workspace-size ` +
        `number: ${matches.map((m) => `"${m[0]}"`).join(", ")}. Say ` +
        '"a multi-crate Rust workspace" / "a TypeScript monorepo" instead, ' +
        "or move the exact count to src/canon/resume.meta.typ's Counts note " +
        "(dated, with its derivation method) rather than into rendered prose."
    )
  }
}

function main() {
  const text = readFileSync(resumeSource, "utf8")

  checkForbiddenTerms(text)
  checkUnqualifiedProduction(text)
  checkNoBareWorkspaceCounts(text)

  const packages = countWorkspacePackages()
  const extensions = countBrowserExtensions()

  if (packages.size !== EXPECTED_PACKAGE_COUNT) {
    const sample = [...packages].map((dir) => relative(repoRoot, dir)).sort()
    throw new Error(
      `Workspace has ${packages.size} packages, but ` +
        `scripts/check-claims.mjs and src/canon/resume.meta.typ's Counts note ` +
        `both say ${EXPECTED_PACKAGE_COUNT}. Update EXPECTED_PACKAGE_COUNT here ` +
        "and the Counts note together, with today's date and this script's " +
        `method.\nCurrently counted:\n  ${sample.join("\n  ")}`
    )
  }
  if (extensions !== EXPECTED_EXTENSION_COUNT) {
    throw new Error(
      `Workspace has ${extensions} browser extensions (public/manifest.json ` +
        `present), but scripts/check-claims.mjs and src/canon/resume.meta.typ's ` +
        `Counts note both say ${EXPECTED_EXTENSION_COUNT}. Update both together.`
    )
  }

  // eslint-disable-next-line no-console
  console.log(
    `[resume] claims check passed: ${packages.size} workspace packages, ` +
      `${extensions} browser extensions, no forbidden terms, no unqualified ` +
      "production claims, no bare workspace-size numbers in resume content"
  )
}

main()
