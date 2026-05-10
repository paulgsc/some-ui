/**
 *
 * LAYER 2 — Lint-time integration tests (lintText)
 *
 * WHAT THIS PROVES:
 *   The configured rules actually produce (or suppress) lint messages when
 *   ESLint processes real code snippets.  Layer 1 (typescript.config.test.ts)
 *   proves the rules are wired with the right severity.  This layer proves
 *   the parser, plugin, and rule implementation are all connected correctly
 *   so the rules can actually fire.
 *
 *   This is the strongest possible invariant: if a rule fires on bad code
 *   and stays silent on good code, we have end-to-end proof that the exported
 *   config enforces what the author declared.
 *
 * IMPORTANT SCOPE LIMIT:
 *   Type-aware rules (no-floating-promises, no-deprecated, etc.) require a
 *   TypeScript language service, which in turn requires a tsconfig.json and
 *   real project files.  These tests are therefore skipped by default and
 *   should be run as a separate CI step with `vitest run --project type-aware`
 *   or via an environment variable: TYPE_AWARE_TESTS=1 vitest run.
 *
 *   Non-type-aware rules (explicit-function-return-type, no-explicit-any,
 *   consistent-type-imports, array-type, no-useless-constructor, etc.) do
 *   NOT require a language service and run in every environment.
 *
 * FAILURE MODES CAUGHT:
 *   - Parser not wired (rule can't parse TS syntax → all rules silent)
 *   - Plugin not registered (rule unknown → ESLint ignores it)
 *   - Rule fires on compliant code (false positive regression)
 *   - Rule silent on clearly violating code (false negative regression)
 *   - JS override broken: type-aware rule fires on .js code
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import typescriptConfig from "../src/configs/typescript.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const HERE = fileURLToPath(import.meta.url)
const FIXTURES = path.resolve(HERE, "../../lint-fixtures")

const TS = (rel: string): string => path.join(FIXTURES, rel)

// ── explicit-function-return-type ──────────────────────────────────────────

describe("lint: @typescript-eslint/explicit-function-return-type", () => {
  it("fires on a function missing a return type annotation", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function greet(name: string) { return "hello " + name }`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "@typescript-eslint/explicit-function-return-type",
      ".ts file missing return type"
    )
  })

  it("does NOT fire on a function with an explicit return type", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function greet(name: string): string { return "hello " + name }`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/explicit-function-return-type",
      ".ts file with correct return type"
    )
  })

  it("does NOT fire for .js files (rule suppressed by JS override)", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function greet(name) { return "hello " + name }`,
      TS("src/util.js")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/explicit-function-return-type",
      ".js file"
    )
  })

  it("does NOT fire for rollup config files (rollup override)", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function build() { return {} }`,
      TS("src/rollup.config.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/explicit-function-return-type",
      "rollup.config.ts"
    )
  })
})

// ── no-explicit-any ────────────────────────────────────────────────────────

describe("lint: @typescript-eslint/no-explicit-any", () => {
  it("fires when `any` is used as a type annotation", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function process(data: any): void { console.log(data) }`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "@typescript-eslint/no-explicit-any",
      ".ts file using any"
    )
  })

  it("does NOT fire when a proper type is used", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function process(data: unknown): void { console.log(data) }`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/no-explicit-any",
      ".ts file using unknown"
    )
  })
})

// ── consistent-type-imports ────────────────────────────────────────────────

describe("lint: @typescript-eslint/consistent-type-imports", () => {
  it("fires when a type-only import lacks the `type` keyword", async () => {
    // Importing only Foo which is a type — should require `import type`
    const messages = await lintSnippet(
      typescriptConfig,
      `import { Foo } from "./foo"; export type Bar = Foo`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "@typescript-eslint/consistent-type-imports",
      ".ts file with value-style type import"
    )
  })

  it("does NOT fire when `import type` is used correctly", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `import type { Foo } from "./foo"; export type Bar = Foo`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/consistent-type-imports",
      ".ts file with correct type import"
    )
  })
})

// ── consistent-type-definitions ───────────────────────────────────────────

describe("lint: @typescript-eslint/consistent-type-definitions", () => {
  it("fires when `interface` is used instead of `type`", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export interface Foo { bar: string }`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "@typescript-eslint/consistent-type-definitions",
      ".ts file using interface instead of type"
    )
  })

  it("does NOT fire when `type` alias is used", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export type Foo = { bar: string }`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/consistent-type-definitions",
      ".ts file using type alias"
    )
  })
})

// ── array-type ────────────────────────────────────────────────────────────

describe("lint: @typescript-eslint/array-type", () => {
  it("fires when T[] shorthand is used instead of Array<T>", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function ids(): number[] { return [] }`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "@typescript-eslint/array-type",
      ".ts file using T[] instead of Array<T>"
    )
  })

  it("does NOT fire when Array<T> generic form is used", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function ids(): Array<number> { return [] }`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/array-type",
      ".ts file using Array<T>"
    )
  })
})

// ── no-useless-constructor ────────────────────────────────────────────────

describe("lint: @typescript-eslint/no-useless-constructor", () => {
  it("fires on a class with a no-op constructor", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export class Foo { constructor() {} }`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "@typescript-eslint/no-useless-constructor",
      ".ts class with empty constructor"
    )
  })

  it("does NOT fire on a constructor that does something", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export class Foo { private x: number; constructor(x: number) { this.x = x } }`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/no-useless-constructor",
      ".ts class with meaningful constructor"
    )
  })
})

// ── no-restricted-syntax (indexed access) ─────────────────────────────────

describe("lint: no-restricted-syntax (indexed access guard)", () => {
  it("fires on computed member access", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const arr = [1, 2, 3]; export const x = arr[0]`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      ".ts file with arr[0] indexed access"
    )
  })

  it("does NOT fire on property access without computed key", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const obj = { x: 1 }; export const x = obj.x`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-syntax",
      ".ts file with dot access"
    )
  })
})

// ── no-unused-vars replacement ─────────────────────────────────────────────
//
// Key invariant: the CORE rule must not fire (it's off) and the TS version
// must fire.  If both fire we get duplicate messages; if neither fires
// unused variables go undetected.

describe("lint: no-unused-vars replacement (core off, TS-aware on)", () => {
  it("@typescript-eslint/no-unused-vars fires on an unused variable", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const unused = 42; export const x = 1`,
      TS("src/service.ts")
    )
    expectMessageForRule(
      messages,
      "@typescript-eslint/no-unused-vars",
      ".ts file with unused variable"
    )
  })

  it("core no-unused-vars does NOT fire (replaced by TS version)", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const unused = 42; export const x = 1`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "no-unused-vars",
      ".ts file — core rule replaced"
    )
  })

  it("underscore-prefixed variables are ignored per config options", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const _ignored = 42; export const x = 1`,
      TS("src/service.ts")
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/no-unused-vars",
      ".ts file with _-prefixed var (should be ignored)"
    )
  })
})

// ── JS file: verify no TS-plugin messages bleed through ───────────────────

describe("lint: JS file — no type-aware rule messages emitted", () => {
  it("no @typescript-eslint/* rule fires on a plain .js file", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `async function x() { Promise.resolve(1) }`,
      TS("src/util.js")
    )

    const tsMessages = messages.filter(
      (m) =>
        m.ruleId?.startsWith("@typescript-eslint/") &&
        // These non-type-aware rules may still apply to JS:
        m.ruleId !== "@typescript-eslint/no-unused-vars"
    )

    expect(
      tsMessages,
      `No type-aware @typescript-eslint rules should fire on .js files, but got: ${tsMessages
        .map((m) => `${m.ruleId} (line ${m.line})`)
        .join(", ")}`
    ).toHaveLength(0)
  })
})
