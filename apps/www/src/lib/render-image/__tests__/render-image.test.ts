/**
 * The render image builds every workspace package its recorders load built
 * (RI1). `infra/render/Dockerfile` builds only what its turbo filters name,
 * never the whole app, and tsx resolves a workspace package through its
 * `package.json`: one whose entry points at `dist/` loads only once built. A
 * recorder in `apps/www/tests/record` that imports one the filters miss passes
 * every check here and fails only in `render-docker-release.yml`'s proof, on
 * `main`, after merge (#2915's `record:report` and `@some-ui/engagement`,
 * fixed with this test).
 *
 * Read as plain text: the filters out of the Dockerfile, each package's
 * workspace dependencies out of its `package.json`. Not covered: what the
 * stage (`build:stage`) itself bundles, which vite resolves at build time.
 * The last case feeds a Dockerfile with a filter dropped, so a check that
 * stopped looking cannot stay green.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/** apps/www/src/lib/render-image/__tests__ -> the repository root. */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../.."
)
const DOCKERFILE = "infra/render/Dockerfile"
const RECORDERS = "apps/www/tests/record"

type Pkg = {
  name: string
  builtEntry: boolean
  deps: Array<string>
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

/** Every workspace package under packages/ and apps/, by name. */
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
          const deps = Object.entries({
            ...json.dependencies,
            ...json.devDependencies,
          })
            .filter(([, range]) => range.startsWith("workspace:"))
            .map(([name]) => name)
          found.set(json.name, {
            name: json.name,
            builtEntry: /(^|[^\w])dist\//.test(entry),
            deps,
          })
        }
      }
      if (depth > 0) walk(rel, depth - 1)
    }
  }
  walk("packages", 2)
  walk("apps", 1)
  return found
}

/** The packages the Dockerfile's `turbo run build` builds, closures included. */
function builtBy(dockerfile: string, pkgs: Map<string, Pkg>): Set<string> {
  const run = /turbo run build([\s\S]*?)&& pnpm/.exec(dockerfile)
  expect(run, "the Dockerfile's turbo build step").not.toBeNull()
  const built = new Set<string>()
  const close = (name: string): void => {
    if (built.has(name)) return
    built.add(name)
    for (const dep of pkgs.get(name)?.deps ?? []) close(dep)
  }
  for (const [, name, caret] of (run?.[1] ?? "").matchAll(
    /--filter="(@some-ui\/[\w-]+)(\^?)\.\.\."/g
  )) {
    if (caret === "^") for (const dep of pkgs.get(name)?.deps ?? []) close(dep)
    else close(name)
  }
  return built
}

/** Workspace packages the recorders import at run time (type imports aside). */
function recorderImports(): Set<string> {
  const names = new Set<string>()
  for (const file of readdirSync(join(REPO_ROOT, RECORDERS))) {
    if (!file.endsWith(".ts")) continue
    const text = read(join(RECORDERS, file))
    for (const [whole, name] of text.matchAll(
      /^import\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?"(@some-ui\/[\w-]+)/gm
    )) {
      if (!/^import\s+type\s/.test(whole)) names.add(name)
    }
  }
  return names
}

function unbuilt(dockerfile: string): Array<string> {
  const pkgs = workspace()
  const built = builtBy(dockerfile, pkgs)
  return [...recorderImports()]
    .filter((name) => pkgs.get(name)?.builtEntry === true)
    .filter((name) => !built.has(name))
    .sort()
}

describe("the render image (RI1)", () => {
  it("builds every workspace package a recorder loads from dist/", () => {
    expect(unbuilt(read(DOCKERFILE))).toEqual([])
  })

  it("reads real imports: the recorders load at least one built package", () => {
    const pkgs = workspace()
    const loaded = [...recorderImports()].filter(
      (name) => pkgs.get(name)?.builtEntry === true
    )
    expect(loaded).toContain("@some-ui/engagement")
  })

  it("fails a Dockerfile whose filter for such a package is dropped", () => {
    const dropped = read(DOCKERFILE).replace(
      /\s*--filter="@some-ui\/engagement\.\.\." \\/,
      ""
    )
    expect(unbuilt(dropped)).toContain("@some-ui/engagement")
  })
})
