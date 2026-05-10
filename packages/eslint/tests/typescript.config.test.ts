/**
 *
 * LAYER 1 — Config wiring tests (calculateConfigForFile)
 *
 * WHAT THIS PROVES:
 *   The rules declared in typescript.config.ts are actually wired into the
 *   flat config that ESLint's own resolver produces for a given file path.
 *   This is the missing invariant in the old hand-rolled simulator: it did
 *   not handle `extends` (eslint.configs.recommended, disableTypeChecked),
 *   so rules injected by those presets were invisible to it.
 *
 *   ESLint.calculateConfigForFile() runs the real merger — same code path
 *   that runs at lint time — so what we assert here is exactly what will
 *   be enforced in production builds.
 *
 * WHAT THIS DOES NOT PROVE:
 *   That a rule actually fires on a given code pattern (that is layer 2,
 *   typescript.lint.test.ts).  Here we only prove severity and presence.
 *
 * FAILURE MODES CAUGHT:
 *   - Typo in rule name (ESLint ignores it silently; we catch missing entry)
 *   - Rule omitted from typescript.config.ts rules block
 *   - `extends` wiring broken (disableTypeChecked not applied for .js)
 *   - Rollup override not targeting the right glob
 *   - Severity regression (error → warn or off)
 *   - no-unused-vars / @typescript-eslint/no-unused-vars replacement integrity
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import typescriptConfig from "../src/configs/typescript.config.js"
import {
  calculateConfig,
  expectError,
  expectOff,
} from "./helpers/eslint-resolver.js"

// Resolve fixture paths relative to this file so calculateConfigForFile
// receives real on-disk paths (required by ESLint's file-existence check).
const HERE = fileURLToPath(import.meta.url)
const FIXTURES = path.resolve(HERE, "../../lint-fixtures")

const TS_FILE = path.join(FIXTURES, "src/service.ts")
const JS_FILE = path.join(FIXTURES, "src/util.js")
const ROLLUP_FILE = path.join(FIXTURES, "src/rollup.config.ts")

// ── TS file: all declared error rules present ──────────────────────────────

describe("typescript.config — error rules wired for .ts files", () => {
  // Calculated once per describe block; shared across all its tests.
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  // Vitest does not support async beforeAll in describe blocks at module
  // scope reliably across all versions, so we lazy-init with a shared promise.
  const rulesPromise = calculateConfig(typescriptConfig, TS_FILE)

  const EXPECTED_ERRORS = [
    // Unused vars — TS-aware replacement
    "@typescript-eslint/no-unused-vars",
    "@typescript-eslint/no-unused-expressions",
    // Import / type consistency
    "@typescript-eslint/consistent-type-imports",
    "@typescript-eslint/consistent-type-definitions",
    "@typescript-eslint/consistent-type-assertions",
    // Function signatures
    "@typescript-eslint/explicit-function-return-type",
    // any / unknown safety
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-unsafe-return",
    "@typescript-eslint/no-unsafe-argument",
    // Control flow
    "@typescript-eslint/no-unnecessary-condition",
    // Async / promises
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-misused-promises",
    "@typescript-eslint/await-thenable",
    "@typescript-eslint/require-await",
    // Deprecation
    "@typescript-eslint/no-deprecated",
    // Enum safety
    "@typescript-eslint/prefer-literal-enum-member",
    "@typescript-eslint/no-mixed-enums",
    // String safety
    "@typescript-eslint/prefer-string-starts-ends-with",
    "@typescript-eslint/restrict-template-expressions",
    // Nullish / optional chaining
    "@typescript-eslint/prefer-nullish-coalescing",
    "@typescript-eslint/prefer-optional-chain",
    // Indexed access
    "no-restricted-syntax",
    // Generics
    "@typescript-eslint/array-type",
    "@typescript-eslint/no-unnecessary-type-arguments",
    "@typescript-eslint/no-unnecessary-type-assertion",
    "@typescript-eslint/no-unnecessary-type-constraint",
    "@typescript-eslint/no-unnecessary-type-parameters",
    // Return type safety
    "@typescript-eslint/no-confusing-void-expression",
    // Class
    "@typescript-eslint/no-useless-constructor",
  ] as const

  for (const rule of EXPECTED_ERRORS) {
    it(`"${rule}" resolves to error`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, ".ts file")
    })
  }
})

// ── TS file: suppressed-by-design rules ───────────────────────────────────

describe("typescript.config — intentionally-off rules for .ts files", () => {
  let rules: Awaited<ReturnType<typeof calculateConfig>>
  const rulesPromise = calculateConfig(typescriptConfig, TS_FILE)

  // These three are off because external-boundary noise; verify they stay off
  const INTENTIONALLY_OFF = [
    "no-unused-vars", // replaced by @typescript-eslint version
    "@typescript-eslint/no-unsafe-assignment",
    "@typescript-eslint/no-unsafe-call",
    "@typescript-eslint/no-unsafe-member-access",
  ] as const

  for (const rule of INTENTIONALLY_OFF) {
    it(`"${rule}" is intentionally off for .ts files`, async () => {
      rules ??= await rulesPromise
      expectOff(rules, rule, ".ts file (intentionally disabled)")
    })
  }
})

// ── JS file: type-aware rules suppressed ──────────────────────────────────

describe("typescript.config — type-aware rules suppressed for .js files", () => {
  let rules: Awaited<ReturnType<typeof calculateConfig>>
  const rulesPromise = calculateConfig(typescriptConfig, JS_FILE)

  // These come from the JS override block (files: ["**/*.js"]) which extends
  // tseslint.configs.disableTypeChecked and then adds explicit "off" entries.
  // The old simulator could not see disableTypeChecked — we now prove it.
  const TYPE_AWARE_RULES = [
    "@typescript-eslint/explicit-function-return-type",
    "@typescript-eslint/no-deprecated",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-misused-promises",
    "@typescript-eslint/await-thenable",
    "@typescript-eslint/require-await",
    // These are also type-aware and should be disabled via disableTypeChecked
    "@typescript-eslint/no-unnecessary-condition",
    "@typescript-eslint/no-unsafe-return",
    "@typescript-eslint/no-unsafe-argument",
    "@typescript-eslint/restrict-template-expressions",
    "@typescript-eslint/prefer-nullish-coalescing",
  ] as const

  for (const rule of TYPE_AWARE_RULES) {
    it(`"${rule}" is suppressed for .js files`, async () => {
      rules ??= await rulesPromise
      expectOff(rules, rule, ".js file")
    })
  }
})

