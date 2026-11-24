/**
 * CD1 (`.github/workflows/_detect-changes.yml`): a flag is true only when a
 * changed file matches one of its patterns. pr.yml runs Rust CI, the Node
 * jobs, the render stage and the deny checks on these flags, so a flag that
 * fires for a file it does not name pays for jobs the PR cannot fail.
 *
 * Family: every filter × {only Markdown, only files no filter names, one file
 * the filter names}, and for `node` every workspace the Node jobs reach,
 * read from the workspace graph (turbo selects a package for any file in
 * it), and every node-e2e filter, read by its step in pr.yml.
 *
 * The matching is the action's own: dorny/paths-filter v4.0.3 compiles each
 * pattern with picomatch 2.3.1 (its lockfile's) under
 * `{ dot: true }`, under the step's `predicate-quantifier` (`some` for the
 * job flags, `some-with-excludes` for node-e2e's), as its src/filter.ts
 * does.
 * `findPathsFilterViolations` in workflow-guards.ts is the lexical half: it
 * fails the leading `!` that broke this under `some`.
 *
 * Pinned here at 2.3.2, the 2.x security release for CVE-2026-33671 and
 * CVE-2026-33672 (#3392, #3393). It changes only nested or repeated extglob
 * quantifiers and POSIX classes; these filters use neither (their only
 * extglob is `!(*.md)`, a single negation), so it matches as the action's 2.3.1 does.
 * Stay on the action's major: 4.x is a different matcher.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { worktreeFiles } from "@eslint/git-tree.js"
import { reachableDirs } from "@eslint/vestiges.js"
import picomatch from "picomatch"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const WORKFLOW = join(ROOT, ".github/workflows/_detect-changes.yml")

// Narrowed at runtime, so a reshaped workflow fails here rather than reading
// as no filters at all.
function map(value: unknown, what: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not a map`)
  }
  return Object.fromEntries(Object.entries(value))
}

function list(value: unknown, what: string): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) throw new Error(`${what} is not a list`)
  return value
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Error(`${what} is not a string`)
  return value
}

type FilterStep = {
  readonly id: string
  readonly quantifier: string
  readonly filters: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
}

function filterSteps(): ReadonlyArray<FilterStep> {
  const jobs = map(
    map(parse(readFileSync(WORKFLOW, "utf8")), "workflow").jobs,
    "jobs"
  )
  const found: Array<FilterStep> = []
  for (const job of Object.values(jobs)) {
    for (const step of list(map(job, "job").steps, "steps")) {
      const fields = map(step, "step")
      if (!String(fields.uses).startsWith("dorny/paths-filter@")) continue
      const withMap = map(fields.with, "the step's with")
      found.push({
        id: text(fields.id, "the step's id"),
        quantifier:
          withMap["predicate-quantifier"] === undefined
            ? "some"
            : text(withMap["predicate-quantifier"], "predicate-quantifier"),
        filters: Object.entries(
          map(parse(text(withMap.filters, "filters")), "filters")
        ).map(
          ([name, patterns]) =>
            [name, list(patterns, name).map((p) => text(p, name))] as const
        ),
      })
    }
  }
  return found
}

const steps = filterSteps()

// dorny/paths-filter's `isMatch` (src/filter.ts) for the two quantifiers
// this workflow uses. Under `some` a file counts when any pattern matches
// it; under `some-with-excludes` when a positive pattern matches it and no
// negated one names it. picomatch inverts a negated pattern's matcher, so
// "names it" is that matcher returning false.
function matches(
  quantifier: string,
  patterns: ReadonlyArray<string>,
  file: string
): boolean {
  const matchers = patterns.map((p) => ({
    negated: p.startsWith("!"),
    test: picomatch(p, { dot: true }),
  }))
  switch (quantifier) {
    case "some": {
      return matchers.some((m) => m.test(file))
    }
    case "some-with-excludes": {
      if (matchers.some((m) => m.negated && !m.test(file))) return false
      return matchers.some((m) => !m.negated && m.test(file))
    }
    default: {
      throw new Error(`no matching for quantifier ${quantifier}`)
    }
  }
}

function stepFlags(
  id: string,
  changed: ReadonlyArray<string>
): Record<string, boolean> {
  const step = steps.find((s) => s.id === id)
  if (!step) throw new Error(`no paths-filter step ${id}`)
  return Object.fromEntries(
    step.filters.map(([name, patterns]) => [
      name,
      changed.some((file) => matches(step.quantifier, patterns, file)),
    ])
  )
}

const flags = (changed: ReadonlyArray<string>): Record<string, boolean> =>
  stepFlags("filter", changed)
const e2eFlags = (changed: ReadonlyArray<string>): Record<string, boolean> =>
  stepFlags("e2e", changed)

const NONE = {
  rust: false,
  node: false,
  extensions: false,
  wasm: false,
  render: false,
  lockfile: false,
  ci: false,
}
const E2E = [
  "sw",
  "ui_fit",
  "csp",
  "local_mode",
  "session_viewport",
  "composer",
  "record",
  "motion",
  "mic",
  "snips_settle",
] as const
const NO_E2E = Object.fromEntries(E2E.map((name) => [name, false]))

// The workspaces the Node jobs reach: every workspace outside extensions/
// (extension.yml verifies those), and every workspace one of them names as
// a dependency, transitively.
function reachedWorkspaces(): ReadonlyArray<string> {
  const globs = list(
    map(
      parse(readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8")),
      "pnpm-workspace.yaml"
    ).packages,
    "packages"
  ).map((g) => text(g, "a workspace glob"))
  const included = picomatch(
    globs.filter((g) => !g.startsWith("!")).map((g) => `${g}/package.json`)
  )
  const excluded = picomatch(
    globs
      .filter((g) => g.startsWith("!"))
      .map((g) => `${g.slice(1)}/package.json`)
  )
  const workspaces = worktreeFiles(ROOT, ["."])
    .filter((file) => included(file) && !excluded(file))
    .map((file) => {
      const dir = file.slice(0, -"/package.json".length)
      const manifest = map(
        JSON.parse(readFileSync(join(ROOT, file), "utf8")),
        file
      )
      return {
        dir,
        name: text(manifest.name, `${file}'s name`),
        deps: ["dependencies", "devDependencies", "peerDependencies"].flatMap(
          (key) =>
            manifest[key] === undefined
              ? []
              : Object.keys(map(manifest[key], key))
        ),
        deployable: !dir.startsWith("extensions/"),
      }
    })
  const reached = reachableDirs(workspaces)
  return [...reached].sort()
}

describe("CD1: a change-detection flag is true only for a file it names", () => {
  it("reads both filter steps the workflow declares, and their quantifiers", () => {
    expect(steps.map((s) => [s.id, s.quantifier])).toEqual([
      ["filter", "some"],
      ["e2e", "some-with-excludes"],
    ])
    expect(steps[0]?.filters.map(([name]) => name).sort()).toEqual(
      Object.keys(NONE).sort()
    )
    expect(steps[1]?.filters.map(([name]) => name).sort()).toEqual(
      [...E2E].sort()
    )
  })

  it("sets no flag for a change that is only Markdown outside every filter's trees", () => {
    const changed = [
      "CLAUDE.md",
      "README.md",
      "docs/ci-architecture.md",
      ".claude/skills/coordinate/SKILL.md",
    ]
    expect(e2eFlags(changed)).toEqual(NO_E2E)
    expect(flags(changed)).toEqual(NONE)
  })

  it("sets no flag for files no filter names (#3376: calls and a doc's data)", () => {
    expect(
      e2eFlags(["docs/calls/C1021.json", ".github/workflows/pr.yml"])
    ).toEqual(NO_E2E)
    expect(
      flags([
        "docs/calls/C1021.json",
        "docs/calls/C1022.json",
        "docs/decisions.json",
        ".claude/settings.json",
        "AGENTS.md",
      ])
    ).toEqual(NONE)
  })

  // Markdown inside a tree a filter names. `node` keeps a workspace's
  // Markdown, which its source may import (`?raw`) and its checks may read;
  // `rust` leaves a crate's out, which no crate reads.
  it.each([
    [
      "crates/leetype-engine/README.md",
      { ...NONE, extensions: true, wasm: true },
    ],
    ["nix/README.md", { ...NONE, ci: true }],
    [
      "packages/ui/topik/src/lib/topik/generation/lesson-prompt.md",
      { ...NONE, node: true, render: true },
    ],
  ])("Markdown in a named tree: %s", (file, expected) => {
    expect(flags([file])).toEqual(expected)
  })

  it.each([
    ["crates/leetype-engine/src/lib.rs", "rust"],
    ["Cargo.lock", "rust"],
    ["deny.toml", "rust"],
    ["clippy.toml", "rust"],
    ["scripts/check-mutation-boundary.sh", "rust"],
    ["turbo.json", "node"],
    ["pnpm-workspace.yaml", "node"],
    ["pnpm-lock.yaml", "lockfile"],
    ["packages/ui/topik/package.json", "lockfile"],
    ["scripts/audit-node-licenses.mjs", "lockfile"],
    ["scripts/check-catalog-drift.mjs", "node"],
    ["extensions/some-filter/src/x.ts", "extensions"],
    ["crates/leetype-engine/Cargo.toml", "wasm"],
    ["infra/render/build.sh", "render"],
    [".github/workflows/pr.yml", "ci"],
    ["flake.lock", "ci"],
  ])("a file it names sets the flag: %s → %s", (file, flag) => {
    expect(flags([file])[flag]).toBe(true)
  })

  it.each(reachedWorkspaces())(
    "`node` covers every file of a workspace the Node jobs reach: %s",
    (dir) => {
      for (const file of [
        "package.json",
        "src/x.ts",
        "fixtures/a.json",
        "index.html",
        "scripts/x.mjs",
        "src/x.typ",
      ]) {
        expect(flags([`${dir}/${file}`]).node).toBe(true)
      }
    }
  )
})

describe("CD1: each node-e2e step runs on its own flag", () => {
  it.each([
    ["apps/www/public/sw.js", "sw"],
    ["packages/ui/topik/src/components/x.tsx", "ui_fit"],
    // A `__tests__/` helper the phone page imports (tests/ui-fit/phone-page).
    ["apps/www/src/lib/interview-week/__tests__/fixture.ts", "ui_fit"],
    ["apps/www/nginx.security-headers.conf", "csp"],
    ["packages/fetch-kit/src/x.ts", "local_mode"],
    ["packages/activity-catalog/src/x.ts", "session_viewport"],
    ["apps/www/src/components/composer/x.tsx", "composer"],
    ["packages/ui/burn-ins/src/x.tsx", "record"],
    ["extensions/suspender-ledger/src/x.ts", "motion"],
    ["packages/voice-capture/tests/clips/a.wav", "mic"],
    ["apps/www/tests/snips/capture.ts", "snips_settle"],
    ["apps/www/src/lib/snips/index.ts", "snips_settle"],
  ])("a file it names sets its flag: %s → %s", (file, flag) => {
    expect(e2eFlags([file])[flag]).toBe(true)
  })

  it("leaves a unit test out of ui-fit: no page it measures bundles one", () => {
    expect(
      e2eFlags([
        "packages/ui/topik/src/lib/x/index.test.ts",
        "apps/www/src/lib/home-link/__tests__/practice.test.ts",
      ]).ui_fit
    ).toBe(false)
  })

  // pr.yml's node-e2e steps read the `e2e` list by filter name: a step that
  // names no filter, or a filter no step names, would run a suite on nothing
  // or never.
  it("is read by exactly one pr.yml step per filter, through the workflow's output", () => {
    const detect = readFileSync(WORKFLOW, "utf8")
    const pr = readFileSync(join(ROOT, ".github/workflows/pr.yml"), "utf8")
    const job = pr.slice(
      pr.indexOf("\n  node-e2e:\n"),
      pr.indexOf("\n  render-stage:\n")
    )
    expect(job).toContain("    if: needs.changes.outputs.e2e != '[]'\n")
    expect(detect).toContain("value: ${{ jobs.detect.outputs.e2e }}")
    expect(detect).toContain("e2e: ${{ steps.e2e.outputs.changes }}")
    const read = [
      ...job.matchAll(
        /^ {8}if: contains\(fromJSON\(needs\.changes\.outputs\.e2e\), '(\w+)'\)$/gm
      ),
    ].map((m) => m[1])
    expect(read.sort()).toEqual([...E2E].sort())
    expect(job.match(/^ {6}- name: /gm)?.length).toBe(E2E.length)
  })
})
