/**
 * The Node and pnpm pins (package.json `packageManager`, .nvmrc) against what
 * the flake provides, as pure functions over file text.
 * `scripts/sync-toolchain.ts` feeds them the two files and the flake's
 * `toolchain` output; these cases pin the rules themselves.
 */

import {
  describeDrift,
  needsLockfileRefresh,
  parseToolchain,
  planPins,
  type PinDrift,
  type PinInputs,
  type Toolchain,
} from "@eslint/toolchain-pins.js"
import { describe, expect, it } from "vitest"

const TOOLCHAIN: Toolchain = { node: "26.11.1", pnpm: "12.9.0" }

function packageJson(packageManager: string): string {
  return [
    "{",
    '  "name": "some-ui",',
    '  "scripts": { "dev": "turbo dev", "lint": "turbo lint" },',
    `  "packageManager": "${packageManager}",`,
    '  "author": "pgdev"',
    "}",
    "",
  ].join("\n")
}

// The head of a pnpm 12 lockfile: an environment section that locks pnpm itself,
// then the workspace's own lockfile document.
function lockfile(pnpm: string | null): string {
  const env =
    pnpm === null
      ? []
      : [
          "---",
          "lockfileVersion: '9.0'",
          "",
          "importers:",
          "",
          "  .:",
          "    configDependencies: {}",
          "    packageManagerDependencies:",
          "      pnpm:",
          `        specifier: ${pnpm}`,
          `        version: ${pnpm}`,
          "",
          "packages:",
          "",
          `  pnpm@${pnpm}:`,
          "    hasBin: true",
          "",
          "---",
        ]
  return [
    ...env,
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  apps/www:",
    "    dependencies:",
    "      react:",
    "        specifier: ^19.0.4",
    "        version: 19.0.4",
    "",
  ].join("\n")
}

const IN_SYNC: PinInputs = {
  packageJson: packageJson("pnpm@12.9.0"),
  nvmrc: "26.11.1\n",
  lockfile: lockfile("12.9.0"),
}

describe("parseToolchain", () => {
  it("reads the flake's toolchain output", () => {
    expect(parseToolchain('{"node":"26.11.1","pnpm":"12.9.0"}')).toEqual(
      TOOLCHAIN
    )
  })

  it("ignores extra keys, so a future npm entry would not break older readers", () => {
    expect(
      parseToolchain('{"node":"26.11.1","pnpm":"12.9.0","npm":"11.20.0"}')
    ).toEqual(TOOLCHAIN)
  })

  it.each([
    ["not JSON", "warning: Git tree is dirty"],
    ["null", "null"],
    ["a missing pnpm", '{"node":"26.11.1"}'],
    ["a missing node", '{"pnpm":"12.9.0"}'],
    ["a non-string version", '{"node":26,"pnpm":"12.9.0"}'],
    ["a range instead of a version", '{"node":"26.11.1","pnpm":"^12.9.0"}'],
    ["a tag instead of a version", '{"node":"latest","pnpm":"12.9.0"}'],
  ])("rejects %s", (_name, json) => {
    expect(() => parseToolchain(json)).toThrow()
  })
})

