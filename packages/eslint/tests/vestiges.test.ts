/**
 * The vestige rule (CLAUDE.md "Vestiges"), as pure functions over workspace
 * and commit facts. `scripts/report-vestiges.ts` feeds them from the
 * manifests and `git log`; these cases pin each signal.
 */

import type { CommitFacts, WorkspaceFacts } from "@eslint/vestiges.js"
import {
  assessVestiges,
  lastOwnChange,
  reachableDirs,
  SHARED_LIBRARY,
  STALE_DAYS,
  SWEEP_WORKSPACES,
  workspaceRootOf,
} from "@eslint/vestiges.js"
import { describe, expect, it } from "vitest"

const LIVE_SCRIPTS = ["lint", "typecheck", "test", "knip"]

const workspace = (
  dir: string,
  overrides: Partial<WorkspaceFacts> = {}
): WorkspaceFacts => ({
  dir,
  name: dir.split("/").at(-1) ?? dir,
  deps: [],
  scripts: LIVE_SCRIPTS,
  sourceFiles: 3,
  testFiles: 1,
  deployable: false,
  ...overrides,
})

const TODAY = "2026-10-02"
const DAYS_AGO = (days: number): string =>
  new Date(Date.parse(TODAY) - days * 86_400_000).toISOString().slice(0, 10)

describe("reachableDirs", () => {
  it("follows dependency names from every deployable, transitively", () => {
    const reached = reachableDirs([
      workspace("apps/www", { deployable: true, deps: ["registry"] }),
      workspace("packages/registry", { deps: ["topik"] }),
      workspace("packages/ui/topik"),
      workspace("packages/ui/orphan"),
    ])
    expect([...reached].sort()).toEqual([
      "apps/www",
      "packages/registry",
      "packages/ui/topik",
    ])
  })
})

describe("lastOwnChange", () => {
  it("is the newest commit that changed the workspace's own source", () => {
    const commits: Array<CommitFacts> = [
      { date: "2026-09-30", files: ["packages/ui/a/package.json"] },
      { date: "2026-09-20", files: ["packages/ui/a/src/x.test.ts"] },
      { date: "2026-09-10", files: ["packages/ui/a/src/x.ts"] },
    ]
    expect(lastOwnChange("packages/ui/a", commits)).toEqual({
      date: "2026-09-10",
      sweepOnly: false,
    })
  })

  it("does not count config of any kind as own work", () => {
    const commits: Array<CommitFacts> = [
      {
        date: "2026-09-30",
        files: [
          "packages/ui/a/uno.config.ts",
          "packages/ui/a/playwright.config.ts",
          "packages/ui/a/vite.config.mts",
          "packages/ui/a/capacitor.config.ts",
          "packages/ui/a/vitest.setup.ts",
        ],
      },
      { date: "2026-08-01", files: ["packages/ui/a/src/x.ts"] },
    ]
    expect(lastOwnChange("packages/ui/a", commits).date).toBe("2026-08-01")
  })

  it("does not count a sweep across many workspaces as own work", () => {
    const sweepDirs = Array.from(
      { length: SWEEP_WORKSPACES + 1 },
      (_, index) => `packages/ui/w${index}`
    )
    const commits: Array<CommitFacts> = [
      { date: "2026-09-30", files: sweepDirs.map((dir) => `${dir}/src/x.ts`) },
      { date: "2026-08-01", files: ["packages/ui/w0/src/x.ts"] },
    ]
    expect(lastOwnChange("packages/ui/w0", commits)).toEqual({
      date: "2026-08-01",
      sweepOnly: false,
    })
  })

  it("counts a sweep's workspaces from its paths, deleted ones included", () => {
    // Only w0 exists today; the other workspaces this rollout touched were
    // deleted since, and must still make it a sweep.
    const swept = Array.from(
      { length: SWEEP_WORKSPACES + 1 },
      (_, index) => `packages/ui/gone${index}/src/x.ts`
    )
    const commits: Array<CommitFacts> = [
      { date: "2026-09-30", files: ["packages/ui/w0/src/x.ts", ...swept] },
      { date: "2026-08-01", files: ["packages/ui/w0/src/x.ts"] },
    ]
    expect(lastOwnChange("packages/ui/w0", commits).date).toBe("2026-08-01")
  })

  it("reads the workspace root from the path", () => {
    expect(workspaceRootOf("packages/ui/topik/src/x.ts")).toBe(
      "packages/ui/topik"
    )
    expect(workspaceRootOf("packages/core-utils/src/x.ts")).toBe(
      "packages/core-utils"
    )
    expect(workspaceRootOf("docs/canon/x.typ")).toBe("docs/canon")
    expect(workspaceRootOf("scripts/x.ts")).toBeUndefined()
  })

  it("falls back to a sweep, marked as such, when nothing else touched it", () => {
    const sweepDirs = Array.from(
      { length: SWEEP_WORKSPACES + 1 },
      (_, index) => `packages/ui/w${index}`
    )
    const commits: Array<CommitFacts> = [
      { date: "2026-09-30", files: sweepDirs.map((dir) => `${dir}/src/x.ts`) },
    ]
    expect(lastOwnChange("packages/ui/w0", commits)).toEqual({
      date: "2026-09-30",
      sweepOnly: true,
    })
  })
})

