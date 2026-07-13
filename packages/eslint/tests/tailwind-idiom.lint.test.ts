/**
 * LAYER 2 — Lint-time integration tests for
 * tailwind-idiom/no-interpolated-classname.
 *
 * Purely syntactic (TemplateLiteral/BinaryExpression shape checks against
 * ancestor JSXAttribute/CallExpression nodes, no type information needed),
 * so a plain @typescript-eslint/parser with ecmaFeatures.jsx is enough —
 * same rationale as switch-lint.lint.test.ts.
 *
 * filePath passed to lintSnippet must end in .tsx for JSX syntax to parse.
 */

import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import { tailwindIdiomPlugin } from "../src/configs/tailwind-idiom.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TSX_FILE = "src/example.tsx"

function makeConfig(options?: Record<string, unknown>): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "tailwind-idiom": tailwindIdiomPlugin },
      rules: {
        "tailwind-idiom/no-interpolated-classname": options
          ? ["error", options]
          : "error",
      },
    },
  ])
}

const RULE = "tailwind-idiom/no-interpolated-classname"

describe("lint: tailwind-idiom/no-interpolated-classname", () => {
  it("fires when a prefix is fused onto an interpolated expression in className", async () => {
    const code = `const C = ({ color }) => <div className={\`bg-\${color}-500\`} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "bg-${color}-500 fused in className")
  })

  it("fires when a prefix is fused onto an interpolated expression inside cn(...)", async () => {
    const code = `const C = ({ theme }) => <div className={cn("headline", \`headline--\${theme}\`)} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "headline--${theme} fused inside cn(...)")
  })

  it("fires on string concatenation building a class fragment", async () => {
    const code = `const C = ({ color }) => <div className={"bg-" + color} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, '"bg-" + color concatenation')
  })

  it("fires on a suffix fused onto an interpolated expression", async () => {
    const code = `const C = ({ n }) => <div className={cn(\`\${n}-full\`)} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "${n}-full suffix fusion")
  })

  it("does NOT fire when a ternary selects between complete literal strings", async () => {
    const code = `const C = ({ isActive }) => <div className={\`flex \${isActive ? "text-primary" : "text-muted"}\`} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "ternary of complete literal strings")
  })

  it("does NOT fire when a lookup table of complete literal strings is indexed", async () => {
    const code = `
const colorClass = { green: "text-green-400", red: "text-red-400" }[color]
const C = () => <span className={\`font-mono \${colorClass}\`} />
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "lookup-table-derived complete literal string"
    )
  })

  it("does NOT fire for the CSS-custom-property + static arbitrary-value pattern (dice-card idiom)", async () => {
    const code = `
const C = ({ rotation }) => (
  <div
    style={{ "--cube-x-rotation": rotation }}
    className="[transform:rotateX(calc(var(--cube-x-rotation)*1deg))]"
  />
)
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "dynamic value threaded through a CSS custom property, static class name"
    )
  })

  it("does NOT fire on a fused interpolation outside className/cn(...) scope", async () => {
    const code = `const url = \`https://\${host}/path\``
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "fused interpolation unrelated to classnames"
    )
  })

  it("does NOT fire on the default-ignored language-${language} syntax-highlighter class", async () => {
    const code = `const C = ({ language }) => <code className={\`language-\${language}\`} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "language-${language} is in the default ignore list"
    )
  })

  it("respects a custom ignore option", async () => {
    const code = `const C = ({ id }) => <div className={\`widget-\${id}\`} />`
    const msgs = await lintSnippet(
      makeConfig({ ignore: ["widget-"] }),
      code,
      TSX_FILE
    )
    expectNoMessageForRule(
      msgs,
      RULE,
      "widget-${id} allowlisted via custom ignore option"
    )
  })

  it("respects a custom calleeNames option", async () => {
    // Not nested in a className attribute — isolates the callee-name scoping
    // from the (separately tested) attribute scoping.
    const code = `const c = ({ color }) => myClassMerge(\`bg-\${color}-500\`)`
    const withoutOption = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      withoutOption,
      RULE,
      "unrecognized callee name is not scoped by default"
    )

    const withOption = await lintSnippet(
      makeConfig({ calleeNames: ["myClassMerge"] }),
      code,
      TSX_FILE
    )
    expectMessageForRule(
      withOption,
      RULE,
      "myClassMerge(...) recognized via calleeNames option"
    )
  })

  it("respects a custom attributeNames option", async () => {
    const code = `const C = ({ color }) => <div dataClass={\`bg-\${color}-500\`} />`
    const withoutOption = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      withoutOption,
      RULE,
      "unrecognized attribute name is not scoped by default"
    )

    const withOption = await lintSnippet(
      makeConfig({ attributeNames: ["dataClass"] }),
      code,
      TSX_FILE
    )
    expectMessageForRule(
      withOption,
      RULE,
      "dataClass attribute recognized via attributeNames option"
    )
  })

  it("fires only once for a multi-segment concatenation chain", async () => {
    const code = `const C = ({ color }) => <div className={"bg-" + color + "-500"} />`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    const offending = msgs.filter((m) => m.ruleId === RULE)
    expect(offending.length).toBe(1)
  })
})