// ── Rollup file: override suppression ─────────────────────────────────────

describe("typescript.config — rollup override suppresses rules for *rollup*.ts", () => {
  let rules: Awaited<ReturnType<typeof calculateConfig>>
  const rulesPromise = calculateConfig(typescriptConfig, ROLLUP_FILE)

  it('"@typescript-eslint/explicit-function-return-type" is off for rollup configs', async () => {
    rules ??= await rulesPromise
    expectOff(
      rules,
      "@typescript-eslint/explicit-function-return-type",
      "rollup.config.ts"
    )
  })

  it('"@typescript-eslint/no-deprecated" is off for rollup configs', async () => {
    rules ??= await rulesPromise
    expectOff(rules, "@typescript-eslint/no-deprecated", "rollup.config.ts")
  })

  it("other type-aware rules still apply to rollup configs (only the two are relaxed)", async () => {
    rules ??= await rulesPromise
    // Rollup files are still .ts — they should still have most rules
    expectError(
      rules,
      "@typescript-eslint/no-floating-promises",
      "rollup.config.ts"
    )
    expectError(rules, "@typescript-eslint/no-explicit-any", "rollup.config.ts")
  })
})

// ── Rule replacement integrity ─────────────────────────────────────────────
//
// This is one of the most important invariants: no-unused-vars is disabled
// and @typescript-eslint/no-unused-vars is enabled in its place.
// If the replacement is broken (both on, both off, or wrong order), code
// silently goes unlinted or generates noisy duplicate messages.

describe("typescript.config — no-unused-vars replacement integrity", () => {
  it("core no-unused-vars is off while @typescript-eslint version is error", async () => {
    const rules = await calculateConfig(typescriptConfig, TS_FILE)

    expectOff(rules, "no-unused-vars", ".ts file")
    expectError(rules, "@typescript-eslint/no-unused-vars", ".ts file")
  })
})

// ── Options integrity: assert options survive the merge ────────────────────
//
// Severity alone is not sufficient for rules with critical options.
// We spot-check a few rules whose options materially affect enforcement.

describe("typescript.config — critical rule options preserved after merge", () => {
  let rules: Awaited<ReturnType<typeof calculateConfig>>
  const rulesPromise = calculateConfig(typescriptConfig, TS_FILE)

  it("no-floating-promises has ignoreVoid:true", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/no-floating-promises"]
    expect(entry).toBeDefined()
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ ignoreVoid: true })
  })

  it("no-unused-vars has varsIgnorePattern and argsIgnorePattern set to ^_", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/no-unused-vars"]
    expect(entry).toBeDefined()
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({
      varsIgnorePattern: "^_",
      argsIgnorePattern: "^_",
    })
  })

  it("no-unnecessary-condition has allowConstantLoopConditions:true", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/no-unnecessary-condition"]
    expect(entry).toBeDefined()
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ allowConstantLoopConditions: true })
  })

  it("restrict-template-expressions allows numbers but not booleans", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/restrict-template-expressions"]
    expect(entry).toBeDefined()
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ allowNumber: true, allowBoolean: false })
  })

  it("consistent-type-imports uses type-imports and disallows type annotations", async () => {
    rules ??= await rulesPromise
    const entry = rules["@typescript-eslint/consistent-type-imports"]
    expect(entry).toBeDefined()
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({
      prefer: "type-imports",
      disallowTypeAnnotations: true,
    })
  })
})
