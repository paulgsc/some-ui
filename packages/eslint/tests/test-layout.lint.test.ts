/**
 * LAYER 2 — Lint-time integration tests for build-hygiene/test-layout (#1475).
 *
 * The rule counts the *.test.* files in the linted file's own directory, so
 * unlike the purely syntactic rules it needs real directories on disk: those
 * live under tests/lint-fixtures/test-layout/ (ignored by this package's own
 * lint and vitest runs). lintSnippet() lints the given text as if it were at
 * that path, and the rule reads the path's directory.
 *
 * Linted through the exported `buildHygieneConfig` itself rather than a
 * hand-built config block, so the preset's `files` glob is under test too: a
 * glob that stopped matching test files would silently switch the rule off in
 * every workspace.
 */

import buildHygieneConfig from "@eslint/configs/build-hygiene.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const RULE = "build-hygiene/test-layout"
const FIXTURES = "tests/lint-fixtures/test-layout"
const CODE = "export {}\n"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    { languageOptions: { parser: typescriptParser } },
    ...buildHygieneConfig,
  ])
}

async function lint(relativePath: string): Promise<Array<Linter.LintMessage>> {
  return lintSnippet(makeConfig(), CODE, `${FIXTURES}/${relativePath}`)
}

describe("lint: build-hygiene/test-layout", () => {
  describe("at most one *.test.* per source directory", () => {
    it("flags each test in a directory holding two", async () => {
      for (const file of ["crowded/alpha.test.ts", "crowded/beta.test.tsx"]) {
        const msgs = await lint(file)
        expectMessageForRule(msgs, RULE, file)
        expect(msgs.find((m) => m.ruleId === RULE)?.message).toContain(
          "crowded/ holds 2 test files"
        )
      }
    })

    it("does not flag a directory's only test", async () => {
      expectNoMessageForRule(
        await lint("single/only.test.ts"),
        RULE,
        "single/only.test.ts"
      )
    })

    it("does not flag tests that already live in __tests__/", async () => {
      for (const file of [
        "moved/__tests__/alpha.test.ts",
        "moved/__tests__/beta.test.ts",
      ]) {
        expectNoMessageForRule(await lint(file), RULE, file)
      }
    })

    it("never lints a non-test module, even one sitting beside two tests", async () => {
      expectNoMessageForRule(
        await lint("crowded/index.ts"),
        RULE,
        "crowded/index.ts"
      )
    })
  })

  describe("a src/routes/ tree keeps no test outside __tests__/", () => {
    it("flags a lone test beside route files", async () => {
      const msgs = await lint("app/src/routes/dashboard/index.test.tsx")
      expectMessageForRule(msgs, RULE, "routes/dashboard/index.test.tsx")
      expect(msgs.find((m) => m.ruleId === RULE)?.message).toContain(
        "src/routes/"
      )
    })

    it("flags a test in a routes directory named tests/, which is a route segment there", async () => {
      expectMessageForRule(
        await lint("app/src/routes/tests/index.test.tsx"),
        RULE,
        "routes/tests/index.test.tsx"
      )
    })

    it("does not flag a routes test inside __tests__/", async () => {
      expectNoMessageForRule(
        await lint("app/src/routes/__tests__/index.test.tsx"),
        RULE,
        "routes/__tests__/index.test.tsx"
      )
    })
  })

  it("is an error in the preset, not a warning", async () => {
    const msgs = await lint("crowded/alpha.test.ts")
    expect(msgs.find((m) => m.ruleId === RULE)?.severity).toBe(2)
  })
})
