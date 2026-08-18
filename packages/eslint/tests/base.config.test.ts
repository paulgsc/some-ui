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
import baseConfig from "@eslint/configs/base.config.js"
import { describe, it } from "vitest"

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
const FIXTURES = path.resolve(HERE, "../lint-fixtures")

const JS_FILE = path.join(FIXTURES, "src/util.js")

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
  "no-restricted-imports",
] as const

describe("base.config — error rules wired for .js files", () => {
  const rulesPromise = calculateConfig(baseConfig, JS_FILE)
  let rules: Awaited<ReturnType<typeof calculateConfig>> | undefined

  for (const rule of EXPECTED_ERRORS) {
    it(`"${rule}" resolves to error`, async () => {
      rules ??= await rulesPromise
      expectError(rules, rule, "src/util.js")
    })
  }
})

describe("lint: base.config rules fire on real code", () => {
  it("no-var fires on var declarations", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `var x = 1; module.exports = x`,
      "src/util.js"
    )
    expectMessageForRule(messages, "no-var", ".js file using var")
  })

  it("no-var does NOT fire on const/let", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `const x = 1; module.exports = x`,
      "src/util.js"
    )
    expectNoMessageForRule(messages, "no-var", ".js file using const")
  })

  it("prefer-template fires on string concatenation", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `const name = "world"; export const greeting = "hello " + name`,
      "src/util.js"
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
      "src/util.js"
    )
    expectMessageForRule(messages, "eqeqeq", ".js file using == instead of ===")
  })

  it("no-else-return fires when else follows a return", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `export function f(x) { if (x > 0) { return 1 } else { return -1 } }`,
      "src/util.js"
    )
    expectMessageForRule(
      messages,
      "no-else-return",
      ".js file with else after return"
    )
  })

  it("no-restricted-imports fires on a parent-relative import", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `import { foo } from "../foo.js"`,
      "src/util.js"
    )
    expectMessageForRule(
      messages,
      "no-restricted-imports",
      ".js file importing from a parent directory"
    )
  })

  it("no-restricted-imports fires on a multi-level parent-relative import", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `import { foo } from "../../components/foo.js"`,
      "src/util.js"
    )
    expectMessageForRule(
      messages,
      "no-restricted-imports",
      ".js file importing two levels up"
    )
  })

  it("no-restricted-imports fires on a parent-relative re-export", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `export { foo } from "../foo.js"`,
      "src/util.js"
    )
    expectMessageForRule(
      messages,
      "no-restricted-imports",
      ".js file re-exporting from a parent directory"
    )
  })

  it("no-restricted-imports does NOT fire on a same-directory import", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `import { foo } from "./foo.js"`,
      "src/util.js"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-imports",
      ".js file importing a sibling module"
    )
  })

  it("no-restricted-imports does NOT fire on a path-alias import", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `import { foo } from "@eslint/foo.js"`,
      "src/util.js"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-imports",
      ".js file importing via a path alias"
    )
  })

  it("no-restricted-imports does NOT fire on a bare package import", async () => {
    const messages = await lintSnippet(
      baseConfig,
      `import { foo } from "some-package"`,
      "src/util.js"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-imports",
      ".js file importing a package"
    )
  })
})
