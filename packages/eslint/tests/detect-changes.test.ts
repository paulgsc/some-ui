/**
 * CD1 (`.github/workflows/_detect-changes.yml`): a flag is true only when a
 * changed file matches one of its patterns. pr.yml runs Rust CI, the Node
 * jobs, the render stage and the deny checks on these flags, so a flag that
 * fires for a file it does not name pays for jobs the PR cannot fail.
 *
 * Family: every filter × {only Markdown, only files no filter names, one file
 * the filter names}, and for `node` every workspace the Node jobs reach,
 * read from the workspace graph (turbo selects a package for any file in it). The matching is the action's own: dorny/paths-filter
 * v4.0.3 compiles each pattern with picomatch 2.3.1 (its lockfile's, pinned
 * here) under `{ dot: true }`, and under `predicate-quantifier: some`, its
 * default, a file counts when any pattern matches it (its src/filter.ts).
 * `findPathsFilterViolations` in workflow-guards.ts is the lexical half: it
 * fails the leading `!` that broke this under `some`.
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

function filterStepWith(): Readonly<Record<string, unknown>> {
  const jobs = map(
    map(parse(readFileSync(WORKFLOW, "utf8")), "workflow").jobs,
    "jobs"
  )
  for (const job of Object.values(jobs)) {
    for (const step of list(map(job, "job").steps, "steps")) {
      const fields = map(step, "step")
      if (String(fields.uses).startsWith("dorny/paths-filter@")) {
        return map(fields.with, "the step's with")
      }
    }
  }
  throw new Error("no paths-filter step in the workflow")
}

const withMap = filterStepWith()
const quantifier =
  withMap["predicate-quantifier"] === undefined
    ? "some"
    : text(withMap["predicate-quantifier"], "predicate-quantifier")
const filters = Object.entries(
  map(parse(text(withMap.filters, "filters")), "filters")
).map(
  ([name, patterns]) =>
    [name, list(patterns, name).map((p) => text(p, name))] as const
)

// dorny/paths-filter's `isMatch` for `some`, the only quantifier this
// workflow may use until this test learns another.
function flags(changed: ReadonlyArray<string>): Record<string, boolean> {
  return Object.fromEntries(
    filters.map(([name, patterns]) => {
      const matchers = patterns.map((p) => picomatch(p, { dot: true }))
      return [name, changed.some((file) => matchers.some((m) => m(file)))]
    })
  )
}

const NONE = {
  rust: false,
  node: false,
  extensions: false,
  wasm: false,
  render: false,
  ci: false,
}

// The workspaces the Node jobs reach: every workspace outside extensions/
// (extension.yml verifies those), and every workspace one of them depends
// on through `workspace:`, transitively.
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
  it("reads the filters the workflow declares, under `some`", () => {
    expect(quantifier).toBe("some")
    expect(filters.map(([name]) => name).sort()).toEqual(
      Object.keys(NONE).sort()
    )
  })

  it("sets no flag for a change that is only Markdown outside every filter's trees", () => {
    expect(
      flags([
        "CLAUDE.md",
        "README.md",
        "docs/ci-architecture.md",
        ".claude/skills/coordinate/SKILL.md",
      ])
    ).toEqual(NONE)
  })

  it("sets no flag for files no filter names (#3376: calls and a doc's data)", () => {
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
      for (const file of ["package.json", "src/x.ts", "fixtures/a.json"]) {
        expect(flags([`${dir}/${file}`]).node).toBe(true)
      }
    }
  )
})
