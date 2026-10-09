#!/usr/bin/env node
// Keeps the Node and pnpm versions this repo spells out in files (`packageManager`
// in package.json, .nvmrc, and the package manager pnpm 12 records in
// pnpm-lock.yaml) equal to what the flake provides, so they follow
// `nix flake update` instead of drifting from it. The reasoning, and the pure
// functions this drives, live in packages/eslint/src/toolchain-pins.ts.
//
//   node --no-warnings scripts/sync-toolchain.ts           rewrite them
//   node --no-warnings scripts/sync-toolchain.ts --check   fail if they differ
//
// The write form needs pnpm on PATH (the flake's shells have it): when the pnpm
// pin moves it runs `pnpm install --lockfile-only --no-frozen-lockfile`, the one
// way to regenerate the lockfile's package-manager section. Run against the
// committed lockfile it moves nothing else in it.
//
// `--check` runs in pr.yml as its own job, which CI Gate requires;
// flake-update.yml runs the write form after `nix flake update`. Needs `nix`,
// which is the point: the versions come from evaluating the locked nixpkgs, so
// this is deliberately not part of the root `pnpm lint`, which has to run
// without it.
//
// Runs on Node's built-in type stripping with no install, like the other
// scripts/check-*.ts: no enums, namespaces or path aliases, and imports spell
// their `.ts` extension.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// A relative import on purpose: Node's type stripping resolves no path aliases.
// eslint-disable-next-line no-restricted-imports
import {
  describeDrift,
  needsLockfileRefresh,
  parseToolchain,
  planPins,
} from "../packages/eslint/src/toolchain-pins.ts"

function run(command: string, args: Array<string>, cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
}

function sync(check: boolean): void {
  const root = run("git", ["rev-parse", "--show-toplevel"], process.cwd())
  const nix = (args: Array<string>): string =>
    run("nix", ["--no-warn-dirty", ...args], root)

  const system = nix([
    "eval",
    "--impure",
    "--raw",
    "--expr",
    "builtins.currentSystem",
  ])
  const toolchain = parseToolchain(
    nix(["eval", "--json", `.#toolchain.${system}`])
  )

  const packageJsonPath = join(root, "package.json")
  const nvmrcPath = join(root, ".nvmrc")
  const before = {
    packageJson: readFileSync(packageJsonPath, "utf8"),
    nvmrc: readFileSync(nvmrcPath, "utf8"),
    lockfile: readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
  }
  const { files, drift } = planPins(before, toolchain)

  if (drift.length === 0) {
    console.log(
      `[toolchain] ok: node ${toolchain.node}, pnpm ${toolchain.pnpm} (npm ships inside that node)`
    )
    return
  }

  if (check) {
    for (const d of drift) {
      console.error(`[toolchain] ${describeDrift(d)}`)
    }
    console.error(
      "[toolchain] The flake is the source of truth. Run `pnpm sync:toolchain` to copy its versions into those files (after `nix flake update`, if you meant to move them)."
    )
    process.exitCode = 1
    return
  }

  if (files.packageJson !== before.packageJson) {
    writeFileSync(packageJsonPath, files.packageJson)
  }
  if (files.nvmrc !== before.nvmrc) {
    writeFileSync(nvmrcPath, files.nvmrc)
  }
  for (const d of drift) {
    console.log(`[toolchain] ${d.file}: ${d.declared} -> ${d.expected}`)
  }
  if (needsLockfileRefresh(drift)) {
    // The package.json pin is already rewritten above, which is what makes
    // pnpm regenerate the lockfile section for the new version.
    execFileSync(
      "pnpm",
      ["install", "--lockfile-only", "--no-frozen-lockfile"],
      {
        cwd: root,
        stdio: "inherit",
      }
    )
    console.log("[toolchain] pnpm-lock.yaml: package manager section refreshed")
  }
}

const args = process.argv.slice(2)
const unknown = args.filter((arg) => arg !== "--check")
if (unknown.length > 0) {
  console.error(`[toolchain] unknown argument: ${unknown.join(" ")}`)
  process.exitCode = 2
} else {
  sync(args.includes("--check"))
}
