/**
 *
 * LAYER 1 — Config wiring tests (calculateConfigForFile)
 *
 * Proves every rule in typescript.config.ts resolves to the correct severity
 * via ESLint's real flat-config merger.  No code is parsed; no rules execute.
 *
 * filePath must be absolute and the file must exist on disk.
 * Use stubs from tests/lint-fixtures/.
 */

import path from "node:path"
import { describe, expect, it } from "vitest"

import typescriptConfig from "../src/configs/typescript.config.js"
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
  let rules: Awaited<ReturnType<typeof calculateConfig>> | undefined

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

  for (const rule of EXPECTED_ERRORS) {
    it(`"${rule}" resolves to error`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, ".ts file")
    })
  }
})

// ── TS file: intentionally-off rules ──────────────────────────────────────

describe("typescript.config — intentionally-off rules for .ts files", () => {
  const rulesPromise = calculateConfig(typescriptConfig, TS)
  let rules: Awaited<ReturnType<typeof calculateConfig>> | undefined

  const INTENTIONALLY_OFF = [
    "no-unused-vars",
    "@typescript-eslint/no-unsafe-assignment",
    "@typescript-eslint/no-unsafe-call",
    "@typescript-eslint/no-unsafe-member-access",
  ] as const

  for (const rule of INTENTIONALLY_OFF) {
    it(`"${rule}" is intentionally off`, async () => {
      rules ??= await rulesPromise
      expectOff(rules, rule, ".ts file (intentionally disabled)")
    })
  }
})

// ── JS file: type-aware rules suppressed ──────────────────────────────────

describe("typescript.config — type-aware rules suppressed for .js files", () => {
  const rulesPromise = calculateConfig(typescriptConfig, JS)
  let rules: Awaited<ReturnType<typeof calculateConfig>> | undefined

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

  for (const rule of TYPE_AWARE) {
    it(`"${rule}" is off for .js`, async () => {
      rules ??= await rulesPromise
      expectOff(rules, rule, ".js file")
    })
  }
})

// ── Rollup override ────────────────────────────────────────────────────────

describe("typescript.config — rollup override", () => {
  const rulesPromise = calculateConfig(typescriptConfig, ROLL)
  let rules: Awaited<ReturnType<typeof calculateConfig>> | undefined

  it("explicit-function-return-type is off for rollup configs", async () => {
    rules ??= await rulesPromise
    expectOff(
      rules,
      "@typescript-eslint/explicit-function-return-type",
      "rollup.config.ts"
    )
  })

  it("no-deprecated is off for rollup configs", async () => {
    rules ??= await rulesPromise
    expectOff(rules, "@typescript-eslint/no-deprecated", "rollup.config.ts")
  })

  it("other type-aware rules still apply to rollup configs", async () => {
    rules ??= await rulesPromise
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
  let rules: Awaited<ReturnType<typeof calculateConfig>> | undefined

  it("no-floating-promises has ignoreVoid:true", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/no-floating-promises"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ ignoreVoid: true })
  })

  it("no-unused-vars has ^_ ignore patterns", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/no-unused-vars"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({
      varsIgnorePattern: "^_",
      argsIgnorePattern: "^_",
    })
  })

  it("no-unnecessary-condition has allowConstantLoopConditions:true", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/no-unnecessary-condition"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ allowConstantLoopConditions: true })
  })

  it("restrict-template-expressions allows numbers, not booleans", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/restrict-template-expressions"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ allowNumber: true, allowBoolean: false })
  })

  it("consistent-type-imports enforces type-imports and disallows annotations", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/consistent-type-imports"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({
      prefer: "type-imports",
      disallowTypeAnnotations: true,
    })
  })

  it("consistent-type-assertions forbids all type assertions (assertionStyle: never)", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/consistent-type-assertions"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({
      assertionStyle: "never",
    })
  })

  it("no-misused-promises has checksVoidReturn.attributes:false", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/no-misused-promises"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ checksVoidReturn: { attributes: false } })
  })
})
