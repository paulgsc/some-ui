/**
 * LAYER 2 — Lint-time integration tests for
 * build-hygiene/no-manual-build-exclude.
 *
 * Uses lintSnippet()/lintSnippetFixed() (lintText() under the hood) because the
 * rule is purely syntactic — it walks the createViteConfig({...}) call's
 * ObjectExpression and never needs type information. Same rationale as
 * switch-lint.lint.test.ts, so a plain @typescript-eslint/parser is enough.
 */

import { buildHygienePlugin } from "@eslint/configs/build-hygiene.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
  lintSnippetFixed,
} from "./helpers/eslint-resolver.js"

const VITE_FILE = "vite.config.ts"
const RULE = "build-hygiene/no-manual-build-exclude"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.ts"],
      languageOptions: { parser: typescriptParser },
      plugins: { "build-hygiene": buildHygienePlugin },
      rules: { [RULE]: "error" },
    },
  ])
}

describe("lint: build-hygiene/no-manual-build-exclude", () => {
  it("flags a universal exclude (test glob) re-listed per-workspace", async () => {
    const code = `
import { createViteConfig } from "@some-ui/vite-config"
export default createViteConfig({
  packageName: "x",
  dtsOptions: { exclude: ["**/*.test.*", "**/keep-me/**"] },
})
`
    const msgs = await lintSnippet(makeConfig(), code, VITE_FILE)
    expectMessageForRule(msgs, RULE, "test glob in dtsOptions.exclude")
  })

  it("flags a cross-package shared-content path", async () => {
    const code = `
import { createViteConfig } from "@some-ui/vite-config"
export default createViteConfig({
  packageName: "x",
  contentPackage: true,
  dtsOptions: { exclude: ["../../some-content-registry/src/**/*", "**/recap/**"] },
})
`
    const msgs = await lintSnippet(makeConfig(), code, VITE_FILE)
    expectMessageForRule(msgs, RULE, "some-content-registry cross-package path")
  })

  it("does NOT flag a genuinely package-specific glob", async () => {
    const code = `
import { createViteConfig } from "@some-ui/vite-config"
export default createViteConfig({
  packageName: "x",
  dtsOptions: { exclude: ["**/obs-monitor/**", "**/recap/**"] },
})
`
    const msgs = await lintSnippet(makeConfig(), code, VITE_FILE)
    expectNoMessageForRule(msgs, RULE, "package-specific globs")
  })

  it("does NOT flag **/demo/** when contentPackage is not set", async () => {
    // umag pattern: demo is only centralized for content packages.
    const code = `
import { createViteConfig } from "@some-ui/vite-config"
export default createViteConfig({
  packageName: "umag",
  dtsOptions: { exclude: ["**/demo/**"] },
})
`
    const msgs = await lintSnippet(makeConfig(), code, VITE_FILE)
    expectNoMessageForRule(msgs, RULE, "demo without contentPackage")
  })

  it("DOES flag **/demo/** when contentPackage is true", async () => {
    const code = `
import { createViteConfig } from "@some-ui/vite-config"
export default createViteConfig({
  packageName: "x",
  contentPackage: true,
  dtsOptions: { exclude: ["**/demo/**", "**/keep/**"] },
})
`
    const msgs = await lintSnippet(makeConfig(), code, VITE_FILE)
    expectMessageForRule(msgs, RULE, "demo with contentPackage")
  })

  it("autofix removes only the redundant element, keeping package-specific ones", async () => {
    const code = `
import { createViteConfig } from "@some-ui/vite-config"
export default createViteConfig({
  packageName: "x",
  dtsOptions: { exclude: ["**/*.test.*", "**/recap/**"] },
})
`
    const { output } = await lintSnippetFixed(makeConfig(), code, VITE_FILE)
    expect(output).toContain('"**/recap/**"')
    expect(output).not.toContain('"**/*.test.*"')
  })

  it("autofix drops the whole exclude when every glob is centralized", async () => {
    const code = `
import { createViteConfig } from "@some-ui/vite-config"
export default createViteConfig({
  packageName: "x",
  contentPackage: true,
  dtsOptions: { exclude: ["../../some-content-registry/src/**/*", "**/*.test.*"] },
})
`
    const { output } = await lintSnippetFixed(makeConfig(), code, VITE_FILE)
    expect(output).not.toContain("exclude")
    expect(output).not.toContain("some-content-registry")
  })

  it("is inert for a plain defineConfig (extension/app vite config)", async () => {
    const code = `
import { defineConfig } from "vite"
export default defineConfig({
  build: { rollupOptions: { input: { content: "src/content.ts" } } },
})
`
    const msgs = await lintSnippet(makeConfig(), code, VITE_FILE)
    expectNoMessageForRule(msgs, RULE, "plain defineConfig")
  })
})