describe("assessVestiges", () => {
  const www = workspace("apps/www", {
    deployable: true,
    deps: ["live", "stale", "shared"],
  })

  it("flags a workspace no deployable reaches, however fresh", () => {
    const [orphan] = assessVestiges(
      [www, workspace("packages/ui/orphan")],
      [{ date: TODAY, files: ["packages/ui/orphan/src/x.ts"] }],
      TODAY
    )
    expect(orphan).toMatchObject({ reached: false, candidate: true })
  })

  it("flags a reached workspace only when it is both stale and drifting", () => {
    const commits: Array<CommitFacts> = [
      { date: DAYS_AGO(5), files: ["packages/ui/live/src/x.ts"] },
      {
        date: DAYS_AGO(STALE_DAYS + 1),
        files: ["packages/ui/stale/src/x.ts", "packages/ui/drift/src/x.ts"],
      },
    ]
    const reports = assessVestiges(
      [
        { ...www, deps: ["live", "stale", "drift"] },
        workspace("packages/ui/live", { scripts: [] }),
        workspace("packages/ui/stale"),
        workspace("packages/ui/drift", { scripts: ["lint"], testFiles: 0 }),
      ],
      commits,
      TODAY
    )
    const byDir = new Map(reports.map((r) => [r.dir, r]))
    // Fresh but drifting: debt, not dead.
    expect(byDir.get("packages/ui/live")?.candidate).toBe(false)
    // Stale but on every convention: quiet, not dead.
    expect(byDir.get("packages/ui/stale")?.candidate).toBe(false)
    expect(byDir.get("packages/ui/drift")).toMatchObject({
      candidate: true,
      drift: [
        "no typecheck script",
        "no test script",
        "no knip script",
        "no tests",
      ],
    })
  })

  it("never flags a shared library for sitting still", () => {
    const consumers = Array.from({ length: SHARED_LIBRARY + 1 }, (_, index) =>
      workspace(`packages/ui/c${index}`, { deps: ["shared"] })
    )
    const reports = assessVestiges(
      [
        { ...www, deps: consumers.map((c) => c.name) },
        ...consumers,
        workspace("packages/ui/shared", { testFiles: 0 }),
      ],
      [],
      TODAY
    )
    expect(reports.find((r) => r.dir === "packages/ui/shared")).toMatchObject({
      dependents: SHARED_LIBRARY + 1,
      candidate: false,
    })
  })

  it("holds only code to code's conventions", () => {
    const [crate] = assessVestiges(
      [
        { ...www, deps: ["crate"] },
        workspace("crates/crate", {
          scripts: [],
          sourceFiles: 0,
          testFiles: 0,
        }),
      ],
      [],
      TODAY
    )
    expect(crate?.drift).toEqual([])
  })
})
