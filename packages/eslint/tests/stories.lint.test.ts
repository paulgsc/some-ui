/**
 * LAYER 2 — Lint-time integration tests for story-lint/prefer-meta-satisfies.
 *
 * Uses lintSnippet()/lintSnippetFixed() (lintText() under the hood) because
 * this rule is purely syntactic (ObjectExpression + type-reference name
 * matching) — no TypeScript language service / projectService is needed, so
 * a plain @typescript-eslint/parser (no `project`/`projectService` option)
 * is enough to parse the TS/TSX syntax in the snippets below.
 */

import { storyLintPlugin } from "@eslint/configs/stories.config.js"
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

const STORY_FILE = "src/example.stories.tsx"

function makeConfig(options?: Record<string, unknown>): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "story-lint": storyLintPlugin },
      rules: {
        "story-lint/prefer-meta-satisfies": options
          ? ["error", options]
          : "error",
      },
    },
  ])
}

const STORY_SNIPPET = `
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { Widget } from "."

type Story = StoryObj<typeof Widget>
type Meta = MetaObj<typeof Widget>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Widget",
  component: Widget,
} as Meta
`

describe("lint: story-lint/prefer-meta-satisfies", () => {
  it("fires on `export default { ... } as Meta`", async () => {
    const msgs = await lintSnippet(makeConfig(), STORY_SNIPPET, STORY_FILE)
    expectMessageForRule(
      msgs,
      "story-lint/prefer-meta-satisfies",
      "export default {...} as Meta"
    )
  })

  it("autofixes to `const meta = {...} satisfies Meta` + `export default meta`", async () => {
    const { output } = await lintSnippetFixed(
      makeConfig(),
      STORY_SNIPPET,
      STORY_FILE
    )
    expect(output).toContain(
      'const meta = {\n  title: "UI/Widget",\n  component: Widget,\n} satisfies Meta'
    )
    expect(output).toContain("export default meta")
    expect(output).not.toContain("} as Meta")
  })

  it("does NOT fire when the default export is already a plain identifier", async () => {
    const code = `
type Meta = { title: string }
const meta = { title: "x" } satisfies Meta
export default meta
`
    const msgs = await lintSnippet(makeConfig(), code, STORY_FILE)
    expectNoMessageForRule(
      msgs,
      "story-lint/prefer-meta-satisfies",
      "already using satisfies + export default meta"
    )
  })

  it("does NOT fire for an asserted type name outside the default allowlist", async () => {
    const code = `
type Foo = { x: number }
export default { x: 1 } as Foo
`
    const msgs = await lintSnippet(makeConfig(), code, STORY_FILE)
    expectNoMessageForRule(
      msgs,
      "story-lint/prefer-meta-satisfies",
      "as Foo — not in default typeNames"
    )
  })

  it("fires for a custom asserted type name via the typeNames option", async () => {
    const code = `
type CustomMeta = { title: string }
export default { title: "x" } as CustomMeta
`
    const msgs = await lintSnippet(
      makeConfig({ typeNames: ["CustomMeta"] }),
      code,
      STORY_FILE
    )
    expectMessageForRule(
      msgs,
      "story-lint/prefer-meta-satisfies",
      "as CustomMeta with typeNames option"
    )
  })

  it("avoids shadowing an existing top-level `meta` binding when autofixing", async () => {
    const code = `
type Meta = { title: string }
const meta = "already taken"

export default {
  title: "x",
} as Meta
`
    const { output } = await lintSnippetFixed(makeConfig(), code, STORY_FILE)
    expect(output).toContain("const meta2 =")
    expect(output).toContain("export default meta2")
  })
})
