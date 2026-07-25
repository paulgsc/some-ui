/**
 *
 * LAYER 2 — Lint-time integration tests (lintFiles on real fixture files)
 *
 * WHY REAL FILES INSTEAD OF lintText():
 *   typescript.config.ts uses projectService: true, which spins up the
 *   TypeScript language service and resolves files through tsconfig.json.
 *   lintText() passes a virtual filePath that does not exist on disk — the
 *   language service either throws ("file not found in project") or silently
 *   degrades (type-aware rules become no-ops), depending on the TS-ESLint
 *   version.
 *
 *   Fix: every snippet lives as a real .ts/.js file under
 *   tests/lint-fixtures/generated/, anchored by a tsconfig.json that
 *   projectService discovers via directory walk.  Tests call lintFiles()
 *   on those real paths.
 *
 * GENERATING / REGENERATING FIXTURES:
 *   pnpm --filter @some-ui/eslint-kit gen:fixtures
 *
 *   Re-run whenever you add or change a snippet.  The generated files are
 *   committed so CI does not need to run the script.
 *
 * SCOPE RATIONALE:
 *   We only test rules where our config makes a non-default choice that could
 *   silently regress, or where plugin/parser wiring is non-trivial.  See
 *   typescript.config.test.ts (Layer 1) for exhaustive severity wiring checks.
 *
 *   IN SCOPE:
 *     - explicit-function-return-type    (JS and rollup overrides)
 *     - no-explicit-any
 *     - consistent-type-imports
 *     - consistent-type-definitions
 *     - consistent-type-assertions       (assertionStyle: "never" enforcement)
 *     - array-type                       (Array<T> generic form required)
 *     - no-useless-constructor
 *     - no-restricted-syntax             (indexed access guard)
 *     - no-unused-vars                   (core off, TS-aware version on)
 *     - JS bleed guard                   (no @typescript-eslint/* on .js)
 *
 *   OUT OF SCOPE:
 *     - import/no-cycle, import/no-unresolved: require a real module graph.
 *     - Type-aware runtime rules (no-floating-promises, no-misused-promises,
 *       await-thenable, no-deprecated): covered by Layer 1 severity checks;
 *       runtime integration requires a full project with real dependencies,
 *       which belongs in a separate integration test suite.
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

import typescriptConfig from "../src/configs/typescript.config.js"
import { PACKAGE_ROOT } from "./helpers/eslint-resolver.js"

// ── Fixture paths ─────────────────────────────────────────────────────────

const GEN = join(PACKAGE_ROOT, "tests", "lint-fixtures", "generated")

/** Resolves a path under the generated fixtures directory. */
function fix(rel: string): string {
  return join(GEN, rel)
}

// ── Lint helpers ───────────────────────────────────────────────────────────
//
// We use lintFiles() so ESLint reads the file from disk and projectService
// can include it in the TS language service project.

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
  // Filter out fatal parse errors — we only care about rule violations.
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

// ── explicit-function-return-type ──────────────────────────────────────────

describe("lint: @typescript-eslint/explicit-function-return-type", () => {
  it("fires on a function missing a return type annotation", async () => {
    const msgs = await lintFile(fix("explicit-return-type/missing.ts"))
    expectRule(
      msgs,
      "@typescript-eslint/explicit-function-return-type",
      "missing.ts"
    )
  })

  it("does NOT fire on a function with an explicit return type", async () => {
    const msgs = await lintFile(fix("explicit-return-type/present.ts"))
    expectNoRule(
      msgs,
      "@typescript-eslint/explicit-function-return-type",
      "present.ts"
    )
  })

  it("does NOT fire for .js files (rule suppressed by JS override)", async () => {
    const msgs = await lintFile(fix("explicit-return-type/js-file.js"))
    expectNoRule(
      msgs,
      "@typescript-eslint/explicit-function-return-type",
      "js-file.js"
    )
  })

  it("does NOT fire for rollup config files (rollup override)", async () => {
    const msgs = await lintFile(fix("explicit-return-type/rollup.config.ts"))
    expectNoRule(
      msgs,
      "@typescript-eslint/explicit-function-return-type",
      "rollup.config.ts"
    )
  })
})

// ── no-explicit-any ────────────────────────────────────────────────────────

describe("lint: @typescript-eslint/no-explicit-any", () => {
  it("fires when any is used as a type annotation", async () => {
    const msgs = await lintFile(fix("no-explicit-any/using-any.ts"))
    expectRule(msgs, "@typescript-eslint/no-explicit-any", "using-any.ts")
  })

  it("does NOT fire when a proper type is used", async () => {
    const msgs = await lintFile(fix("no-explicit-any/using-unknown.ts"))
    expectNoRule(msgs, "@typescript-eslint/no-explicit-any", "using-unknown.ts")
  })
})

// ── consistent-type-imports ────────────────────────────────────────────────

describe("lint: @typescript-eslint/consistent-type-imports", () => {
  it("fires when a type-only import lacks the type keyword", async () => {
    const msgs = await lintFile(fix("consistent-type-imports/value-style.ts"))
    expectRule(
      msgs,
      "@typescript-eslint/consistent-type-imports",
      "value-style.ts"
    )
  })

  it("does NOT fire when import type is used correctly", async () => {
    const msgs = await lintFile(fix("consistent-type-imports/type-style.ts"))
    expectNoRule(
      msgs,
      "@typescript-eslint/consistent-type-imports",
      "type-style.ts"
    )
  })
})

