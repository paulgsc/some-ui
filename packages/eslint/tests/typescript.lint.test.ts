/**
 * Lint-time integration tests for typescript.config.ts, run with lintFiles()
 * on real fixture files: `projectService: true` needs files on disk under a
 * tsconfig, and lintText() with a virtual path throws or silently disables
 * type-aware rules.
 *
 * Fixtures live in tests/lint-fixtures/generated/ and are committed;
 * regenerate after changing a snippet with
 * `pnpm --filter @some-ui/eslint-kit gen:fixtures`.
 *
 * Only rules where the config makes a non-default choice, or where wiring is
 * non-trivial; typescript.config.test.ts checks severities exhaustively.
 * Rules needing a real module graph or full dependencies are out of scope.
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import typescriptConfig from "@eslint/configs/typescript.config.js"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

import { PACKAGE_ROOT } from "./helpers/eslint-resolver.js"

// ── Fixture paths ─────────────────────────────────────────────────────────

const GEN = join(PACKAGE_ROOT, "tests", "lint-fixtures", "generated")

/** Resolves a path under the generated fixtures directory. */
function fix(rel: string): string {
  return join(GEN, rel)
}

// ── Lint helpers ───────────────────────────────────────────────────────────

async function lintFile(
  filePath: string
): Promise<Array<ESLint.LintResult["messages"][number]>> {
  if (!existsSync(filePath)) {
    throw new Error(
      `Fixture file not found: ${filePath}\n` +
        `Run: pnpm --filter @some-ui/eslint-kit gen:fixtures`
    )
  }

  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: typescriptConfig,
  })

  const [result] = await eslint.lintFiles([filePath])
  return (result?.messages ?? []).filter((m) => !m.fatal)
}

function expectRule(
  messages: ReturnType<typeof lintFile> extends Promise<infer T> ? T : never,
  ruleId: string,
  context: string
): void {
  const found = messages.some((m) => m.ruleId === ruleId)
  if (!found) {
    const present = messages.map((m) => m.ruleId).join(", ") || "(none)"
    throw new Error(
      `[expectRule] "${ruleId}" produced no message for ${context}.\n` +
        `Rules that fired: ${present}`
    )
  }
}

function expectNoRule(
  messages: ReturnType<typeof lintFile> extends Promise<infer T> ? T : never,
  ruleId: string,
  context: string
): void {
  const offending = messages.filter((m) => m.ruleId === ruleId)
  if (offending.length > 0) {
    throw new Error(
      `[expectNoRule] "${ruleId}" should not fire for ${context}, ` +
        `but produced ${offending.length} message(s):\n${offending
          .map((m) => `  line ${m.line}: ${m.message}`)
          .join("\n")}`
    )
  }
}

const TS = "@typescript-eslint"

