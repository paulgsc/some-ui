/**
 * LAYER 2 — Lint-time integration tests for switch-lint/require-case-braces
 * and switch-lint/require-fail-fast-default.
 *
 * Uses lintSnippet()/lintSnippetFixed() (lintText() under the hood) because
 * both rules are purely syntactic (SwitchStatement/SwitchCase shape checks,
 * no type information needed) — no TypeScript language service / projectService
 * is required, so a plain @typescript-eslint/parser (no `project`/
 * `projectService` option) is enough to parse the TS syntax in the snippets
 * below. Same rationale as stories.lint.test.ts.
 */

import { switchLintPlugin } from "@eslint/configs/switch-lint.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
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

describe("lint: switch-lint/require-fail-fast-default", () => {
  it("fires when the switch has no default case at all", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "missing default case"
    )
  })

  it("does NOT fire for `default: return assertNever(x)`", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    return assertNever(x)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "default: return assertNever(x)"
    )
  })

  it("does NOT fire for a braced `default: { return assertNever(x) }`", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default: {
    return assertNever(x)
  }
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "braced default calling assertNever"
    )
  })

  it("does NOT fire for a plain `throw`", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    throw new Error("unreachable: " + x)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "default: throw new Error(...)"
    )
  })

  it("fires when the default silently breaks", async () => {
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
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "default: break"
    )
  })

  it("fires when the default is a bare return", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    return
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "default: return (bare)"
    )
  })

  it("fires when the default only logs and swallows the value", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    console.error("unexpected", x)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "default: console.error(...) only"
    )
  })

  it("fires when the helper is called with the wrong argument", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    return assertNever(y)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "assertNever(y) called with wrong argument"
    )
  })

  /**
   * `switch (action.type)` over a discriminated union is the shape this rule
   * exists for, and in its default case TypeScript has narrowed `action` -
   * not `action.type` - to `never`. A property access on `never` does not
   * compile, so demanding the full discriminant text there would ask for
   * code that cannot exist. Both spellings are accepted.
   */
  it("accepts the narrowing object when the discriminant is a member expression", async () => {
    const code = `
switch (action.type) {
  case "a":
    doThing()
    break
  default:
    return assertNever(action)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "assertNever(action) for switch (action.type)"
    )
  })

  it("still accepts the full discriminant for a member expression", async () => {
    const code = `
switch (action.type) {
  case "a":
    doThing()
    break
  default:
    return assertNever(action.type)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "assertNever(action.type) for switch (action.type)"
    )
  })

  it("still fires on an unrelated identifier for a member-expression discriminant", async () => {
    const code = `
switch (action.type) {
  case "a":
    doThing()
    break
  default:
    return assertNever(other)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default"),
      code,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "assertNever(other) for switch (action.type)"
    )
  })

  it("does NOT fire for a custom helper name via the helperNames option", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
  default:
    return unreachable(x)
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default", {
        helperNames: ["unreachable"],
      }),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "default: return unreachable(x) with custom helperNames option"
    )
  })

  it("does NOT fire on a missing default when requireDefault is false", async () => {
    const code = `
switch (x) {
  case "a":
    doThing()
    break
}
`
    const msgs = await lintSnippet(
      makeConfig("require-fail-fast-default", { requireDefault: false }),
      code,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "switch-lint/require-fail-fast-default",
      "missing default with requireDefault: false"
    )
  })
})
