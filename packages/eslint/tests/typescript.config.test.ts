/**
 * Config wiring tests for typescript.config.ts, via calculateConfigForFile:
 * every rule resolves to the right severity in the merged flat config. Paths
 * are absolute stubs under tests/lint-fixtures/.
 */

import path from "node:path"
import typescriptConfig from "@eslint/configs/typescript.config.js"
import { describe, expect, it } from "vitest"

import {
  calculateConfig,
  expectError,
  expectOff,
  LINT_FIXTURES,
} from "./helpers/eslint-resolver.js"

const TS = path.join(LINT_FIXTURES, "src/service.ts")
const JS = path.join(LINT_FIXTURES, "src/util.js")
const ROLL = path.join(LINT_FIXTURES, "src/rollup.config.ts")

// ── TS file: all declared error rules ─────────────────────────────────────

describe("typescript.config — error rules wired for .ts files", () => {
  const rulesPromise = calculateConfig(typescriptConfig, TS)

  const EXPECTED_ERRORS = [
    "@typescript-eslint/no-unused-vars",
    "@typescript-eslint/no-unused-expressions",
    "@typescript-eslint/consistent-type-imports",
    "@typescript-eslint/consistent-type-definitions",
    "@typescript-eslint/consistent-type-assertions",
    "@typescript-eslint/explicit-function-return-type",
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-unsafe-return",
    "@typescript-eslint/no-unsafe-argument",
    "@typescript-eslint/no-unnecessary-condition",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-misused-promises",
    "@typescript-eslint/await-thenable",
    "@typescript-eslint/require-await",
    "@typescript-eslint/no-deprecated",
    "@typescript-eslint/prefer-literal-enum-member",
    "@typescript-eslint/no-mixed-enums",
    "@typescript-eslint/prefer-string-starts-ends-with",
    "@typescript-eslint/restrict-template-expressions",
    "@typescript-eslint/prefer-nullish-coalescing",
    "@typescript-eslint/prefer-optional-chain",
    "no-restricted-syntax",
    "@typescript-eslint/array-type",
    "@typescript-eslint/no-unnecessary-type-arguments",
    "@typescript-eslint/no-unnecessary-type-assertion",
    "@typescript-eslint/no-unnecessary-type-constraint",
    "@typescript-eslint/no-unnecessary-type-parameters",
    "@typescript-eslint/no-confusing-void-expression",
    "@typescript-eslint/no-useless-constructor",
  ] as const

  it.each(EXPECTED_ERRORS)('"%s" resolves to error', async (rule) => {
    expectError(await rulesPromise, rule, ".ts file")
  })
})

// ── TS file: intentionally-off rules ──────────────────────────────────────

describe("typescript.config — intentionally-off rules for .ts files", () => {
  const rulesPromise = calculateConfig(typescriptConfig, TS)

  const INTENTIONALLY_OFF = [
    "no-unused-vars",
    "@typescript-eslint/no-unsafe-assignment",
    "@typescript-eslint/no-unsafe-call",
    "@typescript-eslint/no-unsafe-member-access",
  ] as const

  it.each(INTENTIONALLY_OFF)('"%s" is intentionally off', async (rule) => {
    expectOff(await rulesPromise, rule, ".ts file (intentionally disabled)")
  })
})

// ── JS file: type-aware rules suppressed ──────────────────────────────────

describe("typescript.config — type-aware rules suppressed for .js files", () => {
  const rulesPromise = calculateConfig(typescriptConfig, JS)

  const TYPE_AWARE = [
    "@typescript-eslint/explicit-function-return-type",
    "@typescript-eslint/no-deprecated",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-misused-promises",
    "@typescript-eslint/await-thenable",
    "@typescript-eslint/require-await",
    "@typescript-eslint/no-unnecessary-condition",
    "@typescript-eslint/no-unsafe-return",
    "@typescript-eslint/no-unsafe-argument",
    "@typescript-eslint/restrict-template-expressions",
    "@typescript-eslint/prefer-nullish-coalescing",
  ] as const

  it.each(TYPE_AWARE)('"%s" is off for .js', async (rule) => {
    expectOff(await rulesPromise, rule, ".js file")
  })
})

// ── Rollup override ────────────────────────────────────────────────────────

describe("typescript.config — rollup override", () => {
  const rulesPromise = calculateConfig(typescriptConfig, ROLL)

  it("explicit-function-return-type is off for rollup configs", async () => {
    expectOff(
      await rulesPromise,
      "@typescript-eslint/explicit-function-return-type",
      "rollup.config.ts"
    )
  })

  it("no-deprecated is off for rollup configs", async () => {
    expectOff(
      await rulesPromise,
      "@typescript-eslint/no-deprecated",
      "rollup.config.ts"
    )
  })

  it("other type-aware rules still apply to rollup configs", async () => {
    const rules = await rulesPromise
    expectError(
      rules,
      "@typescript-eslint/no-floating-promises",
      "rollup.config.ts"
    )
    expectError(rules, "@typescript-eslint/no-explicit-any", "rollup.config.ts")
  })
})

// ── Replacement integrity ──────────────────────────────────────────────────

describe("typescript.config — no-unused-vars replacement integrity", () => {
  it("core off, TS version error", async () => {
    const rules = await calculateConfig(typescriptConfig, TS)
    expectOff(rules, "no-unused-vars", ".ts file")
    expectError(rules, "@typescript-eslint/no-unused-vars", ".ts file")
  })
})

// ── Critical options survive the merge ────────────────────────────────────

describe("typescript.config — critical rule options preserved", () => {
  const rulesPromise = calculateConfig(typescriptConfig, TS)

  it.each<readonly [string, Record<string, unknown>]>([
    ["no-floating-promises", { ignoreVoid: true }],
    ["no-unused-vars", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    ["no-unnecessary-condition", { allowConstantLoopConditions: true }],
    // Numbers allowed, booleans not.
    [
      "restrict-template-expressions",
      { allowNumber: true, allowBoolean: false },
    ],
    [
      "consistent-type-imports",
      { prefer: "type-imports", disallowTypeAnnotations: true },
    ],
    // Every type assertion is forbidden.
    ["consistent-type-assertions", { assertionStyle: "never" }],
    ["no-misused-promises", { checksVoidReturn: { attributes: false } }],
  ])("%s keeps its options", async (rule, options) => {
    const entry = (await rulesPromise)[`@typescript-eslint/${rule}`]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject(options)
  })
})
