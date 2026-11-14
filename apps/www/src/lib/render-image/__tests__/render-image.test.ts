/**
 * The render image builds every workspace package its recorders load built
 * (RI1). `infra/render/Dockerfile` builds only what `infra/render/build.sh`'s
 * turbo filters name,
 * never the whole app, and tsx resolves a workspace package through its
 * `package.json`: one whose entry points at `dist/` loads only once built. A
 * recorder in `apps/www/tests/record` that imports one the filters miss passes
 * every check here and fails only in `render-docker-release.yml`'s proof, on
 * `main`, after merge (#2915's `record:report` and `@some-ui/engagement`,
 * fixed with this test).
 *
 * Read as plain text: the recorders' filters out of build.sh, beside the
 * stage's (RI3, read from its imports by `@/stage-packages`), each package's
 * workspace dependencies out of its `package.json`. A package whose entry is
 * source loads its own `dependencies` when it runs, so those are followed too
 * (`@some-ui/video-render` loads `@some-ui/core-utils` from dist/). Not covered: what the
 * stage (`build:stage`) itself bundles, which RI3 holds
 * (`stage-packages.test.ts` beside this, and pr.yml's render-stage job).
 * The last cases feed a build.sh with a filter dropped, so a check that
 * stopped looking cannot stay green.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { specifiersOf, stagePackages } from "@/stage-packages"
import { describe, expect, it } from "vitest"

/** apps/www/src/lib/render-image/__tests__ -> the repository root. */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../.."
)
const BUILD = "infra/render/build.sh"
const RECORDERS = "apps/www/tests/record"

type Pkg = {
  name: string
  builtEntry: boolean
  /** Workspace dependencies, dev included: what turbo builds first. */
  deps: Array<string>
  /** Workspace `dependencies` alone: what loading this package loads. */
  runtimeDeps: Array<string>
}

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8")
}

type Manifest = {
  name?: string
  main?: string
  exports?: unknown
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringsOf(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string"
    )
  )
}

function manifestOf(value: unknown): Manifest {
  if (!isRecord(value)) return {}
  return {
    name: typeof value.name === "string" ? value.name : undefined,
    main: typeof value.main === "string" ? value.main : undefined,
    exports: value.exports,
    dependencies: stringsOf(value.dependencies),
    devDependencies: stringsOf(value.devDependencies),
  }
}

/** Every workspace package under packages/, apps/ and extensions/, by name. */
function workspace(): Map<string, Pkg> {
  const found = new Map<string, Pkg>()
  const walk = (dir: string, depth: number): void => {
    for (const entry of readdirSync(join(REPO_ROOT, dir))) {
      if (entry === "node_modules" || entry.startsWith(".")) continue
      const rel = join(dir, entry)
      if (!statSync(join(REPO_ROOT, rel)).isDirectory()) continue
      let manifest: string | undefined
      try {
        manifest = read(join(rel, "package.json"))
      } catch {
        manifest = undefined
      }
      if (manifest !== undefined) {
        const json = manifestOf(JSON.parse(manifest))
        if (json.name !== undefined) {
          const entry = JSON.stringify([
            json.main ?? null,
            json.exports ?? null,
          ])
          const workspaceOf = (
            map: Record<string, string> = {}
          ): Array<string> =>
            Object.entries(map)
              .filter(([, range]) => range.startsWith("workspace:"))
              .map(([name]) => name)
          found.set(json.name, {
            name: json.name,
            builtEntry: /(^|[^\w])dist\//.test(entry),
            deps: workspaceOf({
              ...json.dependencies,
              ...json.devDependencies,
            }),
            runtimeDeps: workspaceOf(json.dependencies),
          })
        }
      }
      if (depth > 0) walk(rel, depth - 1)
    }
  }
  walk("packages", 2)
  walk("apps", 1)
  walk("extensions", 1)
  return found
}

