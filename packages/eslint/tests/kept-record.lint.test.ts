/**
 * Lint-time tests for kept-record/no-raw-storage, KR1's guard: in apps/www
 * and packages/ui the page's storage is reached only through core-utils, so
 * a store cannot read a kept record with a parser of its own.
 */

import keptRecordConfig from "@eslint/configs/kept-record.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const RULE = "kept-record/no-raw-storage"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: typescriptParser },
    },
    ...keptRecordConfig,
  ])
}

describe("lint: kept-record/no-raw-storage", () => {
  it.each([
    ["bare localStorage", `localStorage.getItem("k")`],
    ["window.localStorage", `window.localStorage.setItem("k", "v")`],
    ["globalThis.sessionStorage", `globalThis.sessionStorage.getItem("k")`],
    ["optional window access", `window?.localStorage?.getItem("k")`],
    ["typeof localStorage", `const has = typeof localStorage !== "undefined"`],
  ])("fires on %s", async (title, code) => {
    const msgs = await lintSnippet(makeConfig(), code, "src/store.ts")
    expectMessageForRule(msgs, RULE, title)
  })

  it.each([
    ["the owner's accessor", `localStorageOrNull()?.getItem("k")`],
    ["a port's property", `deps.localStorage.getItem("k")`],
    ["an object key", `const names = { localStorage: 1 }`],
  ])("does not fire on %s", async (title, code) => {
    const msgs = await lintSnippet(makeConfig(), code, "src/store.ts")
    expectNoMessageForRule(msgs, RULE, title)
  })

  it("leaves tests to touch storage directly", async () => {
    const msgs = await lintSnippet(
      makeConfig(),
      `window.localStorage.clear()`,
      "src/__tests__/store.test.ts"
    )
    expectNoMessageForRule(msgs, RULE, "a test file")
  })
})
