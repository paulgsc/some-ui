/**
 * VS1 (`build.treeshake.ts`, #3121): a bare import in www's `src/` names a
 * module the release build keeps. The bundler treats every unlisted module
 * as side-effect free, so a bare import of one is dropped with what it does
 * on load, as `lib/demo/viewer-storage` once was on the Pages build.
 * `tests/local-mode/viewer-storage.spec.ts` checks the built app itself.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { LOAD_TIME_MODULES, moduleSideEffects } from "@/build.treeshake"
import { describe, expect, it } from "vitest"

const WWW = join(import.meta.dirname, "../../../..")
/**
 * Every workspace package, a superset of those www bundles, which the same
 * setting shakes.
 */
const PACKAGES = join(WWW, "../../packages")

function sources(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Tests and their setup run in vitest, never in a bundle.
      return /^(node_modules|dist|__tests__|tests|vitest)$/.test(entry.name)
        ? []
        : sources(path)
    }
    return /\.(ts|tsx|mts|cts|js|jsx|mjs)$/.test(entry.name) &&
      !/\.(test|spec)\.|\.config\.|^vitest\.setup\./.test(entry.name)
      ? [path]
      : []
  })
}

/**
 * Every import that binds nothing and is not a stylesheet, in the files
 * under `dir`: `import "x"`, `import"x"` and `import {} from "x"`, which the
 * bundler drops alike.
 */
function bareImports(dir: string): Array<{ file: string; specifier: string }> {
  return sources(dir).flatMap((file) =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /^\s*import\s*(?:\{\s*\}\s*from\s*)?["']([^"']+)["']/gm
      ),
    ]
      .map((m) => m[1])
      .filter((s) => !s.endsWith(".css"))
      .map((s) => ({ file: relative(WWW, file), specifier: s }))
  )
}

/** `@/lib/x` -> `src/lib/x.ts` or `src/lib/x/index.ts`, whichever exists. */
function resolveAlias(specifier: string): ReadonlyArray<string> {
  const base = `src/${specifier.slice(2)}`
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
}

describe("modules that act on load", () => {
  it("lists every module www's source imports bare", () => {
    expect(sources(join(WWW, "src")).map((f) => relative(WWW, f))).toContain(
      "src/main.tsx"
    )
    const bare = bareImports(join(WWW, "src"))
    expect(bare.length).toBeGreaterThan(0)
    for (const { file, specifier } of bare) {
      expect(specifier, `${file}: a bare import goes through "@/"`).toMatch(
        /^@\//
      )
      expect(
        resolveAlias(specifier).some((m) => LOAD_TIME_MODULES.includes(m)),
        `${file} imports ${specifier} bare: list it in build.treeshake.ts`
      ).toBe(true)
    }
  })

  it("finds no bare import in the workspace packages, which nothing would keep", () => {
    // The setting reaches every module in the bundle, not only www's own:
    // a package's bare import would be dropped the same way, and
    // moduleSideEffects keeps only www's own listed files, so one needs
    // build.treeshake.ts to learn packages first.
    expect(sources(PACKAGES).length).toBeGreaterThan(100)
    expect(bareImports(PACKAGES)).toEqual([])
  })

  it("keeps a listed module and no other", () => {
    expect(
      moduleSideEffects("/repo/apps/www/src/lib/demo/viewer-storage.ts")
    ).toBe(true)
    expect(moduleSideEffects("/repo/apps/www/src/lib/demo/index.ts")).toBe(
      false
    )
    expect(
      moduleSideEffects("/repo/packages/x/src/lib/demo/viewer-storage.ts")
    ).toBe(false)
  })
})
