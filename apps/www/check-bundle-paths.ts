// Builds every profile in build.profiles.ts the way its deployable does
// (build.paths.ts, `profileBuildEnv`), and fails when an output carries code
// off that profile's path (build.paths.ts, `paths`). The rule and what it
// can and cannot see: packages/some-vite-config/AUDIENCES.md, "Paths".
//
// Each build is the shipped one plus `--manifest` and hidden sourcemaps, in a
// temporary directory. One at a time: concurrent `vite build`s here have
// overwritten each other's output.
//
// Runs on Node's built-in type stripping: imports spell their `.ts` extension.
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { BuildContents } from "@some-ui/vite-config/bundle-paths"
import {
  checkExclusivity,
  checkPaths,
  describePathViolation,
  readBuild,
} from "@some-ui/vite-config/bundle-paths"

import { paths, profileBuildEnv, PROFILES } from "./build.paths.ts"

const appRoot = import.meta.dirname
const out = (line: string): void => void process.stdout.write(`${line}\n`)
const err = (line: string): void => void process.stderr.write(`${line}\n`)
const repoRoot = resolve(appRoot, "../..")

function run(
  command: string,
  args: Array<string>,
  env: typeof process.env
): void {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${String(result.status)}`
    )
  }
}

// The résumé PDFs the build copies from public/ (`build` runs this first too).
run("node", ["scripts/sync-resume.mjs"], process.env)

const scratch = mkdtempSync(join(tmpdir(), "www-bundle-paths-"))
let failed = false
const builds = new Map<(typeof PROFILES)[number], BuildContents>()
try {
  for (const profile of PROFILES) {
    const outDir = join(scratch, profile)
    run(
      "pnpm",
      [
        "exec",
        "vite",
        "build",
        "--outDir",
        outDir,
        "--emptyOutDir",
        "--manifest",
        "--sourcemap",
        "hidden",
        "--logLevel",
        "warn",
      ],
      { ...process.env, SOME_UI_PROFILE: profile, ...profileBuildEnv[profile] }
    )
    const build = readBuild(outDir, repoRoot, appRoot)
    builds.set(profile, build)
    const bytes = build.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
    const violations = checkPaths(profile, build, paths)
    out(
      `[bundle-paths] ${profile}: ${build.chunks.length} chunks, ${(bytes / 1024).toFixed(1)} KiB JS, ${violations.length} violation(s)`
    )
    for (const violation of violations) {
      err(`[bundle-paths] ${profile}: ${describePathViolation(violation)}`)
    }
    failed ||= violations.length > 0
  }
  // Across the builds: whatever ships in some profiles only must say so.
  const undeclared = checkExclusivity(builds, paths)
  for (const violation of undeclared) {
    err(`[bundle-paths] ${describePathViolation(violation)}`)
  }
  failed ||= undeclared.length > 0
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

if (failed) {
  err(
    "[bundle-paths] A profile ships code off its path. Fix the import, or, if the code belongs on that path, say so in apps/www/build.paths.ts."
  )
  process.exitCode = 1
}
