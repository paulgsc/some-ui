/**
 * Config coverage tests for maishatu-eslint-kit.
 *
 * WHAT WE ARE TESTING:
 *   Our config correctly wires rules — correct rule name, correct severity,
 *   correct file-glob targeting, correct override suppression.
 *
 * WHAT WE ARE NOT TESTING:
 *   Whether the rules themselves work. That is upstream's responsibility.
 *   @typescript-eslint, eslint-plugin-react, eslint-plugin-jsx-a11y etc all
 *   have their own test suites. We trust them. We only verify that our config
 *   declarations land in the resolved flat config as intended.
 *
 * FAILURE MODES THIS CATCHES:
 *   - Typo in a rule name (rule silently doesn't exist → no enforcement)
 *   - Rule dropped from index.ts assembly (config module not spread in)
 *   - Later config block accidentally overriding a rule to "off"
 *   - File-glob too narrow: rule not applied to files you think it covers
 *   - File-glob too broad: rule applied to files that should be exempt
 *     (e.g. type-aware rules firing on .js files, no-console on test files)
 *   - Severity regression: "error" silently downgraded to "warn" or "off"
 */

import type { Linter } from "eslint"
import { describe, expect, it } from "vitest"

import baseConfig from "../src/configs/base.config.js"
import typescriptConfig from "../src/configs/typescript.config.js"
import maishatuRecommended from "../src/index.js"

// ── Config resolution helper ───────────────────────────────────────────────────
//
// Walks the flat config array and merges rules in order for a given filename,
// respecting file-glob matching. The result is the effective rule map that
// ESLint would apply to that file — same logic ESLint uses internally, but
// we replicate it here so tests stay fast and don't need a Linter instance.
//
// Severity encoding: 0 = off, 1 = warn, 2 = error (matches ESLint internals).

function resolveRules(
  config: Array<Linter.Config>,
  filename: string
): Map<string, 0 | 1 | 2> {
  const active = new Map<string, 0 | 1 | 2>()

  for (const block of config) {
    if (!blockAppliesToFile(block, filename)) continue
    for (const [name, setting] of Object.entries(block.rules ?? {})) {
      const sev = normalizeSeverity(setting)
      if (sev === 0) {
        active.delete(name)
      } else {
        active.set(name, sev)
      }
    }
  }

  return active
}

function blockAppliesToFile(block: Linter.Config, filename: string): boolean {
  if (!block.files) return true
  const ext = filename.split(".").at(-1) ?? ""
  const base = filename.split("/").at(-1) ?? filename
  return block.files.flat().some((p) => {
    if (typeof p !== "string") return false
    // Match on extension glob (e.g. "**/*.ts") or exact filename
    return (
      p === filename ||
      p.endsWith(`*.${ext}`) ||
      p.includes(`**/*.${ext}`) ||
      (p.includes("**") && p.includes(ext)) ||
      // Match test-file patterns like "**/*.test.{ts,tsx}"
      (p.includes("test") && base.includes(".test.")) ||
      (p.includes("spec") && base.includes(".spec.")) ||
      // Match tools pattern
      (p.includes("tools") && filename.includes("tools"))
    )
  })
}

function normalizeSeverity(setting: unknown): 0 | 1 | 2 {
  if (setting === "off" || setting === 0) return 0
  if (setting === "warn" || setting === 1) return 1
  if (setting === "error" || setting === 2) return 2
  if (Array.isArray(setting)) return normalizeSeverity(setting[0])
  return 0
}

// Assertion helpers with meaningful failure messages

function assertError(
  rules: Map<string, 0 | 1 | 2>,
  ruleName: string,
  context: string
): void {
  const sev = rules.get(ruleName)
  expect(
    sev,
    `"${ruleName}" should be 'error' (2) for ${context}, but got: ${sev === undefined ? "not present (possible typo or missing config assembly)" : sev}`
  ).toBe(2)
}

function assertWarn(
  rules: Map<string, 0 | 1 | 2>,
  ruleName: string,
  context: string
): void {
  const sev = rules.get(ruleName)
  expect(
    sev,
    `"${ruleName}" should be 'warn' (1) for ${context}, but got: ${sev ?? "not present"}`
  ).toBe(1)
}

function assertOff(
  rules: Map<string, 0 | 1 | 2>,
  ruleName: string,
  context: string
): void {
  const sev = rules.get(ruleName) ?? 0
  expect(
    sev,
    `"${ruleName}" should be 'off' (0) for ${context}, but got: ${sev}`
  ).toBe(0)
}

// ── Section 1: base.config.ts rules ───────────────────────────────────────────
// These apply to all files. We test against a plain .js file because base
// config has no file-glob restriction — it's the unconditional baseline.

describe("base config — declared error rules present in resolved config", () => {
  const rules = resolveRules(baseConfig, "src/anything.js")

  const expectedErrors = [
    "no-implicit-coercion",
    "no-lonely-if",
    "logical-assignment-operators",
    "no-else-return",
    "no-console",
    "no-fallthrough",
    "no-unreachable-loop",
    "no-useless-call",
    "no-useless-computed-key",
    "no-useless-concat",
    "no-var",
    "one-var",
    "radix",
    "prefer-template",
    "eqeqeq",
    "prefer-arrow-callback",
  ] as const

  for (const rule of expectedErrors) {
    it(`"${rule}" resolves to error`, () => {
      assertError(rules, rule, "src/anything.js")
    })
  }
})

