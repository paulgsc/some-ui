/**
 *
 * LAYER 1+2 — Override targeting tests
 *
 * WHAT THIS PROVES:
 *   File-glob targeting in the override config blocks works correctly through
 *   the full assembled maishatuRecommended export.  Specifically:
 *
 *   - overrides-tests.config.ts  → test files get no-console/no-floating-promises/
 *                                   no-deprecated suppressed
 *   - overrides-tools.config.ts  → tools/ files get no-deprecated suppressed and
 *                                   no-explicit-any relaxed to warn
 *
 *   This tests the MOST CRITICAL targeting invariant: type-aware noise rules
 *   must not fire in test files, and no-console must not fire in test/tool files.
 *   If glob matching is wrong, these overrides silently fail to apply and authors
 *   get lint errors in test code that they intentionally suppressed.
 *
 * HOW WE TEST:
 *   Both layers:
 *   1. calculateConfigForFile  — fast structural check, proves severity in merged config
 *   2. lintText               — proves suppression is real at rule-engine level
 *
 * FAILURE MODES CAUGHT:
 *   - Glob pattern too narrow (e.g. "tests/**" not matching "src/foo.test.ts")
 *   - Override config block not spread into maishatuRecommended in index.ts
 *   - Later config block re-enabling a suppressed rule (precedence bug)
 *   - Rule-name typo in override (suppression silently has no effect)
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "vitest"

import maishatuRecommended from "../src/index.js"
import {
  calculateConfig,
  expectError,
  expectMessageForRule,
  expectNoMessageForRule,
  expectOff,
  expectWarn,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const HERE = fileURLToPath(import.meta.url)
const FIXTURES = path.resolve(HERE, "../../lint-fixtures")
const FIX = (rel: string): string => path.join(FIXTURES, rel)

// ── Structural: override suppression visible via calculateConfigForFile ─────

describe("overrides — no-console suppression (structural)", () => {
  it("no-console is off in *.test.ts files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/foo.test.ts")
    )
    expectOff(rules, "no-console", "src/foo.test.ts")
  })

  it("no-console is error in non-test source files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/service.ts")
    )
    expectError(rules, "no-console", "src/service.ts")
  })
})

describe("overrides — no-floating-promises suppression (structural)", () => {
  it("no-floating-promises is off in *.test.ts files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/foo.test.ts")
    )
    expectOff(
      rules,
      "@typescript-eslint/no-floating-promises",
      "src/foo.test.ts"
    )
  })

  it("no-floating-promises is error in source files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/service.ts")
    )
    expectError(
      rules,
      "@typescript-eslint/no-floating-promises",
      "src/service.ts"
    )
  })
})

describe("overrides — no-deprecated suppression (structural)", () => {
  it("no-deprecated is off in test files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/foo.test.ts")
    )
    expectOff(rules, "@typescript-eslint/no-deprecated", "src/foo.test.ts")
  })

  it("no-deprecated is off in tools/ directory", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("tools/codegen.ts")
    )
    expectOff(rules, "@typescript-eslint/no-deprecated", "tools/codegen.ts")
  })

  it("no-deprecated is error in source files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/service.ts")
    )
    expectError(rules, "@typescript-eslint/no-deprecated", "src/service.ts")
  })
})

describe("overrides — no-explicit-any severity in tools (structural)", () => {
  it("no-explicit-any is warn in tools/", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("tools/codegen.ts")
    )
    expectWarn(rules, "@typescript-eslint/no-explicit-any", "tools/codegen.ts")
  })

  it("no-explicit-any is error in source files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/service.ts")
    )
    expectError(rules, "@typescript-eslint/no-explicit-any", "src/service.ts")
  })
})

// ── Lint-time: override suppression actually prevents messages ─────────────
//
// calculateConfigForFile proves severity; lintText proves the rule engine
// respects that severity and produces (or omits) messages accordingly.

describe("overrides — lint: no-console suppressed in test files", () => {
  it("no-console does NOT produce a message in a *.test.ts file", async () => {
    const messages = await lintSnippet(
      maishatuRecommended,
      `export function setup(): void { console.log("setting up") }`,
      FIX("src/foo.test.ts")
    )
    expectNoMessageForRule(messages, "no-console", "src/foo.test.ts")
  })

  it("no-console DOES produce a message in a source .ts file", async () => {
    const messages = await lintSnippet(
      maishatuRecommended,
      `export function greet(): void { console.log("hello") }`,
      FIX("src/service.ts")
    )
    expectMessageForRule(messages, "no-console", "src/service.ts")
  })
})

describe("overrides — lint: no-explicit-any is warn not error in tools/", () => {
  it("no-explicit-any produces a warn-level message in tools/", async () => {
    const messages = await lintSnippet(
      maishatuRecommended,
      // Using any is a violation — but at warn level in tools/
      `export function process(data: any): void {}`,
      FIX("tools/codegen.ts")
    )
    const msg = messages.find(
      (m) => m.ruleId === "@typescript-eslint/no-explicit-any"
    )

    // severity 1 = warning, 2 = error
    if (msg === undefined) {
      throw new Error(
        "Expected @typescript-eslint/no-explicit-any to produce a message in tools/codegen.ts, but none found"
      )
    }

    if (msg.severity !== 1) {
      throw new Error(
        `Expected @typescript-eslint/no-explicit-any to be severity 1 (warn) in tools/, got ${msg.severity} (error)`
      )
    }
  })
})
