/**
 * Tests for lazy-registry/no-eager-registry-import, in two layers.
 *
 * LAYER 2 — rule behaviour. The rule is purely syntactic (it reads
 * `importKind` off the declaration and its specifiers), so a plain
 * @typescript-eslint/parser is enough and lintSnippet() suffices. Same
 * rationale as build-hygiene.lint.test.ts.
 *
 * LAYER 1 — preset assembly. This rule is deliberately NOT in
 * maishatuRecommended: a static import can only short-circuit the content
 * registry's dynamic boundary in something that has an entry chunk, which
 * is an app. A library importing a sibling library is ordinary composition.
 * That scoping lives in which preset carries the config, and nowhere else,
 * so it is worth a test — turning it back on globally is a one-line edit
 * that nothing else would catch.
 */

import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"
import { describe, expect, it } from "vitest"

import { lazyRegistryPlugin } from "../src/configs/lazy-registry.config.js"
import { appsRecommended, maishatuRecommended } from "../src/index.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

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
  it("flags a value import of a registry-loaded package", async () => {
    const code = `import { interviewQuestions } from "@some-ui/interview"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectMessageForRule(msgs, RULE, "value import of a watched package")
  })

  it("flags a default value import", async () => {
    const code = `import Honeycomb from "@some-ui/honeycomb"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectMessageForRule(msgs, RULE, "default import of a watched package")
  })

  it("flags a bare side-effect import", async () => {
    // No specifiers at all, but still a static edge — this is how a CSS or
    // register-on-import module drags a whole package into the entry chunk.
    const code = `import "@some-ui/honeycomb"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectMessageForRule(msgs, RULE, "side-effect import of a watched package")
  })

  it("does NOT flag a declaration-level type import", async () => {
    const code = `import type { WordEntry } from "@some-ui/honeycomb"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectNoMessageForRule(msgs, RULE, "import type")
  })

  it("does NOT flag a declaration whose every specifier is type-qualified", async () => {
    const code = `import { type WordEntry, type HexCell } from "@some-ui/honeycomb"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectNoMessageForRule(msgs, RULE, "per-specifier type imports")
  })

  it("DOES flag a mixed declaration — one value specifier is a bundle edge", async () => {
    const code = `import { type WordEntry, seedWords } from "@some-ui/honeycomb"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectMessageForRule(msgs, RULE, "mixed type/value specifiers")
  })

  it("does NOT flag an allow-listed package", async () => {
    const code = `import { editorReducer } from "@some-ui/slideshow"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectNoMessageForRule(msgs, RULE, "allow-listed package")
  })

  it("does NOT flag a package the registry does not load", async () => {
    const code = `import { Badge } from "@some-ui/shared"`
    const msgs = await lintSnippet(makeConfig(), code, HOST_FILE)
    expectNoMessageForRule(msgs, RULE, "unwatched package")
  })
})

/**
 * Asserted on the preset arrays rather than through
 * `calculateConfigForFile`, because the question here is which preset
 * *carries* the config - not what severity a given file resolves to. The
 * end-to-end behaviour is covered above and by apps/www's own lint run;
 * this is the assembly, which is the thing a one-line edit can quietly
 * undo.
 */
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
