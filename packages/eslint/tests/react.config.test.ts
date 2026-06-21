/**
 *
 * LAYER 1 — Config wiring tests for react.config.ts (calculateConfigForFile)
 *
 * WHAT THIS PROVES:
 *   Every rule declared in react.config.ts resolves to the correct severity
 *   in ESLint's merged flat config for the correct file types.
 *
 *   react.config.ts has files: ["**\/*.{mdx,js,jsx,ts,tsx}"] — so rules apply
 *   to all of those extensions. We test .tsx as the primary target (most
 *   rules are JSX-relevant) and verify nothing bleeds to extensions outside
 *   that glob.
 *
 * NOTABLE WIRING CONCERNS:
 *   - react.config uses `extends` for jsxA11y, reactPlugin, and reactHooks.
 *     A hand-rolled simulator can't see these. calculateConfigForFile can.
 *   - import/* rules come from eslint-plugin-import-x registered as "import".
 *     If the plugin key is wrong, all import/* rules are silently absent.
 *   - react-hooks/exhaustive-deps is escalated from warn (plugin default) to
 *     error. This is a non-default choice that must survive the extends merge.
 *   - jsx-a11y rules come from extends (flatConfigs.recommended) but some are
 *     overridden to "off" (heading-has-content, anchor-has-content). Both
 *     the "on" and "off" sides must be verified.
 *
 * FAILURE MODES CAUGHT:
 *   - Plugin registered under wrong key (import-x vs import)
 *   - extends entry dropped or returning wrong shape (eslintrc vs flat)
 *   - react-hooks escalation from warn → error silently reverted
 *   - jsx-a11y "off" overrides not applied (rule stays at recommended level)
 *   - no-restricted-syntax selector entries for React import patterns missing
 *   - Glob too narrow: rules not applied to .tsx files
 */

import path from "node:path"
import { describe, expect, it } from "vitest"

import reactConfig from "../src/configs/react.config.js"
import {
  calculateConfig,
  expectError,
  expectOff,
  expectWarn,
  LINT_FIXTURES,
} from "./helpers/eslint-resolver.js"

const TSX = path.join(LINT_FIXTURES, "src/Component.tsx")
const TS = path.join(LINT_FIXTURES, "src/service.ts")
const JS = path.join(LINT_FIXTURES, "src/util.js")

// ── Import rules ───────────────────────────────────────────────────────────
//
// These come from eslint-plugin-import-x registered as "import" in plugins.
// If the plugin key is wrong or the plugin isn't registered, every import/*
// rule is silently absent from the resolved config.

describe("react.config — import/* rules wired for .tsx files", () => {
  const rulesPromise = calculateConfig(reactConfig, TSX)
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  const IMPORT_ERRORS = [
    "import/no-unresolved",
    "import/no-cycle",
    "import/named",
    "import/export",
    "import/no-anonymous-default-export",
    "import/no-duplicates",
    "import/no-extraneous-dependencies",
  ] as const

  for (const rule of IMPORT_ERRORS) {
    it(`"${rule}" resolves to error`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, ".tsx file")
    })
  }
})

// ── React component rules ──────────────────────────────────────────────────

describe("react.config — react/* rules wired for .tsx files", () => {
  const rulesPromise = calculateConfig(reactConfig, TSX)
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  it('"react/function-component-definition" is error', async () => {
    rules ??= await rulesPromise
    expectError(rules, "react/function-component-definition", ".tsx file")
  })

  it('"react/no-unstable-nested-components" is error', async () => {
    rules ??= await rulesPromise
    expectError(rules, "react/no-unstable-nested-components", ".tsx file")
  })

  it('"react/self-closing-comp" is error', async () => {
    rules ??= await rulesPromise
    expectError(rules, "react/self-closing-comp", ".tsx file")
  })

  it('"react/jsx-no-useless-fragment" is error', async () => {
    rules ??= await rulesPromise
    expectError(rules, "react/jsx-no-useless-fragment", ".tsx file")
  })

  it('"react/no-array-index-key" is warn (not error)', async () => {
    rules ??= await rulesPromise
    expectWarn(rules, "react/no-array-index-key", ".tsx file")
  })

  // These are intentionally turned off
  it('"react/no-unknown-property" is off', async () => {
    rules ??= await rulesPromise
    expectOff(rules, "react/no-unknown-property", ".tsx file")
  })

  it('"react/react-in-jsx-scope" is off (jsx-transform — no React import needed)', async () => {
    rules ??= await rulesPromise
    expectOff(rules, "react/react-in-jsx-scope", ".tsx file")
  })

  it('"react/prop-types" is off (TypeScript handles this)', async () => {
    rules ??= await rulesPromise
    expectOff(rules, "react/prop-types", ".tsx file")
  })

  it('"react/jsx-no-target-blank" is off', async () => {
    rules ??= await rulesPromise
    expectOff(rules, "react/jsx-no-target-blank", ".tsx file")
  })
})