/** The packages build.sh's `turbo run build` builds, closures included. */
function builtBy(build: string, pkgs: Map<string, Pkg>): Set<string> {
  const listed = /^filters\(\) \{([\s\S]*?)^\}/m.exec(build)
  expect(listed, "build.sh's filters").not.toBeNull()
  const built = new Set<string>()
  const close = (name: string): void => {
    if (built.has(name)) return
    built.add(name)
    for (const dep of pkgs.get(name)?.deps ?? []) close(dep)
  }
  for (const [, name, caret] of (listed?.[1] ?? "").matchAll(
    /'--filter=(@some-ui\/[\w-]+)(\^?)\.\.\.'/g
  )) {
    if (caret === "^") for (const dep of pkgs.get(name)?.deps ?? []) close(dep)
    else close(name)
  }
  if (listed?.[1].includes("stage-packages.ts --filters") === true) {
    for (const name of stagePackages()) close(name)
  }
  return built
}

/**
 * Workspace packages the recorders import or re-export at run time (type-only
 * imports aside). Subpaths count as their package.
 */
function recorderImports(): Set<string> {
  const names = new Set<string>()
  for (const file of readdirSync(join(REPO_ROOT, RECORDERS))) {
    if (!file.endsWith(".ts")) continue
    for (const spec of specifiersOf(read(join(RECORDERS, file)), ".ts")) {
      const name = /^@some-ui\/[\w.-]+/.exec(spec)?.[0]
      if (name !== undefined) names.add(name)
    }
  }
  return names
}

/**
 * The packages a recorder ends up loading from dist/: each import that has a
 * dist/ entry, and, through each one whose entry is source (tsx compiles it on
 * the fly), the packages that one loads in turn.
 */
function loadedFromDist(pkgs: Map<string, Pkg>): Set<string> {
  const needed = new Set<string>()
  const seen = new Set<string>()
  const visit = (name: string): void => {
    if (seen.has(name)) return
    seen.add(name)
    const pkg = pkgs.get(name)
    if (pkg === undefined) return
    if (pkg.builtEntry) needed.add(name)
    else for (const dep of pkg.runtimeDeps) visit(dep)
  }
  for (const name of recorderImports()) visit(name)
  return needed
}

/** build.sh with the stage's own filters taken out, the recorders' left. */
function withoutStage(build: string): string {
  const out = build.replace(
    /^\s*pnpm exec tsx [^\n]*stage-packages[^\n]*\n/m,
    ""
  )
  expect(out).not.toBe(build)
  return out
}

function unbuilt(build: string): Array<string> {
  const pkgs = workspace()
  const built = builtBy(build, pkgs)
  return [...loadedFromDist(pkgs)].filter((name) => !built.has(name)).sort()
}

describe("the render image (RI1)", () => {
  it("builds every workspace package a recorder loads from dist/", () => {
    expect(unbuilt(read(BUILD))).toEqual([])
  })

  it("reads real imports, direct and through source packages", () => {
    const loaded = loadedFromDist(workspace())
    expect(loaded).toContain("@some-ui/engagement")
    expect(loaded).toContain("@some-ui/core-utils")
  })

  it("fails a build.sh whose filter for such a package is dropped", () => {
    // The stage's filters dropped too: today they reach engagement through
    // a devDependency, which is no promise the recorders can lean on.
    const build = withoutStage(read(BUILD))
    const dropped = build.replace(
      /\s*'--filter=@some-ui\/engagement\.\.\.' \\/,
      ""
    )
    expect(dropped).not.toBe(build)
    expect(unbuilt(dropped)).toContain("@some-ui/engagement")
  })

  it("fails a build.sh that builds only what the recorders import directly", () => {
    // Every filter but engagement's dropped, the stage's too: core-utils,
    // which the recorders load only through @some-ui/video-render's source,
    // is then unbuilt.
    const direct = read(BUILD).replace(
      /^filters\(\) \{[\s\S]*?^\}/m,
      "filters() {\n\tprintf '%s\\n' '--filter=@some-ui/engagement...'\n}"
    )
    expect(unbuilt(direct)).toContain("@some-ui/core-utils")
  })
})
