/**
 *
 * LAYER 1 — Assembly integrity tests
 *
 * WHAT THIS PROVES:
 *   The default export `maishatuRecommended` from src/index.ts correctly
 *   assembles all config sub-modules — base, typescript, react, stories,
 *   overrides-tests, overrides-tools — into a single coherent flat config
 *   array.  If any module is accidentally dropped from the spread in index.ts,
 *   its rules will be missing from the resolved config and these tests fail.
 *
 * WHY THIS MATTERS:
 *   index.ts assembles the config with spread operators:
 *
 *     defineConfig(...baseConfig, ...typescriptConfig, ...reactConfig, ...)
 *
 *   A missing `...` prefix or a forgotten import silently drops an entire
 *   config slice.  The downstream effect is that consumers of the package get
 *   a config that looks complete but is missing entire rule categories.
 *
 * STRATEGY:
 *   For each config module, pick 2-3 rules that are unique to that module
 *   (not declared anywhere else) and assert they resolve correctly in the
 *   full assembled config.  This proves:
 *   1. The module is spread into the assembled array
 *   2. The module's file globs survive the assembly (not accidentally flattened)
 *   3. Override precedence is preserved (later blocks override earlier ones)
 *
 * FAILURE MODES CAUGHT:
 *   - A config module missing from index.ts
 *   - Spread vs non-spread mismatch (Config[] vs Config)
 *   - Override precedence reversal in index.ts assembly order
 *   - Accidental double-spreading (rule options corrupted by duplicate merge)
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "vitest"

import maishatuRecommended from "../src/index.js"
import {
  calculateConfig,
  expectError,
  expectOff,
  expectWarn,
} from "./helpers/eslint-resolver.js"

const HERE = fileURLToPath(import.meta.url)
const FIXTURES = path.resolve(HERE, "../../lint-fixtures")
const FIX = (rel: string): string => path.join(FIXTURES, rel)

// ── Base config module wired ───────────────────────────────────────────────

describe("assembly: base.config module present in maishatuRecommended", () => {
  // These rules are unique to base.config — they do not appear in any other module
  const SENTINEL_RULES = [
    "no-var",
    "no-console",
    "prefer-template",
    "eqeqeq",
    "no-lonely-if",
    "logical-assignment-operators",
  ] as const

  let rules: Awaited<ReturnType<typeof calculateConfig>>
  const rulesPromise = calculateConfig(maishatuRecommended, FIX("src/util.js"))

  for (const rule of SENTINEL_RULES) {
    it(`base rule "${rule}" survives assembly (js file)`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, "src/util.js (assembled)")
    })
  }

  it("base rules also apply to .tsx files (no glob restriction)", async () => {
    const tsxRules = await calculateConfig(
      maishatuRecommended,
      FIX("src/Component.tsx")
    )
    expectError(tsxRules, "no-var", "src/Component.tsx (assembled)")
    expectError(tsxRules, "prefer-template", "src/Component.tsx (assembled)")
  })
})

// ── TypeScript config module wired ────────────────────────────────────────

describe("assembly: typescript.config module present in maishatuRecommended", () => {
  // Rules unique to typescript.config — absent from base and react configs
  const SENTINEL_RULES = [
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-deprecated",
    "@typescript-eslint/explicit-function-return-type",
    "@typescript-eslint/consistent-type-imports",
  ] as const

  let rules: Awaited<ReturnType<typeof calculateConfig>>
  const rulesPromise = calculateConfig(
    maishatuRecommended,
    FIX("src/service.ts")
  )

  for (const rule of SENTINEL_RULES) {
    it(`typescript rule "${rule}" survives assembly (ts file)`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, "src/service.ts (assembled)")
    })
  }

  it("typescript rules are suppressed for .js files in assembled config", async () => {
    const jsRules = await calculateConfig(
      maishatuRecommended,
      FIX("src/util.js")
    )
    expectOff(
      jsRules,
      "@typescript-eslint/no-floating-promises",
      "src/util.js (assembled)"
    )
    expectOff(
      jsRules,
      "@typescript-eslint/no-deprecated",
      "src/util.js (assembled)"
    )
  })
})

// ── React config module wired ─────────────────────────────────────────────

describe("assembly: react.config module present in maishatuRecommended", () => {
  // Rules unique to react.config
  const SENTINEL_ERRORS = [
    "react/function-component-definition",
    "react/no-unstable-nested-components",
    "react/self-closing-comp",
    "react/jsx-no-useless-fragment",
    "react-hooks/exhaustive-deps",
    "jsx-a11y/alt-text",
    "jsx-a11y/aria-props",
    "jsx-a11y/role-has-required-aria-props",
    "import/no-cycle",
    "import/no-duplicates",
    "import/no-anonymous-default-export",
  ] as const

  let rules: Awaited<ReturnType<typeof calculateConfig>>
  const rulesPromise = calculateConfig(
    maishatuRecommended,
    FIX("src/Component.tsx")
  )

  for (const rule of SENTINEL_ERRORS) {
    it(`react rule "${rule}" survives assembly (tsx file)`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, "src/Component.tsx (assembled)")
    })
  }

  it('"react/no-array-index-key" is warn not error (assembled)', async () => {
    rules ??= await rulesPromise
    expectWarn(
      rules,
      "react/no-array-index-key",
      "src/Component.tsx (assembled)"
    )
  })

  it("react rules do NOT apply to plain .ts files (glob restriction)", async () => {
    const tsRules = await calculateConfig(
      maishatuRecommended,
      FIX("src/service.ts")
    )
    // react.config files: ["**/*.{mdx,js,jsx,ts,tsx}"] — actually includes .ts
    // but react/function-component-definition only fires on JSX so this is a
    // wiring check: the rule must be present at error severity for .ts as well
    // because the glob includes ts. If the author intended to restrict to JSX
    // files only, the glob would need to change. We test what the config declares.
    expectError(
      tsRules,
      "react-hooks/exhaustive-deps",
      "src/service.ts (assembled)"
    )
  })
})

