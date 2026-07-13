import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Theorem D.2 (Kernel independence), S11 acceptance criterion: "The
 * entire suite runs and passes with `adapter/null-adapter.ts` as the only
 * adapter in the tree — CI fails the build if any test file imports
 * anything resembling a concrete domain adapter." Enforced twice: the
 * eslint `no-restricted-imports` rule (Corollary D.2.1, S7) catches an
 * import-level violation anywhere in `src/`; this test additionally
 * asserts, by directory listing, that no second concrete adapter file has
 * been added to `adapter/` at all.
 */

const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url))
const E2E_DIR = join(ADAPTER_DIR, "..", "..", "tests", "e2e")

const ALLOWED_ADAPTER_FILES = new Set([
  "null-adapter.ts",
  "null-adapter.test.ts",
  "invoke.ts",
  "invoke.test.ts",
  "kernel-independence.test.ts",
])

function allTsFiles(dir: string): Array<string> {
  const files: Array<string> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue
      files.push(...allTsFiles(full))
    } else if (entry.name.endsWith(".ts")) {
      files.push(full)
    }
  }
  return files
}

describe("adapter/ — Theorem D.2 kernel independence", () => {
  it("adapter/ contains no file beyond the null adapter and its call site", () => {
    const actual = readdirSync(ADAPTER_DIR).filter((name) =>
      name.endsWith(".ts")
    )
    for (const name of actual) {
      expect(ALLOWED_ADAPTER_FILES.has(name)).toBe(true)
    }
  })

  it("no e2e test/harness file imports a concrete adapter other than the null adapter", () => {
    for (const file of allTsFiles(E2E_DIR)) {
      const contents = readFileSync(file, "utf8")
      const adapterImports =
        contents.match(/from\s+["'][^"']*\/adapter\/[^"']+["']/g) ?? []
      for (const importStatement of adapterImports) {
        const isAllowed = /\/adapter\/(null-adapter|invoke)["']$/.test(
          importStatement
        )
        expect(isAllowed).toBe(true)
      }
    }
  })
})
