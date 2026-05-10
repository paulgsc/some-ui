
/**
 *
 * LAYER 2 — Lint-time integration tests (lintText)
 *
 * Proves the configured rules actually produce (or suppress) lint messages
 * when ESLint processes real code.  Layer 1 (typescript.config.test.ts)
 * proves severity is wired; this layer proves parser + plugin + rule are
 * all connected so rules can actually fire.
 *
 * filePath passed to lintSnippet must be RELATIVE (e.g. "src/foo.ts").
 * ESLint evaluates files[] globs relative to cwd (PACKAGE_ROOT). Absolute
 * paths can silently fail to match globs, producing zero messages.
 */

import { describe, it } from "vitest"

import typescriptConfig from "../src/configs/typescript.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

// ── explicit-function-return-type ──────────────────────────────────────────

describe("lint: @typescript-eslint/explicit-function-return-type", () => {
  it("fires on a function missing a return type annotation", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `export function greet(name: string) { return "hello " + name }`,
      "src/foo.ts"
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
      "src/foo.ts"
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
      "src/foo.js"
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
      "src/rollup.config.ts"
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
      `export function process(data: any): void { void data }`,
      "src/foo.ts"
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
      `export function process(data: unknown): void { void data }`,
      "src/foo.ts"
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
    const messages = await lintSnippet(
      typescriptConfig,
      // Foo is used only as a type — should require `import type`
      `import { Linter } from "eslint"; export type Bar = Linter.Config`,
      "src/foo.ts"
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
      `import type { Linter } from "eslint"; export type Bar = Linter.Config`,
      "src/foo.ts"
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
      "src/foo.ts"
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
      "src/foo.ts"
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
      "src/foo.ts"
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
      "src/foo.ts"
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
      "src/foo.ts"
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
      "src/foo.ts"
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
      "src/foo.ts"
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      ".ts file with arr[0] indexed access"
    )
  })

  it("does NOT fire on dot property access", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const obj = { x: 1 }; export const x = obj.x`,
      "src/foo.ts"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-syntax",
      ".ts file with dot access"
    )
  })
})

// ── no-unused-vars replacement ─────────────────────────────────────────────

describe("lint: no-unused-vars replacement (core off, TS-aware on)", () => {
  it("@typescript-eslint/no-unused-vars fires on an unused variable", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const unused = 42; export const x = 1`,
      "src/foo.ts"
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
      "src/foo.ts"
    )
    expectNoMessageForRule(
      messages,
      "no-unused-vars",
      ".ts file — core rule must be off"
    )
  })

  it("underscore-prefixed variables are ignored per config options", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `const _ignored = 42; export const x = 1`,
      "src/foo.ts"
    )
    expectNoMessageForRule(
      messages,
      "@typescript-eslint/no-unused-vars",
      ".ts file with _-prefixed var"
    )
  })
})

// ── JS file: no type-aware bleed ──────────────────────────────────────────

describe("lint: JS file — no type-aware rule messages emitted", () => {
  it("no @typescript-eslint/* rule fires on a plain .js file", async () => {
    const messages = await lintSnippet(
      typescriptConfig,
      `async function x() { Promise.resolve(1) }`,
      "src/foo.js"
    )
    const tsMessages = messages.filter(
      (m) =>
        m.ruleId?.startsWith("@typescript-eslint/") &&
        m.ruleId !== "@typescript-eslint/no-unused-vars"
    )
    if (tsMessages.length > 0) {
      throw new Error(
        `No type-aware @typescript-eslint rules should fire on .js, but got:\n` +
          tsMessages.map((m) => `  ${m.ruleId} (line ${m.line})`).join("\n")
      )
    }
  })
})