describe("planPins", () => {
  it("reports no drift and returns the files untouched when they match", () => {
    const plan = planPins(IN_SYNC, TOOLCHAIN)
    expect(plan.drift).toEqual([])
    expect(plan.files).toEqual({
      packageJson: IN_SYNC.packageJson,
      nvmrc: IN_SYNC.nvmrc,
    })
  })

  it("rewrites only the packageManager value, leaving the rest of package.json byte for byte", () => {
    const stale: PinInputs = {
      ...IN_SYNC,
      packageJson: packageJson("pnpm@11.20.0"),
    }
    const plan = planPins(stale, TOOLCHAIN)
    expect(plan.drift).toEqual([
      {
        kind: "pnpm",
        file: "package.json",
        declared: "11.20.0",
        expected: "12.9.0",
      },
    ])
    expect(plan.files.packageJson).toBe(IN_SYNC.packageJson)
    expect(plan.files.nvmrc).toBe(IN_SYNC.nvmrc)
  })

  it("reports a pnpm-lock.yaml that still records the old pnpm, and leaves it alone", () => {
    const plan = planPins(
      { ...IN_SYNC, lockfile: lockfile("12.8.0") },
      TOOLCHAIN
    )
    expect(plan.drift).toEqual([
      {
        kind: "lockfile",
        file: "pnpm-lock.yaml",
        declared: "12.8.0",
        expected: "12.9.0",
      },
    ])
    expect(plan.files).toEqual({
      packageJson: IN_SYNC.packageJson,
      nvmrc: IN_SYNC.nvmrc,
    })
  })

  it("does not call a lockfile without the section drift: only a section that is there and wrong fails", () => {
    expect(
      planPins({ ...IN_SYNC, lockfile: lockfile(null) }, TOOLCHAIN).drift
    ).toEqual([])
  })

  it("reads the section only where pnpm writes it, not a dependency that happens to be called pnpm", () => {
    const lookalike = [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  apps/www:",
      "    dependencies:",
      "      pnpm:",
      "        specifier: 11.0.0",
      "        version: 11.0.0",
      "",
    ].join("\n")
    expect(
      planPins({ ...IN_SYNC, lockfile: lookalike }, TOOLCHAIN).drift
    ).toEqual([])
  })

  it("rewrites .nvmrc to a bare version with one trailing newline", () => {
    const plan = planPins({ ...IN_SYNC, nvmrc: "24.5.0" }, TOOLCHAIN)
    expect(plan.drift).toEqual([
      { kind: "node", file: ".nvmrc", declared: "24.5.0", expected: "26.11.1" },
    ])
    expect(plan.files.nvmrc).toBe("26.11.1\n")
  })

  it("reports both pins when both are stale", () => {
    const plan = planPins(
      {
        packageJson: packageJson("pnpm@10.26.1"),
        nvmrc: "v24.5.0\n",
        lockfile: lockfile("10.26.1"),
      },
      TOOLCHAIN
    )
    expect(plan.drift.map((d) => d.kind)).toEqual(["pnpm", "node", "lockfile"])
    expect(plan.files).toEqual({
      packageJson: IN_SYNC.packageJson,
      nvmrc: IN_SYNC.nvmrc,
    })
  })

  it("does not call a missing trailing newline drift", () => {
    expect(planPins({ ...IN_SYNC, nvmrc: "26.11.1" }, TOOLCHAIN).drift).toEqual(
      []
    )
  })

  it("treats a leading v in .nvmrc as drift, since the pin is written bare", () => {
    expect(
      planPins({ ...IN_SYNC, nvmrc: "v26.11.1\n" }, TOOLCHAIN).drift
    ).toHaveLength(1)
  })

  it("throws when package.json has no packageManager to compare", () => {
    expect(() =>
      planPins(
        { ...IN_SYNC, packageJson: '{ "name": "some-ui" }\n' },
        TOOLCHAIN
      )
    ).toThrow(/no "packageManager" field/)
  })

  it("throws when packageManager names something other than pnpm", () => {
    expect(() =>
      planPins(
        { ...IN_SYNC, packageJson: packageJson("yarn@4.5.0") },
        TOOLCHAIN
      )
    ).toThrow(/not pnpm@<version>/)
  })
})

describe("describeDrift", () => {
  it("names the file, the declared pin and the flake's version", () => {
    expect(
      describeDrift({
        kind: "pnpm",
        file: "package.json",
        declared: "11.20.0",
        expected: "12.9.0",
      })
    ).toBe(
      "package.json pins pnpm 11.20.0, but flake.lock provides pnpm 12.9.0."
    )
    expect(
      describeDrift({
        kind: "node",
        file: ".nvmrc",
        declared: "24.5.0",
        expected: "26.11.1",
      })
    ).toBe(".nvmrc pins Node 24.5.0, but flake.lock provides Node 26.11.1.")
    expect(
      describeDrift({
        kind: "lockfile",
        file: "pnpm-lock.yaml",
        declared: "12.8.0",
        expected: "12.9.0",
      })
    ).toMatch(/pnpm-lock\.yaml records pnpm 12\.8\.0 .* provides pnpm 12\.9\.0/)
  })
})

describe("needsLockfileRefresh", () => {
  const drift = (kind: PinDrift["kind"]): PinDrift => ({
    kind,
    file: "package.json",
    declared: "a",
    expected: "b",
  })

  it("is true when the pnpm pin or the lockfile's record of it moved", () => {
    expect(needsLockfileRefresh([drift("pnpm")])).toBe(true)
    expect(needsLockfileRefresh([drift("lockfile")])).toBe(true)
  })

  it("is false for a Node-only move or no drift, which pnpm-lock.yaml does not record", () => {
    expect(needsLockfileRefresh([drift("node")])).toBe(false)
    expect(needsLockfileRefresh([])).toBe(false)
  })
})
