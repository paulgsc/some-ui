/**
 * LAYER 2 — Lint-time integration tests for
 * fits-the-box/no-greedy-overflow.
 *
 * The rule had no tests, which is how #858 found it: `no-greedy-overflow` is
 * the reason epic #852 exists in the shape it does, and nothing checked that
 * it still fires on the surfaces the epic is about. Two things are pinned
 * here:
 *
 *   1. The rule fires - and, on the launcher and the composer's picker,
 *      fires *without* either of its seams being needed. Neither surface is
 *      in `allowInFiles`, and neither carries a `scroll-intent:` opt-out.
 *   2. The shipped config's `allowInFiles` list stays a list of primitives
 *      and long-form surfaces. Adding a launcher surface to it is how this
 *      guardrail would be quietly removed, so it fails here rather than
 *      passing review.
 *
 * Purely syntactic (string-literal class-list checks), so a plain
 * @typescript-eslint/parser with ecmaFeatures.jsx is enough - same rationale
 * as tailwind-idiom.lint.test.ts.
 */

/* eslint-disable fits-the-box/no-greedy-overflow --
   This file's whole job is feeding the rule the class strings it exists to
   catch. Every match below is a fixture, not a surface. */

import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import fitsTheBoxConfig, {
  fitsTheBoxPlugin,
} from "../src/configs/fits-the-box.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const RULE = "fits-the-box/no-greedy-overflow"

function makeConfig(options?: Record<string, unknown>): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "fits-the-box": fitsTheBoxPlugin },
      rules: {
        [RULE]: options ? ["error", options] : "error",
      },
    },
  ])
}

/** The two surfaces epic #852 is about, at their real paths. */
const LAUNCHER = "src/components/activity/activity-launcher.tsx"
const PICKER = "src/components/composer/activity-picker-step.tsx"

describe("lint: fits-the-box/no-greedy-overflow", () => {
  it("fires on overflow-y-auto in the dashboard launcher", async () => {
    const code = `const C = () => <div className="grid gap-3 overflow-y-auto" />`
    const msgs = await lintSnippet(makeConfig(), code, LAUNCHER)
    expectMessageForRule(msgs, RULE, "a greedy class in the launcher")
  })

  it("fires on overflow-y-auto in the composer's activity picker", async () => {
    const code = `const C = () => <div className="grid gap-3 overflow-y-auto" />`
    const msgs = await lintSnippet(makeConfig(), code, PICKER)
    expectMessageForRule(msgs, RULE, "a greedy class in the composer picker")
  })

  it("fires on a viewport-percentage max height, the other way to give overflow away", async () => {
    const code = `const C = () => <div className="max-h-[60vh]" />`
    const msgs = await lintSnippet(makeConfig(), code, LAUNCHER)
    expectMessageForRule(msgs, RULE, "a viewport-percentage max height")
  })

  it("leaves a horizontally scrolling strip alone - that is a bounded pattern", async () => {
    const code = `const C = () => <div className="flex gap-2 overflow-x-auto" />`
    const msgs = await lintSnippet(makeConfig(), code, LAUNCHER)
    expectNoMessageForRule(msgs, RULE, "a horizontally scrolling strip")
  })

  it("leaves the fixed, bounded box the picker actually uses alone", async () => {
    const code = `const C = () => <div className="h-72 sm:h-80" />`
    const msgs = await lintSnippet(makeConfig(), code, PICKER)
    expectNoMessageForRule(msgs, RULE, "a fixed, bounded height")
  })

  it("honours a scroll-intent opt-out attached to the class string", async () => {
    const code = [
      `const C = () => <pre data-scroll-intent="long-form" className={`,
      `  // scroll-intent: long-form - a stack trace is as long as it is`,
      `  "overflow-auto"`,
      `} />`,
    ].join("\n")
    const msgs = await lintSnippet(makeConfig(), code, LAUNCHER)
    expectNoMessageForRule(msgs, RULE, "a declared scroll-intent opt-out")
  })

  it("exempts a file listed in allowInFiles, and only that file", async () => {
    const code = `const C = () => <div className="overflow-y-auto" />`
    const options = { allowInFiles: ["ui/command"] }

    expectNoMessageForRule(
      await lintSnippet(makeConfig(options), code, "src/ui/command.tsx"),
      RULE,
      "a file listed in allowInFiles"
    )
    expectMessageForRule(
      await lintSnippet(makeConfig(options), code, LAUNCHER),
      RULE,
      "a file not listed in allowInFiles"
    )
  })
})

/**
 * `allowInFiles` off a flat-config rule entry, narrowed rather than asserted.
 *
 * The preset is ordinary data at runtime, so this reads it the way the rule
 * itself reads its options: check the shape, take what matches, ignore the
 * rest. An assertion here would make the test pass on a config that had
 * silently changed shape.
 */
function readAllowInFiles(entry: Linter.RuleEntry | undefined): Array<string> {
  if (!Array.isArray(entry)) return []
  const options: unknown = entry[1]
  if (typeof options !== "object" || options === null) return []
  if (!("allowInFiles" in options)) return []
  const list: unknown = options.allowInFiles
  if (!Array.isArray(list)) return []
  return list.filter((value): value is string => typeof value === "string")
}

describe("the shipped fits-the-box config", () => {
  /**
   * `allowInFiles` is matched with `String#includes`, so an entry as short as
   * "activity" would silently exempt every activity surface in the repo. This
   * asserts the list stays what its comment says it is - primitives whose
   * scroll *is* the primitive, and surfaces whose length belongs to the
   * author.
   */
  it("does not exempt the launcher or the composer's picker", () => {
    const entry = fitsTheBoxConfig
      .flatMap((block) => Object.entries(block.rules ?? {}))
      .find(([name]) => name === RULE)?.[1]

    expect(
      entry,
      `${RULE} is not configured in the shipped preset`
    ).toBeDefined()

    const allowInFiles = readAllowInFiles(entry)

    for (const surface of [LAUNCHER, PICKER]) {
      const exemption = allowInFiles.find((fragment) =>
        surface.includes(fragment)
      )
      expect(
        exemption,
        `"${String(exemption)}" in allowInFiles exempts ${surface} from ` +
          `${RULE}. The launcher surfaces need neither seam (epic #852): if one ` +
          `of them genuinely has to scroll, say so on the element with ` +
          `data-scroll-intent and a scroll-intent: comment, rather than turning ` +
          `the rule off for the whole file.`
      ).toBeUndefined()
    }
  })
})