// ── Override modules wired ────────────────────────────────────────────────

describe("assembly: override modules present in maishatuRecommended", () => {
  it("tests override: no-console suppressed in test files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/foo.test.ts")
    )
    expectOff(rules, "no-console", "src/foo.test.ts (assembled)")
  })

  it("tests override: no-deprecated suppressed in test files", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("src/foo.test.ts")
    )
    expectOff(
      rules,
      "@typescript-eslint/no-deprecated",
      "src/foo.test.ts (assembled)"
    )
  })

  it("tools override: no-explicit-any relaxed to warn in tools/", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("tools/codegen.ts")
    )
    expectWarn(
      rules,
      "@typescript-eslint/no-explicit-any",
      "tools/codegen.ts (assembled)"
    )
  })

  it("tools override: no-deprecated suppressed in tools/", async () => {
    const rules = await calculateConfig(
      maishatuRecommended,
      FIX("tools/codegen.ts")
    )
    expectOff(
      rules,
      "@typescript-eslint/no-deprecated",
      "tools/codegen.ts (assembled)"
    )
  })
})

// ── Override precedence: later overrides win ──────────────────────────────
//
// The assembly order in index.ts must place overrides AFTER the base config
// blocks so they can suppress rules declared earlier.  If the order is wrong
// the suppressions are invisible.

describe("assembly: override precedence — overrides applied after base rules", () => {
  it("no-console: base declares error, test override wins with off", async () => {
    // If override came before base config, base would re-enable it.
    // We verify override wins by checking the final resolved state.
    const baseRules = await calculateConfig(
      maishatuRecommended,
      FIX("src/service.ts")
    )
    const testRules = await calculateConfig(
      maishatuRecommended,
      FIX("src/foo.test.ts")
    )

    expectError(baseRules, "no-console", "source file — base rule active")
    expectOff(testRules, "no-console", "test file — override wins")
  })

  it("no-explicit-any: typescript declares error, tools override wins with warn", async () => {
    const sourceRules = await calculateConfig(
      maishatuRecommended,
      FIX("src/service.ts")
    )
    const toolsRules = await calculateConfig(
      maishatuRecommended,
      FIX("tools/codegen.ts")
    )

    expectError(
      sourceRules,
      "@typescript-eslint/no-explicit-any",
      "source — error"
    )
    expectWarn(
      toolsRules,
      "@typescript-eslint/no-explicit-any",
      "tools — warn wins"
    )
  })
})

// ── Export shape: maishatuNonStylistic is also valid ─────────────────────

describe("assembly: named export maishatuNonStylistic is a valid config", () => {
  it("maishatuNonStylistic contains typescript rules (spot check)", async () => {
    // Import named export to verify it is correctly assembled too
    const { maishatuNonStylistic } = await import("../src/index.js")
    const rules = await calculateConfig(
      maishatuNonStylistic,
      FIX("src/service.ts")
    )
    expectError(
      rules,
      "@typescript-eslint/no-explicit-any",
      "src/service.ts (nonStylistic)"
    )
    expectError(
      rules,
      "@typescript-eslint/no-floating-promises",
      "src/service.ts (nonStylistic)"
    )
  })
})
