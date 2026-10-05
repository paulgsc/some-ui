/**
 * Config wiring tests for react.config.ts, via calculateConfigForFile: every
 * rule resolves to the right severity in the merged flat config. Catches a
 * plugin registered under the wrong key (import-x as "import", or every
 * import/* rule is silently absent), a dropped `extends`, the
 * exhaustive-deps escalation to error reverting, and the jsx-a11y "off"
 * overrides not applying.
 */

import path from "node:path"
import reactConfig from "@eslint/configs/react.config.js"
import { describe, expect, it } from "vitest"

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

const EXPECT = { error: expectError, warn: expectWarn, off: expectOff }

describe("react.config — rule severities for .tsx files", () => {
  const rulesPromise = calculateConfig(reactConfig, TSX)

  it.each<readonly [string, keyof typeof EXPECT]>([
    ["import/no-unresolved", "error"],
    ["import/no-cycle", "error"],
    ["import/named", "error"],
    ["import/export", "error"],
    ["import/no-anonymous-default-export", "error"],
    ["import/no-duplicates", "error"],
    ["import/no-extraneous-dependencies", "error"],
    ["react/function-component-definition", "error"],
    ["react/no-unstable-nested-components", "error"],
    ["react/self-closing-comp", "error"],
    ["react/jsx-no-useless-fragment", "error"],
    ["react/no-array-index-key", "warn"],
    ["react/no-unknown-property", "off"],
    // jsx-transform: no React import needed.
    ["react/react-in-jsx-scope", "off"],
    // TypeScript handles this.
    ["react/prop-types", "off"],
    ["react/jsx-no-target-blank", "off"],
    // Escalated from the plugin's default warn.
    ["react-hooks/exhaustive-deps", "error"],
    ["react-hooks/rules-of-hooks", "error"],
    ["jsx-a11y/alt-text", "error"],
    ["jsx-a11y/aria-props", "error"],
    ["jsx-a11y/aria-proptypes", "error"],
    ["jsx-a11y/aria-unsupported-elements", "error"],
    ["jsx-a11y/role-has-required-aria-props", "error"],
    ["jsx-a11y/role-supports-aria-props", "error"],
    // Overridden off from jsx-a11y's recommended set.
    ["jsx-a11y/heading-has-content", "off"],
    ["jsx-a11y/anchor-has-content", "off"],
    // The React import selectors are this config's own.
    ["no-restricted-syntax", "error"],
  ])('"%s" is %s', async (rule, severity) => {
    EXPECT[severity](await rulesPromise, rule, ".tsx file")
  })

  it.each<readonly [string, Record<string, unknown>]>([
    [
      "react/function-component-definition",
      { namedComponents: "arrow-function" },
    ],
    ["react/no-unstable-nested-components", { allowAsProps: false }],
    ["react/jsx-no-useless-fragment", { allowExpressions: true }],
    ["jsx-a11y/alt-text", { img: ["Image"] }],
  ])("%s keeps its options", async (rule, options) => {
    const entry = (await rulesPromise)[rule]
    const opts = Array.isArray(entry) ? entry[1] : undefined
    expect(opts).toMatchObject(options)
  })
})

// ── Glob targeting: files are **\/*.{mdx,js,jsx,ts,tsx} ─────────────────────

describe("react.config — glob targeting", () => {
  it("react rules apply to .ts files (glob includes ts)", async () => {
    const rules = await calculateConfig(reactConfig, TS)
    expectError(rules, "react-hooks/exhaustive-deps", ".ts file")
    expectError(rules, "react/function-component-definition", ".ts file")
  })

  it("react rules apply to .js files (glob includes js)", async () => {
    const rules = await calculateConfig(reactConfig, JS)
    expectError(rules, "react-hooks/exhaustive-deps", ".js file")
    expectError(rules, "import/no-duplicates", ".js file")
  })
})
