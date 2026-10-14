#!/usr/bin/env node
// What an extension's AMO source archive must contain: the workspaces it
// builds from, as pnpm resolves them.
//
// Why pnpm and not a list: package-source.sh used to name the archived
// workspaces by hand, and a dependency added to an extension (some-filter's
// @some-extension/transport) never reached that list. `pnpm install
// --frozen-lockfile` inside the extracted archive still passed, since pnpm
// links a `workspace:` dependency to its directory whether or not that
// directory exists, and the build then failed on the first import from it.
// `pnpm --filter "<name>..."` is the same dependency closure pnpm itself
// installs and builds against, so it cannot drift from the manifests.
//
// Usage: node source-closure.mjs <extension-dir>
//   prints {"dirs": [...], "rootFiles": [...], "pruneRootDeps": [...]} as
//   JSON, where `dirs` are repo-relative workspace directories (the extension
//   first), `rootFiles` is ROOT_BUILD_INPUTS, and `pruneRootDeps` are the root
//   manifest's workspace dependencies that are not among `dirs`, which the
//   archive's root package.json and lockfile must drop or `pnpm install
//   --frozen-lockfile` fails on them.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Repo-root files an extension's install or build reads, besides
 * package.json and pnpm-lock.yaml (which package-source.sh prunes). They are
 * what an strace of each AMO extension's `pnpm build` opens outside its
 * workspace closure, plus the toolchain pins; a new one goes here.
 *   - pnpm-workspace.yaml: workspace layout, overrides, catalog, allowBuilds
 *   - .npmrc: install settings; .nvmrc: the Node version CI builds with
 *   - tsconfig.json: Vite's `resolve.tsconfigPaths` reads it while resolving
 *   - postcss.config.mjs: Vite finds it by searching up from the extension,
 *     so every extension's CSS goes through it (autoprefixer); without it a
 *     build from the archive emits CSS that differs from the submitted one
 */
export const ROOT_BUILD_INPUTS = [
  "pnpm-workspace.yaml",
  ".npmrc",
  ".nvmrc",
  "tsconfig.json",
  "postcss.config.mjs",
]

const isWorkspaceSpec = (spec) => /^(workspace|link):/.test(String(spec))

/**
 * Workspaces the extension at `extRel` builds from, itself included, as
 * directories relative to `repoRoot`. Follows dependencies and
 * devDependencies, the way pnpm installs them.
 */
export function workspaceClosure(extRel, repoRoot = process.cwd()) {
  const { name } = JSON.parse(
    fs.readFileSync(path.join(repoRoot, extRel, "package.json"), "utf8")
  )
  const out = execFileSync(
    "pnpm",
    ["-r", "--filter", `${name}...`, "ls", "--depth", "-1", "--json"],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  )
  const projects = JSON.parse(out)
  const dirs = projects.map((p) => path.relative(repoRoot, p.path))
  if (!dirs.includes(extRel)) {
    throw new Error(
      `pnpm did not list ${extRel} (${name}) in its own closure: ${dirs.join(", ")}`
    )
  }
  return {
    dirs: [extRel, ...dirs.filter((d) => d !== extRel)],
    names: projects.map((p) => p.name),
  }
}

/** Root-manifest workspace dependencies whose package is not in `names`. */
export function rootDepsOutside(rootPkg, names) {
  const keep = new Set(names)
  return Object.entries({
    ...rootPkg.dependencies,
    ...rootPkg.devDependencies,
  })
    .filter(([dep, spec]) => isWorkspaceSpec(spec) && !keep.has(dep))
    .map(([dep]) => dep)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const extDir = path.resolve(process.argv[2] ?? ".")
  const repoRoot = execFileSync(
    "git",
    ["-C", extDir, "rev-parse", "--show-toplevel"],
    { encoding: "utf8" }
  ).trim()
  const { dirs, names } = workspaceClosure(
    path.relative(repoRoot, extDir),
    repoRoot
  )
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  )
  process.stdout.write(
    `${JSON.stringify({
      dirs,
      rootFiles: ROOT_BUILD_INPUTS,
      pruneRootDeps: rootDepsOutside(rootPkg, names),
    })}\n`
  )
}
