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

function sources(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

/** `@/lib/x` -> `src/lib/x.ts` or `src/lib/x/index.ts`, whichever exists. */
function resolveAlias(specifier: string): ReadonlyArray<string> {
  const base = `src/${specifier.slice(2)}`
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
}

describe("modules that act on load", () => {
  it("lists every module www's source imports bare", () => {
    const files = sources(join(WWW, "src"))
    expect(files.map((f) => relative(WWW, f))).toContain("src/main.tsx")
    const bare = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/^import "([^"]+)"/gm)]
        .map((m) => m[1])
        .filter((s) => !s.endsWith(".css"))
        .map((s) => ({ file: relative(WWW, file), specifier: s }))
    )
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
