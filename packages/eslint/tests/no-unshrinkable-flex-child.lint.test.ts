/**
 * LAYER 2 — Lint-time integration tests for
 * fits-the-box/no-unshrinkable-flex-child.
 *
 * The fixtures are the real chains from #899, before and after. The quiz
 * summary's card was `h-full flex flex-col` around a `flex-1` body with no
 * `min-h-0`: correct-looking on its own, and the reason ~950px of content
 * pushed past a ~340px panel rect. The rule reads that relationship - a flex
 * parent and a flexible child - rather than a single class, so what it reports
 * is the defect rather than the symptom.
 *
 * Purely syntactic (JSX ancestry plus string-literal class lists), so a plain
 * @typescript-eslint/parser with ecmaFeatures.jsx is enough.
 */

import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, it } from "vitest"

import { fitsTheBoxPlugin } from "../src/configs/fits-the-box.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const RULE = "fits-the-box/no-unshrinkable-flex-child"
const PANEL = "src/components/topik/quiz-states/quiz-summary/index.tsx"

const config: Array<Linter.Config> = defineConfig([
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "fits-the-box": fitsTheBoxPlugin },
    rules: { [RULE]: "error" },
  },
])

describe("lint: fits-the-box/no-unshrinkable-flex-child", () => {
  it("fires on #899's chain: a flex-1 body in a bounded column, no min-h-0", async () => {
    const code = [
      `const C = () => (`,
      `  <div className="h-full border-2 flex flex-col">`,
      `    <div className="flex-1 flex items-center justify-center p-12">`,
      `      <div className="w-full max-w-2xl space-y-8" />`,
      `    </div>`,
      `  </div>`,
      `)`,
    ].join("\n")
    const msgs = await lintSnippet(config, code, PANEL)
    expectMessageForRule(msgs, RULE, "the pre-#899 quiz summary chain")
  })

  it("accepts the same chain once the child can shrink", async () => {
    const code = [
      `const C = () => (`,
      `  <div className="flex h-full min-h-0 flex-col overflow-hidden border-2">`,
      `    <div className="flex min-h-0 flex-1 flex-col items-center p-4">`,
      `      <div className="w-full max-w-lg space-y-3" />`,
      `    </div>`,
      `  </div>`,
      `)`,
    ].join("\n")
    const msgs = await lintSnippet(config, code, PANEL)
    expectNoMessageForRule(msgs, RULE, "the fitted quiz summary chain")
  })

  it("accepts a flexible child that declares how its excess is handled", async () => {
    const code = [
      `const C = () => (`,
      `  <div className="flex h-full flex-col">`,
      `    <div className="flex-1 overflow-auto" />`,
      `  </div>`,
      `)`,
    ].join("\n")
    const msgs = await lintSnippet(config, code, PANEL)
    expectNoMessageForRule(msgs, RULE, "a flexible child that scrolls")
  })

  it("fires on the inline axis too, where a long word is the content floor", async () => {
    const code = [
      `const C = () => (`,
      `  <div className="flex items-center gap-4">`,
      `    <div className="flex-1 truncate" />`,
      `  </div>`,
      `)`,
    ].join("\n")
    const msgs = await lintSnippet(config, code, PANEL)
    expectMessageForRule(msgs, RULE, "a row child without min-w-0")
  })

  it("accepts min-w-0 on a row child", async () => {
    const code = [
      `const C = () => (`,
      `  <div className="flex items-center gap-4">`,
      `    <div className="min-w-0 flex-1 truncate" />`,
      `  </div>`,
      `)`,
    ].join("\n")
    const msgs = await lintSnippet(config, code, PANEL)
    expectNoMessageForRule(msgs, RULE, "a row child with min-w-0")
  })

  it("says nothing about a flexible element whose parent is not a flex container", async () => {
    const code = [
      `const C = () => (`,
      `  <div className="grid gap-3">`,
      `    <div className="flex-1" />`,
      `  </div>`,
      `)`,
    ].join("\n")
    const msgs = await lintSnippet(config, code, PANEL)
    expectNoMessageForRule(msgs, RULE, "a flex-1 child of a grid")
  })

  it("reads classes through cn() so the common call shape is not a blind spot", async () => {
    const code = [
      `const C = ({ active }: { active: boolean }) => (`,
      `  <div className={cn("flex h-full flex-col")}>`,
      `    <div className={cn("flex-1", active && "ring-2")} />`,
      `  </div>`,
      `)`,
    ].join("\n")
    const msgs = await lintSnippet(config, code, PANEL)
    expectMessageForRule(msgs, RULE, "classes assembled with cn()")
  })
})