describe("lint: typescript.config fixtures", () => {
  it.each<readonly [string, string, string, boolean]>([
    [
      "explicit-function-return-type fires on a function missing a return type",
      "explicit-return-type/missing.ts",
      `${TS}/explicit-function-return-type`,
      true,
    ],
    [
      "explicit-function-return-type does NOT fire on an explicit return type",
      "explicit-return-type/present.ts",
      `${TS}/explicit-function-return-type`,
      false,
    ],
    [
      "explicit-function-return-type does NOT fire for .js files (JS override)",
      "explicit-return-type/js-file.js",
      `${TS}/explicit-function-return-type`,
      false,
    ],
    [
      "explicit-function-return-type does NOT fire for rollup config files",
      "explicit-return-type/rollup.config.ts",
      `${TS}/explicit-function-return-type`,
      false,
    ],
    [
      "no-explicit-any fires when any is used as a type annotation",
      "no-explicit-any/using-any.ts",
      `${TS}/no-explicit-any`,
      true,
    ],
    [
      "no-explicit-any does NOT fire when a proper type is used",
      "no-explicit-any/using-unknown.ts",
      `${TS}/no-explicit-any`,
      false,
    ],
    [
      "consistent-type-imports fires when a type-only import lacks the type keyword",
      "consistent-type-imports/value-style.ts",
      `${TS}/consistent-type-imports`,
      true,
    ],
    [
      "consistent-type-imports does NOT fire when import type is used",
      "consistent-type-imports/type-style.ts",
      `${TS}/consistent-type-imports`,
      false,
    ],
    [
      "consistent-type-definitions fires when interface is used instead of type",
      "consistent-type-definitions/interface.ts",
      `${TS}/consistent-type-definitions`,
      true,
    ],
    [
      "consistent-type-definitions does NOT fire when a type alias is used",
      "consistent-type-definitions/type-alias.ts",
      `${TS}/consistent-type-definitions`,
      false,
    ],
    // assertionStyle "never": every assertion is banned; narrow with guards.
    [
      "consistent-type-assertions fires on {} as Foo",
      "consistent-type-assertions/object-literal-as.ts",
      `${TS}/consistent-type-assertions`,
      true,
    ],
    [
      "consistent-type-assertions fires on x as string",
      "consistent-type-assertions/non-object-as.ts",
      `${TS}/consistent-type-assertions`,
      true,
    ],
    [
      "consistent-type-assertions fires on <Foo>raw",
      "consistent-type-assertions/angle-bracket.ts",
      `${TS}/consistent-type-assertions`,
      true,
    ],
    [
      "consistent-type-assertions does NOT fire when narrowing via type guards",
      "consistent-type-assertions/valid-type-guard.ts",
      `${TS}/consistent-type-assertions`,
      false,
    ],
    [
      "array-type fires when T[] shorthand is used instead of Array<T>",
      "array-type/shorthand.ts",
      `${TS}/array-type`,
      true,
    ],
    [
      "array-type does NOT fire when Array<T> is used",
      "array-type/generic.ts",
      `${TS}/array-type`,
      false,
    ],
    [
      "no-useless-constructor fires on a no-op constructor",
      "no-useless-constructor/empty-ctor.ts",
      `${TS}/no-useless-constructor`,
      true,
    ],
    [
      "no-useless-constructor does NOT fire on a constructor that does something",
      "no-useless-constructor/meaningful-ctor.ts",
      `${TS}/no-useless-constructor`,
      false,
    ],
    [
      "no-restricted-syntax fires on computed member access",
      "no-restricted-syntax/indexed-access.ts",
      "no-restricted-syntax",
      true,
    ],
    [
      "no-restricted-syntax does NOT fire on dot property access",
      "no-restricted-syntax/dot-access.ts",
      "no-restricted-syntax",
      false,
    ],
    [
      "@typescript-eslint/no-unused-vars fires on an unused variable",
      "no-unused-vars/unused-var.ts",
      `${TS}/no-unused-vars`,
      true,
    ],
    [
      "core no-unused-vars does NOT fire (replaced by the TS version)",
      "no-unused-vars/unused-var.ts",
      "no-unused-vars",
      false,
    ],
    [
      "underscore-prefixed variables are ignored per config options",
      "no-unused-vars/underscore-var.ts",
      `${TS}/no-unused-vars`,
      false,
    ],
  ])("%s", async (title, file, rule, fires) => {
    const msgs = await lintFile(fix(file))
    if (fires) expectRule(msgs, rule, title)
    else expectNoRule(msgs, rule, title)
  })
})

// ── JS bleed guard ────────────────────────────────────────────────────────

describe("lint: JS file — no type-aware rule messages emitted", () => {
  it("no @typescript-eslint/* type-aware rules fire on a plain .js file", async () => {
    const msgs = await lintFile(fix("no-unused-vars/js-file.js"))
    const tsMessages = msgs.filter(
      (m) =>
        m.ruleId?.startsWith("@typescript-eslint/") &&
        m.ruleId !== "@typescript-eslint/no-unused-vars"
    )
    if (tsMessages.length > 0) {
      throw new Error(
        `No type-aware @typescript-eslint rules should fire on .js, but got:\n${tsMessages
          .map((m) => `  ${m.ruleId ?? "(no ruleId)"} (line ${m.line})`)
          .join("\n")}`
      )
    }
  })
})

// ── Severity check for consistent-type-assertions ─────────────────────────

describe("lint: consistent-type-assertions severity is error (not warn)", () => {
  it("message severity is 2 (error) when object literal as fires", async () => {
    const msgs = await lintFile(
      fix("consistent-type-assertions/object-literal-as.ts")
    )
    const msg = msgs.find(
      (m) => m.ruleId === "@typescript-eslint/consistent-type-assertions"
    )
    if (msg === undefined) {
      throw new Error(
        "Expected @typescript-eslint/consistent-type-assertions to fire on {} as Foo"
      )
    }
    expect(msg.severity).toBe(2)
  })
})
