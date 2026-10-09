// The Node and pnpm versions this repo has to spell out in files, kept equal to
// what the flake provides. flake.lock pins nixpkgs, nixpkgs decides which Node
// (and the npm inside it) and pnpm `nix develop` hands out, and two files
// repeat those numbers: `packageManager` in package.json and .nvmrc. Left to
// hand edits they drift, and the drift is not harmless: pnpm swaps itself for
// whatever `packageManager` names, so the pnpm that runs is not the one nix
// provided (a nix pnpm 12.9.0 in a repo declaring pnpm@11.20.0 reports 11.20.0).
//
// This module is the pure half, over file text. `nix/node/default.nix` holds
// the versions, the flake publishes them as `toolchain.<system>`, and
// `scripts/sync-toolchain.ts` reads that, runs these functions over the two
// files and either writes the result or, with `--check`, fails on drift. The
// weekly `flake-update.yml` runs it after `nix flake update`, so a lock bump
// and the pins it implies land in one PR.
//
// A third file repeats the pnpm pin since pnpm 12: it records the package
// manager itself in pnpm-lock.yaml (`packageManagerDependencies`, with
// integrity hashes for pnpm's platform binaries). A section that disagrees with
// `packageManager` makes `pnpm install --frozen-lockfile` fail outright
// (ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE), so every install job in CI
// would go red. That section cannot be rewritten as text; only pnpm can
// regenerate it, with `pnpm install --lockfile-only --no-frozen-lockfile`
// (which moves nothing else in the lockfile). This module therefore only
// reports it; the script runs that command.
//
// package.json is edited as text, never re-serialised: the file is
// prettier-formatted, and a JSON round trip would reformat unrelated lines.

export type Toolchain = {
  readonly node: string
  readonly pnpm: string
}

/** The files a plan rewrites. */
export type PinFiles = {
  readonly packageJson: string
  readonly nvmrc: string
}

/** What a plan reads: those files, and pnpm-lock.yaml, which it only checks. */
export type PinInputs = PinFiles & { readonly lockfile: string }

export type PinDrift = {
  readonly kind: "pnpm" | "node" | "lockfile"
  readonly file: "package.json" | ".nvmrc" | "pnpm-lock.yaml"
  readonly declared: string
  readonly expected: string
}

const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const PACKAGE_MANAGER = /("packageManager"\s*:\s*")([^"]*)(")/
const LOCKFILE_PNPM =
  /^ {4}packageManagerDependencies:\n {6}pnpm:\n {8}specifier: (\S+)$/m

function isVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION.test(value)
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined
}

/** Reads the JSON `nix eval --json .#toolchain.<system>` prints. */
export function parseToolchain(json: string): Toolchain {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`the flake's toolchain output is not JSON: ${json}`)
  }
  const node = field(parsed, "node")
  const pnpm = field(parsed, "pnpm")
  if (!isVersion(node) || !isVersion(pnpm)) {
    throw new Error(
      `the flake's toolchain output needs "node" and "pnpm" as plain versions, got ${json}`
    )
  }
  return { node, pnpm }
}

function declaredPnpm(packageJson: string): string {
  const match = PACKAGE_MANAGER.exec(packageJson)
  if (match === null) {
    throw new Error(
      'package.json has no "packageManager" field. It must name the pnpm the flake provides: apps/www/Dockerfile reads it to install pnpm.'
    )
  }
  const declared = match[2] ?? ""
  if (!declared.startsWith("pnpm@")) {
    throw new Error(
      `package.json's "packageManager" is "${declared}", not pnpm@<version>. This repo is a pnpm workspace; its pin follows the flake's pnpm.`
    )
  }
  return declared.slice("pnpm@".length)
}

/**
 * The pnpm recorded in pnpm-lock.yaml's `packageManagerDependencies`, or null
 * when the lockfile has no such section. Absent is not drift: a lockfile written
 * by a pnpm that predates the section stays installable, and a pnpm that writes
 * it adds it on the next install. Only a section that is there and wrong fails.
 */
function lockfilePnpm(lockfile: string): string | null {
  return LOCKFILE_PNPM.exec(lockfile)?.[1] ?? null
}

/**
 * The pins the files should hold for `toolchain`: package.json and .nvmrc as
 * they should read (the input text, untouched, when nothing drifted), and what
 * drifted, pnpm-lock.yaml included (reported, not rewritten). Throws when
 * package.json carries no pnpm pin to compare, since there is no line to
 * rewrite.
 */
export function planPins(
  files: PinInputs,
  toolchain: Toolchain
): { readonly files: PinFiles; readonly drift: ReadonlyArray<PinDrift> } {
  const drift: Array<PinDrift> = []

  const pnpm = declaredPnpm(files.packageJson)
  let packageJson = files.packageJson
  if (pnpm !== toolchain.pnpm) {
    drift.push({
      kind: "pnpm",
      file: "package.json",
      declared: pnpm,
      expected: toolchain.pnpm,
    })
    packageJson = packageJson.replace(
      PACKAGE_MANAGER,
      (_all, open: string, _value: string, close: string) =>
        `${open}pnpm@${toolchain.pnpm}${close}`
    )
  }

  const node = files.nvmrc.trim()
  let nvmrc = files.nvmrc
  if (node !== toolchain.node) {
    drift.push({
      kind: "node",
      file: ".nvmrc",
      declared: node,
      expected: toolchain.node,
    })
    nvmrc = `${toolchain.node}\n`
  }

  const recorded = lockfilePnpm(files.lockfile)
  if (recorded !== null && recorded !== toolchain.pnpm) {
    drift.push({
      kind: "lockfile",
      file: "pnpm-lock.yaml",
      declared: recorded,
      expected: toolchain.pnpm,
    })
  }

  return { files: { packageJson, nvmrc }, drift }
}

export function describeDrift(d: PinDrift): string {
  if (d.kind === "lockfile") {
    return `${d.file} records pnpm ${d.declared} as the package manager, but flake.lock provides pnpm ${d.expected}. \`pnpm install --frozen-lockfile\` fails on that.`
  }
  const what = d.kind === "pnpm" ? "pnpm" : "Node"
  return `${d.file} pins ${what} ${d.declared}, but flake.lock provides ${what} ${d.expected}.`
}

/** Whether syncing this drift needs pnpm to regenerate pnpm-lock.yaml. */
export function needsLockfileRefresh(drift: ReadonlyArray<PinDrift>): boolean {
  return drift.some((d) => d.kind === "pnpm" || d.kind === "lockfile")
}
