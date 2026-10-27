/**
 * Lint-time tests for one-owner/no-local-primitive (U4, #2112): each shape a
 * copy of `assertNever` or `isRecord` took before core-utils owned them.
 */

import {
  oneOwnerPlugin,
  primitiveOwners,
} from "@eslint/configs/one-owner.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const RULE = "one-owner/no-local-primitive"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.ts"],
      languageOptions: { parser: typescriptParser },
      plugins: { "one-owner": oneOwnerPlugin },
      rules: { [RULE]: ["error", { owners: primitiveOwners }] },
    },
  ])
}

describe("lint: one-owner/no-local-primitive", () => {
  it.each([
    [
      "a file-local function",
      "function assertNever(value: never): never { throw new Error(String(value)) }",
    ],
    [
      "an exported function",
      "export function assertNever(value: never): never { throw new Error(String(value)) }",
    ],
    [
      "a const arrow",
      "const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null",
    ],
    [
      "an exported const function expression",
      "export const isRecord = function (value: unknown): boolean { return typeof value === 'object' }",
    ],
  ])("fires on %s", async (shape, code) => {
    const msgs = await lintSnippet(makeConfig(), code, "src/lib/guards.ts")
    expectMessageForRule(msgs, RULE, shape)
  })

  it.each(
    Object.entries(primitiveOwners).flatMap(([name, files]) =>
      files.map((file) => [name, file])
    )
  )("allows %s in its owner %s", async (name, owner) => {
    const code = `export function ${name}(value: unknown): boolean { return value === null }`
    expectNoMessageForRule(
      await lintSnippet(makeConfig(), code, owner),
      RULE,
      `${name} in ${owner}`
    )
  })

  it("fires on a name defined in the other primitive's owner", async () => {
    const code =
      "export function isRecord(value: unknown): boolean { return value === null }"
    const msgs = await lintSnippet(
      makeConfig(),
      code,
      "packages/core-utils/src/lib/assert-never.ts"
    )
    expectMessageForRule(msgs, RULE, "isRecord in assertNever's owner")
  })

  it("stays quiet on an import, a call and an unrelated name", async () => {
    const code = `
import { assertNever, isRecord } from "@some-ui/core-utils"
const isRecordLike = (value: unknown): boolean => isRecord(value)
function check(x: never): never { return assertNever(x) }
export default function () { return null }
`
    const msgs = await lintSnippet(makeConfig(), code, "src/lib/guards.ts")
    expectNoMessageForRule(msgs, RULE, "an import, a call, isRecordLike")
  })
})