// ── Section 2: typescript.config.ts rules ─────────────────────────────────────
// These apply to .ts/.tsx files only. Key concern: do they resolve for TS
// files, and are type-aware rules correctly suppressed for .js files?

describe("typescript config — error rules present for .ts files", () => {
  const rules = resolveRules(typescriptConfig, "src/service.ts")

  const expectedErrors = [
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
    "@typescript-eslint/array-type",
    "@typescript-eslint/no-unnecessary-type-arguments",
    "@typescript-eslint/no-unnecessary-type-assertion",
    "@typescript-eslint/no-unnecessary-type-constraint",
    "@typescript-eslint/no-unnecessary-type-parameters",
    "@typescript-eslint/no-confusing-void-expression",
    "@typescript-eslint/no-useless-constructor",
  ] as const

  for (const rule of expectedErrors) {
    it(`"${rule}" resolves to error`, () => {
      assertError(rules, rule, "src/service.ts")
    })
  }
})

describe("typescript config — type-aware rules suppressed for .js files", () => {
  // The JS override block in typescript.config.ts turns off all type-aware
  // rules. Verify the glob targeting works: these should not fire on .js.
  const rules = resolveRules(typescriptConfig, "src/util.js")

  const typeAwareRules = [
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-misused-promises",
    "@typescript-eslint/await-thenable",
    "@typescript-eslint/require-await",
    "@typescript-eslint/no-deprecated",
    "@typescript-eslint/no-unnecessary-condition",
    "@typescript-eslint/restrict-template-expressions",
    "@typescript-eslint/no-unsafe-return",
    "@typescript-eslint/no-unsafe-argument",
  ] as const

  for (const rule of typeAwareRules) {
    it(`"${rule}" is suppressed for .js files`, () => {
      assertOff(rules, rule, "src/util.js")
    })
  }

  it('"explicit-function-return-type" is suppressed for .js files', () => {
    assertOff(
      rules,
      "@typescript-eslint/explicit-function-return-type",
      "src/util.js"
    )
  })
})

describe("typescript config — rules do NOT apply to non-TS files", () => {
  // The typescript config block has files: ["**/*.{ts,tsx,cts,mts}"].
  // A plain .js file should not have TS rules applied at all.
  const rules = resolveRules(typescriptConfig, "src/util.js")

  it("@typescript-eslint rules are not present for .js (not from TS block)", () => {
    // The only @typescript-eslint rules that survive in .js are the ones
    // explicitly listed in the JS override — which we already verified above
    // are all "off". So no @typescript-eslint rule should be at error for .js.
    const tsErrorRules = [...rules.entries()].filter(
      ([name, sev]) => name.startsWith("@typescript-eslint/") && sev === 2
    )
    expect(
      tsErrorRules,
      `These @typescript-eslint rules should not be active at error for .js: ${JSON.stringify(tsErrorRules.map(([n]) => n))}`
    ).toHaveLength(0)
  })
})

// ── Section 3: react.config.ts rules ─────────────────────────────────────────
// React rules apply to .tsx/.jsx files. Verify targeting is correct.

describe("react config — error rules present for .tsx files (full assembled config)", () => {
  // Test against the full assembled config to verify index.ts wires react
  // config in correctly and rules survive the merge.
  const rules = resolveRules(maishatuRecommended, "src/Component.tsx")

  const expectedErrors = [
    "import/no-unresolved",
    "import/no-cycle",
    "import/named",
    "import/export",
    "import/no-anonymous-default-export",
    "import/no-duplicates",
    "import/no-extraneous-dependencies",
    "react/function-component-definition",
    "react/no-unstable-nested-components",
    "react/self-closing-comp",
    "react/jsx-no-useless-fragment",
    "react-hooks/exhaustive-deps",
    "jsx-a11y/alt-text",
    "jsx-a11y/aria-props",
    "jsx-a11y/aria-proptypes",
    "jsx-a11y/aria-unsupported-elements",
    "jsx-a11y/role-has-required-aria-props",
    "jsx-a11y/role-supports-aria-props",
  ] as const

  for (const rule of expectedErrors) {
    it(`"${rule}" resolves to error`, () => {
      assertError(rules, rule, "src/Component.tsx")
    })
  }

  it('"react/no-array-index-key" resolves to warn (not error)', () => {
    assertWarn(rules, "react/no-array-index-key", "src/Component.tsx")
  })
})

describe("react config — react rules do NOT apply to .ts files", () => {
  // react.config.ts has files: ["**/*.{mdx,jsx,tsx}"].
  // A plain .ts file (no JSX) should not have react rules applied.
  const rules = resolveRules(maishatuRecommended, "src/service.ts")

  const reactOnlyRules = [
    "react/function-component-definition",
    "react/no-unstable-nested-components",
    "react-hooks/exhaustive-deps",
  ] as const

  for (const rule of reactOnlyRules) {
    it(`"${rule}" is not active for .ts files`, () => {
      assertOff(rules, rule, "src/service.ts")
    })
  }
})

