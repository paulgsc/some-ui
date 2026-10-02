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
//
// The same problem applies to this repository's own package count when
// SOME_UI_PRUNED_WORKSPACE is set (apps/www/Dockerfile's release build,
// via `turbo prune www --docker`): only the packages reachable from www's
// dependency graph are on disk there, so a filesystem recount would always
// read wrong through no fault of resume.typ. The text-content checks below
// don't depend on which packages are present, so they still run.
//
// Route figures are the third thing that drifts. The server's route snapshot
// (packages/contract-harness/routes.server.json) now arrives by bot PR on
// every server merge, so any route count a person typed is stale the next
// time the server adds one. checkRouteFigures() holds every route figure in
// resume.typ and the harness README to that snapshot and to the harness's own
// coverage report. Prefer figures that cannot go stale (a floor like "40+",
// or none) over exact ones: an exact count fails this check on the next
// server merge.
//
// That is why package.json lists @some-ui/contract-harness as a
// devDependency with no import behind it (knip.json ignores it there): it
// makes this package a dependent of the harness, so PR CI's
// `--filter=...[HEAD^1]` rebuilds the résumé, and runs this check, on the
// bot's snapshot-sync PR itself rather than only on the next trunk sweep.
// turbo.json's `inputs` do the same for a local turbo cache.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { packageDir } from "./typst.mjs"

const repoRoot = join(packageDir, "..", "..", "..")
const resumeSource = join(packageDir, "src", "data", "resume.typ")
const harnessDir = join(repoRoot, "packages", "contract-harness")
const routeSnapshot = join(harnessDir, "routes.server.json")
const harnessReadme = join(harnessDir, "README.md")

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
const EXPECTED_PACKAGE_COUNT = 50
const EXPECTED_EXTENSION_COUNT = 6

// Set by apps/www/Dockerfile's release build, whose `turbo prune` step
// leaves only the packages www's dependency graph reaches on disk.
const WORKSPACE_PRUNED = process.env.SOME_UI_PRUNED_WORKSPACE === "1"

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

// "15 of 52 routes", "21/42 inventoried routes": a coverage fraction.
const ROUTE_FRACTION =
  /\b(\d+)\s*(?:of|\/)\s*(\d+)((?:[\s-]+(?:inventoried|server|HTTP|API))*[\s-]+routes?)\b/gi
// "42 inventoried HTTP operations", "40+ operation service surface".
const ROUTE_COUNT =
  /\b(\d+)(\+?)((?:[\s-]+(?:inventoried|server|HTTP|API|method\/path))*[\s-]+(?:operations?|routes?))\b/gi

function readRouteTotal() {
  const snapshot = JSON.parse(readFileSync(routeSnapshot, "utf8"))
  if (!Array.isArray(snapshot.routes)) {
    throw new Error(`${relative(repoRoot, routeSnapshot)} has no routes array`)
  }
  return snapshot.routes.length
}

// The harness's own coverage report, not a re-implementation of its
// contract-to-route matching: a second copy of that rule is one more thing
// to drift. Only run when a fraction is actually stated.
function readCoverage() {
  const tsx = join(harnessDir, "node_modules", ".bin", "tsx")
  const result = spawnSync(tsx, ["src/cli.ts", "--drift-only", "--json"], {
    cwd: harnessDir,
    encoding: "utf8",
  })
  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    throw new Error(
      "Could not read the contract harness's coverage report " +
        `(${relative(repoRoot, tsx)} src/cli.ts --drift-only --json): ` +
        `${result.error?.message ?? result.stderr ?? "no JSON on stdout"}`
    )
  }
  const { covered, total } = report.drift ?? {}
  if (!Number.isInteger(covered) || !Number.isInteger(total)) {
    throw new Error(
      "The contract harness's coverage report has no covered/total"
    )
  }
  return { covered, total }
}

function checkRouteFigures(files) {
  const routeTotal = readRouteTotal()
  let coverage
  const problems = []

  for (const file of files) {
    let text = readFileSync(file, "utf8")
    const where = relative(repoRoot, file)

    for (const match of text.matchAll(ROUTE_FRACTION)) {
      coverage ??= readCoverage()
      const [claim, covered, total] = match
      if (
        Number(covered) !== coverage.covered ||
        Number(total) !== coverage.total
      ) {
        problems.push(
          `${where}: "${claim}", but contract:coverage reports ` +
            `${coverage.covered} of ${coverage.total}`
        )
      }
    }
    // A fraction's denominator is also a bare "N routes"; don't judge it twice.
    text = text.replace(ROUTE_FRACTION, "")

    for (const match of text.matchAll(ROUTE_COUNT)) {
      const [claim, count, floor] = match
      const holds = floor
        ? routeTotal >= Number(count)
        : routeTotal === Number(count)
      if (!holds) {
        problems.push(
          `${where}: "${claim}", but ${relative(repoRoot, routeSnapshot)} ` +
            `lists ${routeTotal} routes`
        )
      }
    }
  }

  if (problems.length) {
    throw new Error(
      `Route figures disagree with the server's route snapshot:\n  ` +
        `${problems.join("\n  ")}\nState a floor ("40+") or no count at all ` +
        "rather than an exact figure: the snapshot changes on every server " +
        "merge, and an exact figure is wrong the next time it does."
    )
  }
  return { routeTotal, coverage }
}

function main() {
  const text = readFileSync(resumeSource, "utf8")

  checkForbiddenTerms(text)
  checkUnqualifiedProduction(text)
  checkNoBareWorkspaceCounts(text)

  // The pruned release build may not carry the harness at all; a full
  // checkout must, so a missing snapshot there is a failure, not a skip.
  if (WORKSPACE_PRUNED && !existsSync(routeSnapshot)) {
    // eslint-disable-next-line no-console
    console.log(
      "[resume] claims check passed: no forbidden terms, no unqualified " +
        "production claims, no bare workspace-size numbers in resume " +
        "content (workspace/extension package counts and route figures " +
        "skipped — SOME_UI_PRUNED_WORKSPACE is set)"
    )
    return
  }

  const { routeTotal } = checkRouteFigures([resumeSource, harnessReadme])

  if (WORKSPACE_PRUNED) {
    // eslint-disable-next-line no-console
    console.log(
      "[resume] claims check passed: no forbidden terms, no unqualified " +
        "production claims, no bare workspace-size numbers in resume " +
        `content, route figures agree with ${routeTotal} snapshot routes ` +
        "(workspace/extension package counts skipped — " +
        "SOME_UI_PRUNED_WORKSPACE is set)"
    )
    return
  }

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
      `${extensions} browser extensions, route figures agree with ` +
      `${routeTotal} snapshot routes, no forbidden terms, no unqualified ` +
      "production claims, no bare workspace-size numbers in resume content"
  )
}

main()
