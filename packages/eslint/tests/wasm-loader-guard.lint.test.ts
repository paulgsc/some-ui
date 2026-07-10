/**
 * LAYER 2 — Lint-time integration tests for
 * wasm-loader-guard/no-bare-wasm-singleton (UTL-WASM epic #529, S5).
 *
 * Purely syntactic (ImportExpression/CallExpression shape checks, no type
 * information needed), so a plain @typescript-eslint/parser (no `project`/
 * `projectService` option) is enough. Same rationale as
 * switch-lint.lint.test.ts.
 */

import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import { wasmLoaderGuardPlugin } from "../src/configs/wasm-loader-guard.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TS_FILE = "src/example.ts"
const RULE_ID = "wasm-loader-guard/no-bare-wasm-singleton"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.ts"],
      languageOptions: { parser: typescriptParser },
      plugins: { "wasm-loader-guard": wasmLoaderGuardPlugin },
      rules: {
        "wasm-loader-guard/no-bare-wasm-singleton": "error",
      },
    },
  ])
}

describe("lint: wasm-loader-guard/no-bare-wasm-singleton", () => {
  it("fires on a bare module-level dynamic import + singleton assignment", async () => {
    const code = `
let wasmModule: unknown = null

export async function loadWasm() {
  const mod = await import("polyhedron")
  await mod.default()
  wasmModule = mod
  return wasmModule
}
`
    const msgs = await lintSnippet(makeConfig(), code, TS_FILE)
    expectMessageForRule(msgs, RULE_ID, "bare polyhedron singleton import")
  })

  it("fires for each of the 8 known wasm-bindgen crate names", async () => {
    const crates = [
      "hangul-game-core",
      "leetype-wasm",
      "polyhedron",
      "some-bricks",
      "some-charts",
      "some-crossword",
      "some-hexagon",
      "viewport-rotation",
    ]

    for (const crate of crates) {
      const code = `export const load = () => import("${crate}")`
      const msgs = await lintSnippet(makeConfig(), code, TS_FILE)
      expectMessageForRule(msgs, RULE_ID, `bare import of "${crate}"`)
    }
  })

  it("does not fire on a dynamic import of an unrelated package", async () => {
    const code = `export const load = () => import("some-random-package")`
    const msgs = await lintSnippet(makeConfig(), code, TS_FILE)
    expectNoMessageForRule(msgs, RULE_ID, "unrelated dynamic import")
  })

  it("does not fire when the import is inside createWasmLoader's importModule option", async () => {
    const code = `
import { createWasmLoader } from "@some-ui/wasm-loader"

const loader = createWasmLoader({
  importModule: async () => {
    const mod = await import("polyhedron")
    await mod.default()
    return mod
  },
})
`
    const msgs = await lintSnippet(makeConfig(), code, TS_FILE)
    expectNoMessageForRule(
      msgs,
      RULE_ID,
      "import() inside createWasmLoader's importModule callback"
    )
  })

  it("still fires on a second, sibling bare import outside the exempted callback", async () => {
    const code = `
import { createWasmLoader } from "@some-ui/wasm-loader"

const loader = createWasmLoader({
  importModule: async () => {
    const mod = await import("polyhedron")
    await mod.default()
    return mod
  },
})

// A second, unrelated bare load of the same crate - not covered by the
// loader above, so it must still be flagged.
export async function legacyLoad() {
  return import("polyhedron")
}
`
    const msgs = await lintSnippet(makeConfig(), code, TS_FILE)
    const offending = msgs.filter((m) => m.ruleId === RULE_ID)
    expect(offending).toHaveLength(1)
    expect(offending[0]?.line).toBeGreaterThan(10) // the legacyLoad() import, not the exempted one
  })

  it("does not fire on a static import of a wasm crate (a different, untracked anti-pattern shape)", async () => {
    const code = `
import init, { CrosswordGenerator } from "some-crossword"
export const generator = new CrosswordGenerator([], 1)
void init
`
    const msgs = await lintSnippet(makeConfig(), code, TS_FILE)
    expectNoMessageForRule(msgs, RULE_ID, "static import of a wasm crate")
  })
})