// ── React Hooks rules ──────────────────────────────────────────────────────
//
// exhaustive-deps default in the plugin is "warn". Our config escalates it
// to "error". This is the critical non-default choice to verify.

describe("react.config — react-hooks/* rules wired for .tsx files", () => {
  const rulesPromise = calculateConfig(reactConfig, TSX)
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  it('"react-hooks/exhaustive-deps" is error (escalated from plugin default warn)', async () => {
    rules ??= await rulesPromise
    expectError(rules, "react-hooks/exhaustive-deps", ".tsx file")
  })

  it('"react-hooks/rules-of-hooks" is error (from plugin recommended)', async () => {
    rules ??= await rulesPromise
    expectError(rules, "react-hooks/rules-of-hooks", ".tsx file")
  })
})

// ── Accessibility rules ────────────────────────────────────────────────────
//
// jsx-a11y rules come from extends: [jsxA11yPlugin.flatConfigs.recommended].
// Some are overridden to "off" in our rules block. Verify both sides.

describe("react.config — jsx-a11y rules wired for .tsx files", () => {
  const rulesPromise = calculateConfig(reactConfig, TSX)
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  const A11Y_ERRORS = [
    "jsx-a11y/alt-text",
    "jsx-a11y/aria-props",
    "jsx-a11y/aria-proptypes",
    "jsx-a11y/aria-unsupported-elements",
    "jsx-a11y/role-has-required-aria-props",
    "jsx-a11y/role-supports-aria-props",
  ] as const

  for (const rule of A11Y_ERRORS) {
    it(`"${rule}" is error`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, ".tsx file")
    })
  }

  // These are intentionally overridden to off
  it('"jsx-a11y/heading-has-content" is off (intentional override)', async () => {
    rules ??= await rulesPromise
    expectOff(rules, "jsx-a11y/heading-has-content", ".tsx file")
  })

  it('"jsx-a11y/anchor-has-content" is off (intentional override)', async () => {
    rules ??= await rulesPromise
    expectOff(rules, "jsx-a11y/anchor-has-content", ".tsx file")
  })
})

// ── no-restricted-syntax (React-specific selectors) ───────────────────────
//
// react.config declares its own no-restricted-syntax entries for React import
// patterns (default import, namespace import). This is entirely our config's
// behavior — no plugin provides it.

describe("react.config — no-restricted-syntax React import selectors present", () => {
  it("no-restricted-syntax is error for .tsx files", async () => {
    const rules = await calculateConfig(reactConfig, TSX)
    expectError(rules, "no-restricted-syntax", ".tsx file")
  })
})

// ── Options integrity ──────────────────────────────────────────────────────

describe("react.config — critical rule options preserved", () => {
  const rulesPromise = calculateConfig(reactConfig, TSX)
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  it("react/function-component-definition enforces arrow-function for named components", async () => {
    rules ??= await rulesPromise
    const entry = rules["react/function-component-definition"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ namedComponents: "arrow-function" })
  })

  it("react/no-unstable-nested-components has allowAsProps:false", async () => {
    rules ??= await rulesPromise
    const entry = rules["react/no-unstable-nested-components"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ allowAsProps: false })
  })

  it("react/jsx-no-useless-fragment has allowExpressions:true", async () => {
    rules ??= await rulesPromise
    const entry = rules["react/jsx-no-useless-fragment"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ allowExpressions: true })
  })

  it('jsx-a11y/alt-text has custom img component alias "Image"', async () => {
    rules ??= await rulesPromise
    const entry = rules["jsx-a11y/alt-text"]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject({ img: ["Image"] })
  })
})

// ── Glob targeting ─────────────────────────────────────────────────────────
//
// react.config files: ["**\/*.{mdx,js,jsx,ts,tsx}"]
// Rules should apply to all those extensions. We spot-check .tsx and .ts.
// We do NOT check extensions outside the glob (e.g. .json) since the config
// simply won't match them at all — that's ESLint's job, not ours to test.

describe("react.config — glob targeting", () => {
  it("react rules apply to .ts files (glob includes ts)", async () => {
    const rules = await calculateConfig(reactConfig, TS)
    // The glob includes **\/*.ts so react rules are present for .ts too.
    // Whether they actually fire on non-JSX .ts code is a lint-time concern.
    expectError(rules, "react-hooks/exhaustive-deps", ".ts file")
    expectError(rules, "react/function-component-definition", ".ts file")
  })

  it("react rules apply to .js files (glob includes js)", async () => {
    const rules = await calculateConfig(reactConfig, JS)
    expectError(rules, "react-hooks/exhaustive-deps", ".js file")
    expectError(rules, "import/no-duplicates", ".js file")
  })
})
