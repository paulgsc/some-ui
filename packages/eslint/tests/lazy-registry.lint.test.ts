/**
 * Tests for lazy-registry/no-eager-registry-import, in two layers.
 *
 * Rule behaviour: syntactic (it reads `importKind`), so lintSnippet()
 * suffices.
 *
 * Preset assembly: the rule is deliberately not in maishatuRecommended, since
 * only an app has an entry chunk a static import can short-circuit. That
 * scoping lives only in which preset carries the config.
 */

import { lazyRegistryPlugin } from "@eslint/configs/lazy-registry.config.js"
import { appsRecommended, maishatuRecommended } from "@eslint/index.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"
import { describe, expect, it } from "vitest"

import type { SnippetCase } from "./helpers/eslint-resolver.js"
import { expectSnippet } from "./helpers/eslint-resolver.js"

const HOST_FILE = "src/route.tsx"
const RULE = "lazy-registry/no-eager-registry-import"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: typescriptParser },
      plugins: { "lazy-registry": lazyRegistryPlugin },
      rules: {
        [RULE]: [
          "error",
          {
            packages: ["@some-ui/honeycomb", "@some-ui/interview"],
            allow: ["@some-ui/slideshow"],
          },
        ],
      },
    },
  ])
}

describe("lint: lazy-registry/no-eager-registry-import", () => {
  it.each<SnippetCase>([
    [
      "flags a value import of a registry-loaded package",
      `import { interviewQuestions } from "@some-ui/interview"`,
      RULE,
      true,
    ],
    [
      "flags a default value import",
      `import Honeycomb from "@some-ui/honeycomb"`,
      RULE,
      true,
    ],
    // No specifiers at all, but still a static edge — this is how a CSS or
    // register-on-import module drags a whole package into the entry chunk.
    [
      "flags a bare side-effect import",
      `import "@some-ui/honeycomb"`,
      RULE,
      true,
    ],
    [
      "does NOT flag a declaration-level type import",
      `import type { WordEntry } from "@some-ui/honeycomb"`,
      RULE,
      false,
    ],
    [
      "does NOT flag a declaration whose every specifier is type-qualified",
      `import { type WordEntry, type HexCell } from "@some-ui/honeycomb"`,
      RULE,
      false,
    ],
    [
      "DOES flag a mixed declaration \u2014 one value specifier is a bundle edge",
      `import { type WordEntry, seedWords } from "@some-ui/honeycomb"`,
      RULE,
      true,
    ],
    [
      "does NOT flag an allow-listed package",
      `import { editorReducer } from "@some-ui/slideshow"`,
      RULE,
      false,
    ],
    [
      "does NOT flag a package the registry does not load",
      `import { Badge } from "@some-ui/shared"`,
      RULE,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(makeConfig(), code, HOST_FILE, rule, fires, title)
  )
})

/** Asserted on the preset arrays: the question is which preset carries the config. */

function carriesRule(preset: Config, ruleId: string): boolean {
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(walk)
    if (typeof value !== "object" || value === null) return false
    const rules: unknown = Reflect.get(value, "rules")
    if (typeof rules !== "object" || rules === null) return false
    return Reflect.has(rules, ruleId)
  }
  return walk(preset)
}

describe("preset assembly: lazy-registry is app-scoped", () => {
  it("is carried by appsRecommended", () => {
    expect(carriesRule(appsRecommended, RULE)).toBe(true)
  })

  it("is NOT carried by maishatuRecommended, which every library extends", () => {
    expect(carriesRule(maishatuRecommended, RULE)).toBe(false)
  })
})
