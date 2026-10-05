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

import { tailwindIdiomPlugin } from "@eslint/configs/tailwind-idiom.config.js"
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
  it.each<SnippetCase>([
    [
      "fires when a prefix is fused onto an interpolated expression in className",
      `const C = ({ color }) => <div className={\`bg-\${color}-500\`} />`,
      RULE,
      true,
    ],
    [
      "fires when a prefix is fused onto an interpolated expression inside cn(...)",
      `const C = ({ theme }) => <div className={cn("headline", \`headline--\${theme}\`)} />`,
      RULE,
      true,
    ],
    [
      "fires on string concatenation building a class fragment",
      `const C = ({ color }) => <div className={"bg-" + color} />`,
      RULE,
      true,
    ],
    [
      "fires on a suffix fused onto an interpolated expression",
      `const C = ({ n }) => <div className={cn(\`\${n}-full\`)} />`,
      RULE,
      true,
    ],
    [
      "does NOT fire when a ternary selects between complete literal strings",
      `const C = ({ isActive }) => <div className={\`flex \${isActive ? "text-primary" : "text-muted"}\`} />`,
      RULE,
      false,
    ],
    [
      "does NOT fire when a lookup table of complete literal strings is indexed",
      `
const colorClass = { green: "text-green-400", red: "text-red-400" }[color]
const C = () => <span className={\`font-mono \${colorClass}\`} />
`,
      RULE,
      false,
    ],
    [
      "does NOT fire for the CSS-custom-property + static arbitrary-value pattern (chat-header idiom)",
      `
const C = ({ rotation }) => (
  <div
    style={{ "--cube-x-rotation": rotation }}
    className="[transform:rotateX(calc(var(--cube-x-rotation)*1deg))]"
  />
)
`,
      RULE,
      false,
    ],
    [
      "does NOT fire on a fused interpolation outside className/cn(...) scope",
      `const url = \`https://\${host}/path\``,
      RULE,
      false,
    ],
    [
      "does NOT fire on the default-ignored language-${language} syntax-highlighter class",
      `const C = ({ language }) => <code className={\`language-\${language}\`} />`,
      RULE,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(makeConfig(), code, TSX_FILE, rule, fires, title)
  )

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
