/**
 * Config wiring tests for base.config.ts: every rule resolves to error via
 * the real calculateConfigForFile() (which sees what `extends: [prettier]`
 * disables), plus a lint-time subset confirming the rules actually fire.
 * Catches a rule name typo, a dropped rule, prettier compat disabling a
 * non-formatting rule, and severity regressions.
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import baseConfig from "@eslint/configs/base.config.js"
import { describe, it } from "vitest"

import type { SnippetCase } from "./helpers/eslint-resolver.js"
import {
  calculateConfig,
  expectError,
  expectSnippet,
} from "./helpers/eslint-resolver.js"

const HERE = fileURLToPath(import.meta.url)
const FIXTURES = path.resolve(HERE, "../lint-fixtures")

const JS_FILE = path.join(FIXTURES, "src/util.js")

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

  it.each(EXPECTED_ERRORS)('"%s" resolves to error', async (rule) => {
    expectError(await rulesPromise, rule, "src/util.js")
  })
})

const IMPORTS = "no-restricted-imports"

describe("lint: base.config rules fire on real code", () => {
  it.each<SnippetCase>([
    [
      "no-var fires on var declarations",
      `var x = 1; module.exports = x`,
      "no-var",
      true,
    ],
    [
      "no-var does NOT fire on const/let",
      `const x = 1; module.exports = x`,
      "no-var",
      false,
    ],
    [
      "prefer-template fires on string concatenation",
      `const name = "world"; export const greeting = "hello " + name`,
      "prefer-template",
      true,
    ],
    [
      "eqeqeq fires on loose equality check",
      `export function isOne(x) { return x == 1 }`,
      "eqeqeq",
      true,
    ],
    [
      "no-else-return fires when else follows a return",
      `export function f(x) { if (x > 0) { return 1 } else { return -1 } }`,
      "no-else-return",
      true,
    ],
    [
      "no-restricted-imports fires on a parent-relative import",
      `import { foo } from "../foo.js"`,
      IMPORTS,
      true,
    ],
    [
      "no-restricted-imports fires on a multi-level parent-relative import",
      `import { foo } from "../../components/foo.js"`,
      IMPORTS,
      true,
    ],
    [
      "no-restricted-imports fires on a parent-relative re-export",
      `export { foo } from "../foo.js"`,
      IMPORTS,
      true,
    ],
    [
      "no-restricted-imports does NOT fire on a same-directory import",
      `import { foo } from "./foo.js"`,
      IMPORTS,
      false,
    ],
    [
      "no-restricted-imports does NOT fire on a path-alias import",
      `import { foo } from "@eslint/foo.js"`,
      IMPORTS,
      false,
    ],
    [
      "no-restricted-imports does NOT fire on a bare package import",
      `import { foo } from "some-package"`,
      IMPORTS,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(baseConfig, code, "src/util.js", rule, fires, title)
  )
})