// ── consistent-type-definitions ───────────────────────────────────────────

describe("lint: @typescript-eslint/consistent-type-definitions", () => {
  it("fires when interface is used instead of type", async () => {
    const msgs = await lintFile(fix("consistent-type-definitions/interface.ts"))
    expectRule(
      msgs,
      "@typescript-eslint/consistent-type-definitions",
      "interface.ts"
    )
  })

  it("does NOT fire when type alias is used", async () => {
    const msgs = await lintFile(
      fix("consistent-type-definitions/type-alias.ts")
    )
    expectNoRule(
      msgs,
      "@typescript-eslint/consistent-type-definitions",
      "type-alias.ts"
    )
  })
})

// ── consistent-type-assertions ────────────────────────────────────────────
//
// Config: assertionStyle:"never"
//
// All type assertions are completely banned to guarantee runtime type safety
// at module and storage boundaries:
//   - {} as Foo
//   - x as string
//   - <Foo>x
//
// Valid narrowing must happen via explicit type guards or data validation.

describe("lint: @typescript-eslint/consistent-type-assertions", () => {
  it("fires when an object literal is cast with as", async () => {
    const msgs = await lintFile(
      fix("consistent-type-assertions/object-literal-as.ts")
    )
    expectRule(
      msgs,
      "@typescript-eslint/consistent-type-assertions",
      "object-literal-as.ts — {} as Foo should be banned"
    )
  })

  it("fires when a non-object-literal value is asserted with as", async () => {
    const msgs = await lintFile(
      fix("consistent-type-assertions/non-object-as.ts")
    )
    expectRule(
      msgs,
      "@typescript-eslint/consistent-type-assertions",
      "non-object-as.ts — x as string should be banned"
    )
  })

  it("fires when angle-bracket assertion style is used", async () => {
    const msgs = await lintFile(
      fix("consistent-type-assertions/angle-bracket.ts")
    )
    expectRule(
      msgs,
      "@typescript-eslint/consistent-type-assertions",
      "angle-bracket.ts — <Foo>raw should be banned"
    )
  })

  it("does NOT fire when narrowing via clean type guards", async () => {
    const msgs = await lintFile(
      fix("consistent-type-assertions/valid-type-guard.ts")
    )
    expectNoRule(
      msgs,
      "@typescript-eslint/consistent-type-assertions",
      "valid-type-guard.ts — Type guards are the approved replacement pattern"
    )
  })
})

// ── array-type ────────────────────────────────────────────────────────────

describe("lint: @typescript-eslint/array-type", () => {
  it("fires when T[] shorthand is used instead of Array<T>", async () => {
    const msgs = await lintFile(fix("array-type/shorthand.ts"))
    expectRule(msgs, "@typescript-eslint/array-type", "shorthand.ts")
  })

  it("does NOT fire when Array<T> generic form is used", async () => {
    const msgs = await lintFile(fix("array-type/generic.ts"))
    expectNoRule(msgs, "@typescript-eslint/array-type", "generic.ts")
  })
})

// ── no-useless-constructor ────────────────────────────────────────────────

describe("lint: @typescript-eslint/no-useless-constructor", () => {
  it("fires on a class with a no-op constructor", async () => {
    const msgs = await lintFile(fix("no-useless-constructor/empty-ctor.ts"))
    expectRule(
      msgs,
      "@typescript-eslint/no-useless-constructor",
      "empty-ctor.ts"
    )
  })

  it("does NOT fire on a constructor that does something", async () => {
    const msgs = await lintFile(
      fix("no-useless-constructor/meaningful-ctor.ts")
    )
    expectNoRule(
      msgs,
      "@typescript-eslint/no-useless-constructor",
      "meaningful-ctor.ts"
    )
  })
})

// ── no-restricted-syntax (indexed access guard) ────────────────────────────

describe("lint: no-restricted-syntax (indexed access guard)", () => {
  it("fires on computed member access", async () => {
    const msgs = await lintFile(fix("no-restricted-syntax/indexed-access.ts"))
    expectRule(msgs, "no-restricted-syntax", "indexed-access.ts")
  })

  it("does NOT fire on dot property access", async () => {
    const msgs = await lintFile(fix("no-restricted-syntax/dot-access.ts"))
    expectNoRule(msgs, "no-restricted-syntax", "dot-access.ts")
  })
})

// ── no-unused-vars replacement ─────────────────────────────────────────────

describe("lint: no-unused-vars replacement (core off, TS-aware on)", () => {
  it("@typescript-eslint/no-unused-vars fires on an unused variable", async () => {
    const msgs = await lintFile(fix("no-unused-vars/unused-var.ts"))
    expectRule(msgs, "@typescript-eslint/no-unused-vars", "unused-var.ts")
  })

  it("core no-unused-vars does NOT fire (replaced by TS version)", async () => {
    const msgs = await lintFile(fix("no-unused-vars/unused-var.ts"))
    expectNoRule(
      msgs,
      "no-unused-vars",
      "unused-var.ts — core rule must be off"
    )
  })

  it("underscore-prefixed variables are ignored per config options", async () => {
    const msgs = await lintFile(fix("no-unused-vars/underscore-var.ts"))
    expectNoRule(msgs, "@typescript-eslint/no-unused-vars", "underscore-var.ts")
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
//
// Belt-and-suspenders: verify the rule is wired at error severity,
// separate from the lint-time proof above.

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
