/**
 *
 * LAYER 1 — Config wiring tests for base.config.ts
 *
 * WHAT THIS PROVES:
 *   Every rule declared in base.config.ts resolves to the correct severity
 *   via ESLint's real calculateConfigForFile().  Base config has no
 *   file-glob restriction so it applies universally; we test against both
 *   .js and .ts files to confirm no accidental scoping.
 *
 * WHY base.config IS TRICKY:
 *   base.config uses `extends: [prettier]` which disables formatting rules.
 *   A hand-rolled resolver can't see which rules prettier disables.  The
 *   real ESLint engine handles it transparently; we leverage that here.
 *
 * FAILURE MODES CAUGHT:
 *   - Rule name typo (silent non-enforcement)
 *   - Rule dropped from base.config.ts
 *   - Prettier compat layer accidentally disabling a non-formatting rule
 *   - Severity regression (error → warn)
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "vitest"

import baseConfig from "../src/configs/base.config.js"
// ── Lint-time: base rules fire on real code ────────────────────────────────
// A small subset of base rules tested at lint time to confirm plugin/rule
// connectivity (not just presence in the config).
import {
  calculateConfig,
  expectError,
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const HERE = fileURLToPath(import.meta.url)
const FIXTURES = path.resolve(HERE, "../../lint-fixtures")

const JS_FILE = path.join(FIXTURES, "src/util.js")
const TS_FILE = path.join(FIXTURES, "src/service.ts")

// All rules in base.config.ts rules block that must resolve to error
const EXPECTED_ERRORS = [
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

describe("base.config — error rules wired for .js files", () => {
  const rulesPromise = calculateConfig(baseConfig, JS_FILE)
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  for (const rule of EXPECTED_ERRORS) {
    it(`"${rule}" resolves to error`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, "src/util.js")
    })
  }
})

describe("base.config — same error rules apply for .ts files (no glob restriction)", () => {
  const rulesPromise = calculateConfig(baseConfig, TS_FILE)
  let rules: Awaited<ReturnType<typeof calculateConfig>>

  for (const rule of EXPECTED_ERRORS) {
    it(`"${rule}" resolves to error for .ts too`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, "src/service.ts")
    })
  }
})

describe("lint: base.config rules fire on real code", () => {
  it("no-var fires on var declarations", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `var x = 1; module.exports = x`,
      JS_FILE
    )
    expectMessageForRule(messages, "no-var", ".js file using var")
  })

  it("no-var does NOT fire on const/let", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `const x = 1; module.exports = x`,
      JS_FILE
    )
    expectNoMessageForRule(messages, "no-var", ".js file using const")
  })

  it("prefer-template fires on string concatenation", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `const name = "world"; export const greeting = "hello " + name`,
      JS_FILE
    )
    expectMessageForRule(
      messages,
      "prefer-template",
      ".js file with string concatenation"
    )
  })

  it("eqeqeq fires on loose equality check", async () => {
    const messages = await lintSnippet(
      baseConfig,

      `export function isOne(x) { return x == 1 }`,
      JS_FILE
    )
    expectMessageForRule(messages, "eqeqeq", ".js file using == instead of ===")
  })

  it("no-else-return fires when else follows a return", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `export function f(x) { if (x > 0) { return 1 } else { return -1 } }`,
      JS_FILE
    )
    expectMessageForRule(
      messages,
      "no-else-return",
      ".js file with else after return"
    )
  })
})
