/**
 * LAYER 2 — Lint-time integration tests for the theme-protocol rules.
 *
 * Purely syntactic (string literals checked against their enclosing
 * JSXAttribute/CallExpression/declarator), so a plain
 * @typescript-eslint/parser with ecmaFeatures.jsx is enough — same rationale
 * as tailwind-idiom.lint.test.ts.
 *
 * filePath passed to lintSnippet must end in .tsx for JSX syntax to parse.
 */

import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import { themeProtocolPlugin } from "../src/configs/theme-protocol.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TSX_FILE = "src/example.tsx"

const BOUNDARY = "theme-protocol/no-theme-boundary"
const COLOR = "theme-protocol/no-structural-palette-color"

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
      },
    },
  ])
}

// The drift check that pins this rule's inlined class list to the canonical
// registry lives in packages/some-styles (theme/registry.test.ts). It cannot
// live here: this package typechecks under node16 resolution and must not
// resolve the design system's source at all — which is the same constraint
// that forces the list to be inlined in the first place.

describe("lint: theme-protocol/no-theme-boundary", () => {
  it("fires on a session theme class in a className literal", async () => {
    const code = `const C = () => <div className="dark flex flex-col" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, BOUNDARY, '"dark" on a component root')
  })

  it("fires on a feature appearance class in a className literal", async () => {
    const code = `const C = () => <div className="code absolute inset-0" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, BOUNDARY, '"code" on a component root')
  })

  it("fires inside a cn(...) call", async () => {
    const code = `const C = () => <div className={cn("cdrama", "space-y-6")} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, BOUNDARY, '"cdrama" inside cn(...)')
  })

  it("fires on a class list hoisted to a lookup table", async () => {
    // The evasion the attribute/callee walk alone would miss.
    const code = `const THEME_CLASS = { study: "topik flex" }`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, BOUNDARY, '"topik" in a hoisted class table')
  })

  it("does not fire on a namespaced component skin", async () => {
    // `.headline` declares only its own private tokens and cannot shadow the
    // semantic contract, so a component applying it to itself is correct.
    const code = `const C = () => <div className={cn("headline", "headline--strawberry-moon")} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      BOUNDARY,
      "a component-scope skin on its own root"
    )
  })

  it("does not fire on an object key naming the theme it selects", async () => {
    // neon-sign keys its skin table by theme id. The key is a lookup value,
    // not markup, and flagging it would punish a table for being readable.
    const code = `const THEME_CLASS = { "strawberry-moon": "headline--strawberry-moon" }`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, BOUNDARY, "a theme id used as a lookup key")
  })

  it("still fires on the value beside such a key", async () => {
    const code = `const THEME_CLASS = { "moody": "dark strawberry-moon" }`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, BOUNDARY, "theme class as a table value")
  })

  it("does not fire on a token that merely contains a theme name", async () => {
    const code = `const C = () => <div className="topik-card dark:bg-background" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      BOUNDARY,
      "a class merely prefixed with a theme name"
    )
  })

  it("does not fire on prose that happens to contain a theme word", async () => {
    const code = `const copy = { hint: "just keep typing the code", note: "a dark turn" }`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, BOUNDARY, "prose containing a theme word")
  })

  it("does not fire on the appearance helper", async () => {
    const code = `const C = ({ appearance }) => <div className={cn(appearanceClassName(appearance), "absolute inset-0")} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      BOUNDARY,
      "the appearance helper, which is the prescribed fix"
    )
  })
})

describe("lint: theme-protocol/no-structural-palette-color", () => {
  it("fires on a neutral surface color", async () => {
    const code = `const C = () => <div className="bg-slate-900 p-4" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, COLOR, "bg-slate-900")
  })

  it("fires on a neutral text color behind a variant prefix", async () => {
    const code = `const C = () => <div className="hover:text-gray-400" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, COLOR, "hover:text-gray-400")
  })

  it("fires on a neutral border with an opacity modifier", async () => {
    const code = `const C = () => <div className={cn("border-neutral-800/50")} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, COLOR, "border-neutral-800/50")
  })

  it("names a semantic replacement for the role", async () => {
    const code = `const C = () => <div className="bg-zinc-950" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.find((m) => m.ruleId === COLOR)?.message).toContain(
      "bg-background"
    )
  })

  it("fires on a clsx conditional-object key, where the key is the class", async () => {
    const code = `const C = ({ on }) => <div className={cn({ "text-gray-500": !on })} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, COLOR, "text-gray-500 as a clsx object key")
  })

  it("does not fire on semantic tokens", async () => {
    const code = `const C = () => <div className="bg-background text-muted-foreground border-border ring-ring" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, COLOR, "semantic tokens")
  })

  it("does not fire on chromatic colors", async () => {
    // A chart series, a syntax category or a status hue may legitimately be
    // fixed; flagging those would bury the real findings under exceptions.
    const code = `const C = () => <div className="bg-emerald-500 text-red-400 from-purple-400" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      COLOR,
      "chromatic colors, which may be content-semantic"
    )
  })

  it("does not fire on white/black over media and scrims", async () => {
    const code = `const C = () => <div className="bg-black/60 text-white fill-white" />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, COLOR, "white/black over media and scrims")
  })

  it("does not fire outside a class-name context", async () => {
    const code = `const doc = "the bg-slate-900 token was replaced"`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, COLOR, "a class name mentioned in prose")
  })
})
