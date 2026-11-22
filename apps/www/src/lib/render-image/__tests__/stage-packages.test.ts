/**
 * The render image builds every workspace package its stage bundles (RI3,
 * #2990). `build:stage` resolves a workspace package through its
 * `package.json`, and one whose entry names dist/ resolves only once built;
 * infra/render/build.sh builds only what its filters name. The stage's are
 * read from its imports (`@/stage-packages`), so they move with the stage.
 *
 * What this holds: the walk reads each shape an import takes, follows www's
 * aliases, and stops loudly on one it cannot follow; and build.sh, which the
 * Dockerfile and pr.yml's render-stage job both run, reads it.
 * The build itself, from a checkout with no dist/, is that job's: it is the
 * proof over the Family (every change to a package's dependencies, every
 * stage import), since only a real build knows what resolves.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { specifiersOf, stagePackages } from "@/stage-packages"
import { describe, expect, it } from "vitest"

/** apps/www/src/lib/render-image/__tests__ -> the repository root. */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../.."
)

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8")
}

/** An app of its own: a tsconfig with www's aliases, and the given files. */
function app(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "stage-packages-"))
  const all: Record<string, string> = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        paths: {
          "@/*": ["./src/*"],
          "@some-ui/content-registry": ["../registry/src"],
        },
      },
    }),
    "stage/index.html": '<script type="module" src="./main.tsx"></script>',
    "vite.config.ts": 'import { defineConfig } from "vite"\n',
    ...files,
  }
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

describe("the render image's stage packages (RI3)", () => {
  it("reads the real stage's imports, through www's source and aliases", () => {
    const reached = stagePackages()
    // Through src/lib/file-host-config, the import #2990 lost.
    expect(reached).toContain("@some-ui/fetch-kit")
    // A tsconfig path into the package's source still names the package.
    expect(reached).toContain("@some-ui/content-registry")
    // Through vite.config.ts.
    expect(reached).toContain("@some-ui/styles")
  })

  it("follows every shape of import and leaves type-only ones", () => {
    const dir = app({
      "stage/index.html": [
        '<link rel="stylesheet" href="/src/page.css" />',
        '<script type="module" src="./main.tsx"></script>',
      ].join("\n"),
      "stage/main.tsx": [
        'import "@/side-effect"',
        'import { a } from "@/a"',
        'import type { T } from "@some-ui/types-only"',
        'export type { U } from "@some-ui/types-only-too"',
        'import { type K } from "@some-ui/kept-module"',
        'import type from "@some-ui/named-type"',
        'export * from "./again"',
        'export * as ns from "@some-ui/namespace"',
        'const lazy = () => import("@/lazy")',
        'const quiet = () => import(/* @vite-ignore */ "@some-ui/ignored")',
        'const x = 1; import { y }from"@some-ui/same-line"',
        'import "@/index.css"',
        'import registry from "@some-ui/content-registry"',
        'import react from "react"',
      ].join("\n"),
      "stage/again.ts": 'export { b } from "@some-ui/re-exported/sub"\n',
      "src/side-effect.ts": 'import "@some-ui/side"\n',
      "src/a/index.ts": [
        "import {",
        "  one,",
        "  two,",
        '} from "@some-ui/multi-line"',
      ].join("\n"),
      "src/lazy.tsx": 'import { c } from "@some-ui/lazy"\n',
      "src/index.css": '@import "@some-ui/styled/tailwind.css";\n',
      "src/page.css": '@import "@some-ui/linked/page.css";\n',
    })
    expect(stagePackages(dir)).toEqual([
      "@some-ui/content-registry",
      "@some-ui/ignored",
      "@some-ui/kept-module",
      "@some-ui/lazy",
      "@some-ui/linked",
      "@some-ui/multi-line",
      "@some-ui/named-type",
      "@some-ui/namespace",
      "@some-ui/re-exported",
      "@some-ui/same-line",
      "@some-ui/side",
      "@some-ui/styled",
    ])
  })

  it("fails on a require, which it does not read", () => {
    expect(() =>
      specifiersOf('const x = require("@some-ui/req")', ".js")
    ).toThrow(/a require/)
    expect(() =>
      specifiersOf('import x = require("@some-ui/eq")', ".ts")
    ).toThrow(/a require/)
  })

  it("fails on a dynamic import of anything but a string", () => {
    expect(() =>
      specifiersOf(
        "const load = (name: string) => import(`@some-ui/${name}`)",
        ".ts"
      )
    ).toThrow(/a dynamic import of no plain string/)
  })

  it("fails on a path into the app that resolves to no file", () => {
    const dir = app({ "stage/main.tsx": 'import { gone } from "@/gone"\n' })
    expect(() => stagePackages(dir)).toThrow(/"@\/gone" in stage\/main.tsx/)
  })

  it("reads no import out of a doc comment", () => {
    expect(
      specifiersOf(
        '/**\n * import { x } from "@some-ui/prose"\n * import("@some-ui/too")\n */\n',
        ".ts"
      )
    ).toEqual([])
  })

  it("is what build.sh builds, and what the Dockerfile and the PR job run", () => {
    expect(read("infra/render/build.sh")).toMatch(
      /^\s*pnpm exec tsx apps\/www\/scripts\/stage-packages\.ts --filters \|\| exit 1$/m
    )
    expect(read("infra/render/Dockerfile")).toMatch(
      /^\s*&& sh infra\/render\/build\.sh \\$/m
    )
    const job = read(".github/workflows/pr.yml")
    expect(job).toMatch(/'RUN corepack enable && sh infra\/render\/build\.sh/)
    // Through the image's own ignore file, not the root .dockerignore.
    expect(job).toMatch(
      /cp infra\/render\/Dockerfile\.dockerignore "\$RUNNER_TEMP\/stage\.Dockerfile\.dockerignore"/
    )
  })
})