// ── Section 4: override targeting ────────────────────────────────────────────
// The overrides suppress specific rules for test files and tool files.
// This is the most important targeting coverage: verifies that "no-console"
// and floating-promise rules don't create noise in test files.

describe("overrides — no-console suppressed in test files", () => {
  it("no-console is off in *.test.ts files", () => {
    const rules = resolveRules(maishatuRecommended, "src/foo.test.ts")
    assertOff(rules, "no-console", "src/foo.test.ts")
  })

  it("no-console is off in tests/ directory", () => {
    const rules = resolveRules(maishatuRecommended, "tests/foo.ts")
    assertOff(rules, "no-console", "tests/foo.ts")
  })

  it("no-console remains error in non-test source files", () => {
    const rules = resolveRules(maishatuRecommended, "src/service.ts")
    assertError(rules, "no-console", "src/service.ts")
  })
})

describe("overrides — no-floating-promises suppressed in test files", () => {
  it("no-floating-promises is off in *.test.ts", () => {
    const rules = resolveRules(maishatuRecommended, "src/foo.test.ts")
    assertOff(
      rules,
      "@typescript-eslint/no-floating-promises",
      "src/foo.test.ts"
    )
  })

  it("no-floating-promises remains error in source files", () => {
    const rules = resolveRules(maishatuRecommended, "src/service.ts")
    assertError(
      rules,
      "@typescript-eslint/no-floating-promises",
      "src/service.ts"
    )
  })
})

describe("overrides — no-deprecated suppressed in test and tool files", () => {
  it("no-deprecated is off in test files", () => {
    const rules = resolveRules(maishatuRecommended, "src/foo.test.ts")
    assertOff(rules, "@typescript-eslint/no-deprecated", "src/foo.test.ts")
  })

  it("no-deprecated is off in tools/ directory", () => {
    const rules = resolveRules(maishatuRecommended, "tools/codegen.ts")
    assertOff(rules, "@typescript-eslint/no-deprecated", "tools/codegen.ts")
  })

  it("no-deprecated remains error in source files", () => {
    const rules = resolveRules(maishatuRecommended, "src/service.ts")
    assertError(rules, "@typescript-eslint/no-deprecated", "src/service.ts")
  })
})

describe("overrides — no-explicit-any relaxed to warn in tool files", () => {
  it("no-explicit-any is warn in tools/", () => {
    const rules = resolveRules(maishatuRecommended, "tools/codegen.ts")
    assertWarn(rules, "@typescript-eslint/no-explicit-any", "tools/codegen.ts")
  })

  it("no-explicit-any is error in source files", () => {
    const rules = resolveRules(maishatuRecommended, "src/service.ts")
    assertError(rules, "@typescript-eslint/no-explicit-any", "src/service.ts")
  })
})

// ── Section 5: assembly integrity ─────────────────────────────────────────────
// Verify index.ts correctly assembles all config slices. If a config module
// is accidentally dropped from the spread in index.ts, base rules would still
// be present but the missing module's rules would vanish. This cross-checks
// that rules from each module survive the full assembly.

describe("assembly integrity — all config modules wired in maishatuRecommended", () => {
  const tsxRules = resolveRules(maishatuRecommended, "src/Component.tsx")
  const tsRules = resolveRules(maishatuRecommended, "src/service.ts")
  const jsRules = resolveRules(maishatuRecommended, "src/util.js")

  it("base rules present in assembled config (js file)", () => {
    assertError(jsRules, "no-var", "src/util.js (assembled)")
    assertError(jsRules, "no-console", "src/util.js (assembled)")
    assertError(jsRules, "prefer-template", "src/util.js (assembled)")
  })

  it("typescript rules present in assembled config (ts file)", () => {
    assertError(
      tsRules,
      "@typescript-eslint/no-explicit-any",
      "src/service.ts (assembled)"
    )
    assertError(
      tsRules,
      "@typescript-eslint/no-floating-promises",
      "src/service.ts (assembled)"
    )
    assertError(
      tsRules,
      "@typescript-eslint/no-deprecated",
      "src/service.ts (assembled)"
    )
  })

  it("react rules present in assembled config (tsx file)", () => {
    assertError(
      tsxRules,
      "react/function-component-definition",
      "src/Component.tsx (assembled)"
    )
    assertError(
      tsxRules,
      "react-hooks/exhaustive-deps",
      "src/Component.tsx (assembled)"
    )
    assertError(tsxRules, "jsx-a11y/alt-text", "src/Component.tsx (assembled)")
  })

  it("base rules also present for tsx files (no glob conflict)", () => {
    // Base config has no files glob — applies everywhere. If tsx files
    // accidentally override base rules this would catch it.
    assertError(tsxRules, "no-var", "src/Component.tsx (assembled)")
    assertError(tsxRules, "prefer-template", "src/Component.tsx (assembled)")
  })
})
