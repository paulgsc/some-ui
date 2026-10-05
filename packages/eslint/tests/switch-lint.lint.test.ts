/**
 * Lint-time integration tests for switch-lint/require-case-braces and
 * switch-lint/require-fail-fast-default. Both are syntactic, so a plain
 * @typescript-eslint/parser (no projectService) parses the snippets.
 */

import { switchLintPlugin } from "@eslint/configs/switch-lint.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  expectSnippet,
  lintSnippet,
  lintSnippetFixed,
} from "./helpers/eslint-resolver.js"

const TS_FILE = "src/example.ts"

function makeConfig(
  ruleName: "require-case-braces" | "require-fail-fast-default",
  options?: Record<string, unknown>
): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.ts"],
      languageOptions: { parser: typescriptParser },
      plugins: { "switch-lint": switchLintPlugin },
      rules: {
        [`switch-lint/${ruleName}`]: options ? ["error", options] : "error",
      },
    },
  ])
}

// ── require-case-braces ──────────────────────────────────────────────────────

describe("lint: switch-lint/require-case-braces", () => {
  it("fires on a case with multiple bare statements", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    break
}
`
    const msgs = await lintSnippet(
      makeConfig("require-case-braces"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-case-braces",
      "case with multiple bare statements"
    )
  })

  it("autofixes a bare case body by wrapping it in braces", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    break
}
`
    const { output } = await lintSnippetFixed(
      makeConfig("require-case-braces"),
      code,
      TS_FILE
    )
    expect(output).toContain('case "a": {')
    expect(output).toContain("default: {")
  })

  it("fires even for a single bare statement", async () => {
    const code = `
switch (x) {
  case "a":
    break
}
`
    const msgs = await lintSnippet(
      makeConfig("require-case-braces"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-case-braces",
      "single bare statement case"
    )
  })

  it("does NOT fire when the case body is already a block", async () => {
    const code = `
switch (x) {
  case "a": {
    doThing()
    break
  }
  default: {
    break
  }
}
`
    const msgs = await lintSnippet(
      makeConfig("require-case-braces"),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-case-braces",
      "already-braced case bodies"
    )
  })

  it("does NOT fire on an empty fallthrough label", async () => {
    const code = `
switch (x) {
  case "a":
  case "b": {
    doThing()
    break
  }
}
`
    const msgs = await lintSnippet(
      makeConfig("require-case-braces"),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-case-braces",
      "empty fallthrough label has nothing to wrap"
    )
  })
})

// ── require-fail-fast-default ────────────────────────────────────────────────

/** A one-case switch over `discriminant`, with `defaultBody` as its default (none when null). */
function switchWithDefault(
  defaultBody: string | null,
  discriminant = "x"
): string {
  const fallback = defaultBody === null ? "" : `  default:${defaultBody}\n`
  return `
switch (${discriminant}) {
  case "a":
    doThing()
    break
${fallback}}
`
}

describe("lint: switch-lint/require-fail-fast-default", () => {
  it.each<
    readonly [string, string, Record<string, unknown> | undefined, boolean]
  >([
    [
      "fires when the switch has no default case at all",
      switchWithDefault(null),
      undefined,
      true,
    ],
    [
      "does NOT fire for `default: return assertNever(x)`",
      switchWithDefault("\n    return assertNever(x)"),
      undefined,
      false,
    ],
    [
      "does NOT fire for a braced `default: { return assertNever(x) }`",
      switchWithDefault(" {\n    return assertNever(x)\n  }"),
      undefined,
      false,
    ],
    [
      "does NOT fire for a plain `throw`",
      switchWithDefault('\n    throw new Error("unreachable: " + x)'),
      undefined,
      false,
    ],
    [
      "fires when the default silently breaks",
      switchWithDefault("\n    break"),
      undefined,
      true,
    ],
    [
      "fires when the default is a bare return",
      switchWithDefault("\n    return"),
      undefined,
      true,
    ],
    [
      "fires when the default only logs and swallows the value",
      switchWithDefault('\n    console.error("unexpected", x)'),
      undefined,
      true,
    ],
    [
      "fires when the helper is called with the wrong argument",
      switchWithDefault("\n    return assertNever(y)"),
      undefined,
      true,
    ],
    // In `switch (action.type)`'s default, TypeScript narrows `action`, not
    // `action.type`, to `never`, and a property access on `never` does not
    // compile, so both spellings are accepted.
    [
      "accepts the narrowing object when the discriminant is a member expression",
      switchWithDefault("\n    return assertNever(action)", "action.type"),
      undefined,
      false,
    ],
    [
      "still accepts the full discriminant for a member expression",
      switchWithDefault("\n    return assertNever(action.type)", "action.type"),
      undefined,
      false,
    ],
    [
      "still fires on an unrelated identifier for a member-expression discriminant",
      switchWithDefault("\n    return assertNever(other)", "action.type"),
      undefined,
      true,
    ],
    [
      "does NOT fire for a custom helper name via the helperNames option",
      switchWithDefault("\n    return unreachable(x)"),
      { helperNames: ["unreachable"] },
      false,
    ],
    [
      "does NOT fire on a missing default when requireDefault is false",
      switchWithDefault(null),
      { requireDefault: false },
      false,
    ],
  ])("%s", (title, code, options, fires) =>
    expectSnippet(
      makeConfig("require-fail-fast-default", options),
      code,
      TS_FILE,
      "switch-lint/require-fail-fast-default",
      fires,
      title
    )
  )
})
