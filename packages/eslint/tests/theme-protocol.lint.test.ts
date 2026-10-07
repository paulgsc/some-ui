/**
 * Lint-time integration tests for the theme-protocol rules. They are
 * syntactic, so a plain @typescript-eslint/parser with JSX parses the
 * snippets (the filePath must end in .tsx).
 */

import themeProtocolConfig, {
  themeProtocolPlugin,
} from "@eslint/configs/theme-protocol.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import type { SnippetCase } from "./helpers/eslint-resolver.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  expectSnippet,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TSX_FILE = "src/example.tsx"

const BOUNDARY = "theme-protocol/no-theme-boundary"
const COLOR = "theme-protocol/no-structural-palette-color"
const STATUS = "theme-protocol/no-fixed-status-color"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "theme-protocol": themeProtocolPlugin },
      rules: {
        [BOUNDARY]: "error",
        [COLOR]: "error",
        [STATUS]: "error",
      },
    },
  ])
}

// The drift check pinning the rule's inlined class list to the registry lives
// in packages/some-styles (theme/__tests__/registry.test.ts): this package
// cannot resolve the design system's source.

describe("lint: theme-protocol/no-theme-boundary", () => {
  it.each<SnippetCase>([
    [
      "fires on a session theme class in a className literal",
      `const C = () => <div className="dark flex flex-col" />`,
      BOUNDARY,
      true,
    ],
    [
      "fires on a feature appearance class in a className literal",
      `const C = () => <div className="code absolute inset-0" />`,
      BOUNDARY,
      true,
    ],
    [
      "fires inside a cn(...) call",
      `const C = () => <div className={cn("cdrama", "space-y-6")} />`,
      BOUNDARY,
      true,
    ],
    // The evasion the attribute/callee walk alone would miss.
    [
      "fires on a class list hoisted to a lookup table",
      `const THEME_CLASS = { study: "topik flex" }`,
      BOUNDARY,
      true,
    ],
    // `.headline` declares only its own private tokens and cannot shadow the
    // semantic contract, so a component applying it to itself is correct.
    [
      "does not fire on a namespaced component skin",
      `const C = () => <div className={cn("headline", "headline--strawberry-moon")} />`,
      BOUNDARY,
      false,
    ],
    // neon-sign keys its skin table by theme id. The key is a lookup value,
    // not markup, and flagging it would punish a table for being readable.
    [
      "does not fire on an object key naming the theme it selects",
      `const THEME_CLASS = { "strawberry-moon": "headline--strawberry-moon" }`,
      BOUNDARY,
      false,
    ],
    [
      "still fires on the value beside such a key",
      `const THEME_CLASS = { "moody": "dark rose-night" }`,
      BOUNDARY,
      true,
    ],
    [
      "does not fire on a token that merely contains a theme name",
      `const C = () => <div className="topik-card dark:bg-background" />`,
      BOUNDARY,
      false,
    ],
    [
      "does not fire on prose that happens to contain a theme word",
      `const copy = { hint: "just keep typing the code", note: "a dark turn" }`,
      BOUNDARY,
      false,
    ],
    [
      "does not fire on the appearance helper",
      `const C = ({ appearance }) => <div className={cn(appearanceClassName(appearance), "absolute inset-0")} />`,
      BOUNDARY,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(makeConfig(), code, TSX_FILE, rule, fires, title)
  )
})

describe("lint: theme-protocol/no-structural-palette-color", () => {
  it.each<SnippetCase>([
    [
      "fires on a neutral surface color",
      `const C = () => <div className="bg-slate-900 p-4" />`,
      COLOR,
      true,
    ],
    [
      "fires on a neutral text color behind a variant prefix",
      `const C = () => <div className="hover:text-gray-400" />`,
      COLOR,
      true,
    ],
    [
      "fires on a neutral border with an opacity modifier",
      `const C = () => <div className={cn("border-neutral-800/50")} />`,
      COLOR,
      true,
    ],
    [
      "fires on a clsx conditional-object key, where the key is the class",
      `const C = ({ on }) => <div className={cn({ "text-gray-500": !on })} />`,
      COLOR,
      true,
    ],
    [
      "does not fire on semantic tokens",
      `const C = () => <div className="bg-background text-muted-foreground border-border ring-ring" />`,
      COLOR,
      false,
    ],
    // Chromatic colors are not this rule's: a chart series or a syntax
    // category may be fixed, and status hues belong to no-fixed-status-color.
    [
      "does not fire on chromatic colors",
      `const C = () => <div className="bg-emerald-500 text-red-400 from-purple-400" />`,
      COLOR,
      false,
    ],
    [
      "does not fire on white/black over media and scrims",
      `const C = () => <div className="bg-black/60 text-white fill-white" />`,
      COLOR,
      false,
    ],
    [
      "does not fire outside a class-name context",
      `const doc = "the bg-slate-900 token was replaced"`,
      COLOR,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(makeConfig(), code, TSX_FILE, rule, fires, title)
  )

  it("names a semantic replacement for the role", async () => {
    const code = `const C = () => <div className="bg-zinc-950" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.find((m) => m.ruleId === COLOR)?.message).toContain(
      "bg-background"
    )
  })
})

describe("lint: theme-protocol/no-fixed-status-color", () => {
  it.each<SnippetCase>([
    [
      "fires on a status hue painting text",
      `const C = () => <span className="text-emerald-400">Correct</span>`,
      STATUS,
      true,
    ],
    [
      "fires on a per-side border with an arbitrary opacity",
      `const C = () => <div className="border-l-rose-500/60 bg-rose-500/[0.06]" />`,
      STATUS,
      true,
    ],
    [
      "fires behind a variant prefix",
      `const C = () => <p className="text-amber-700 dark:text-amber-400" />`,
      STATUS,
      true,
    ],
    [
      "fires on a cn() argument",
      `const C = ({ warn }) => <svg className={cn(warn ? "stroke-amber-500" : "stroke-destructive")} />`,
      STATUS,
      true,
    ],
    [
      "does not fire on the state tokens",
      `const C = () => <div className="text-success bg-destructive/10 border-l-diff-add/70 stroke-warning" />`,
      STATUS,
      false,
    ],
    // Blue, purple and cyan carry charts, syntax and brand identity.
    [
      "does not fire on hues that do not read as a state",
      `const C = () => <div className="text-blue-600 from-purple-400 bg-cyan-400/40" />`,
      STATUS,
      false,
    ],
    [
      "does not fire outside a class-name context",
      `const doc = "text-emerald-400 used to mean correct"`,
      STATUS,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(makeConfig(), code, TSX_FILE, rule, fires, title)
  )

  it("names the state token for the hue", async () => {
    const code = `const C = () => <div className="bg-rose-500" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.find((m) => m.ruleId === STATUS)?.message).toContain(
      "text-destructive"
    )
  })
})

// ── no-restricted-imports, restated from base.config.ts ────────────────────
//
// This config's no-restricted-imports replaces base.config's in packages/ui,
// so it must restate the parent-relative pattern. Uses the real default
// export, since that wiring is what is under test.

describe("lint: theme-protocol config — no-restricted-imports", () => {
  it("still fires on a parent-relative import", async () => {
    const msgs = await lintSnippet(
      themeProtocolConfig,
      `import { foo } from "../foo"`,
      TSX_FILE
    )
    expectMessageForRule(
      msgs,
      "no-restricted-imports",
      "parent-relative import"
    )
  })

  it("fires on an app theme-provider import", async () => {
    const msgs = await lintSnippet(
      themeProtocolConfig,
      `import { useTheme } from "@/providers/theme"`,
      TSX_FILE
    )
    expectMessageForRule(msgs, "no-restricted-imports", "app theme provider")
  })

  it("does NOT fire on a same-directory import", async () => {
    const msgs = await lintSnippet(
      themeProtocolConfig,
      `import { foo } from "./foo"`,
      TSX_FILE
    )
    expectNoMessageForRule(
      msgs,
      "no-restricted-imports",
      "same-directory import"
    )
  })
})
