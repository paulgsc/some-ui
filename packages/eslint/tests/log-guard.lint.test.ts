/**
 * Lint-time tests for log-guard/console-reports-message-only (apps/mailbox,
 * MB3): the one console call is the reporter's, and logs a message.
 */

import { logGuardPlugin } from "@eslint/configs/log-guard.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import globals from "globals"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TS_FILE = "src/index.ts"
const RULE = "log-guard/console-reports-message-only"

function makeConfig(declaredGlobals: boolean): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: typescriptParser,
        ...(declaredGlobals ? { globals: globals.browser } : {}),
      },
      plugins: { "log-guard": logGuardPlugin },
      rules: { [RULE]: ["error", { reporter: "report" }] },
    },
  ])
}

// The mailbox's reporter as it stands (apps/mailbox/src/index.ts).
const REPORT = `
function report(error: unknown): void {
  console.error(
    "mailbox store failed:",
    error instanceof Error ? error.message : "unknown"
  )
}
`

describe("lint: log-guard/console-reports-message-only (MB3)", () => {
  it("passes the mailbox's reporter, with console declared or not", async () => {
    for (const declared of [true, false]) {
      const msgs = await lintSnippet(makeConfig(declared), REPORT, TS_FILE)
      expect(msgs.filter((m) => m.fatal === true)).toEqual([])
      expectNoMessageForRule(msgs, RULE, "the mailbox's report")
    }
  })

  it("passes a reporter written as an arrow, and a template with no ${}", async () => {
    const code =
      "const report = (e: unknown) => console.warn(`failed`, e instanceof Error ? e.message : `unknown`)"
    const msgs = await lintSnippet(makeConfig(true), code, TS_FILE)
    expectNoMessageForRule(msgs, RULE, code)
  })

  it("fires on console outside the reporter, or reached indirectly", async () => {
    for (const code of [
      `function handle(request: Request) { console.log("got it") }`,
      `console.error("top level")`,
      `function report(error: unknown) { const log = console; log.error("x") }`,
      `function report(error: unknown) { [1].forEach(() => console.error("x")) }`,
      `function report(error: unknown) { console["error"]; }`,
      `function handle(request: Request) { globalThis.console.log(request) }`,
      `function report(error: unknown) { self.console.error("x") }`,
      `function handle(request: Request) { const { console: log } = globalThis; log.error(request.headers) }`,
      `function handle(request: Request) { const { console } = window; console.log(request.url) }`,
    ]) {
      for (const declared of [true, false]) {
        const msgs = await lintSnippet(makeConfig(declared), code, TS_FILE)
        expectMessageForRule(msgs, RULE, code)
      }
    }
  })

  it("fires on an argument that is not a string or the error's message", async () => {
    for (const code of [
      `function report(error: unknown, request: Request) { console.error("x", request.url) }`,
      `function report(error: unknown, request: Request) { console.error(request.headers) }`,
      `function report(error: any) { console.error(error) }`,
      `function report(error: any) { console.error(\`failed: \${error}\`) }`,
      `function report(error: any) { console.error(error.cause.message) }`,
      `function report(error: any) { console.error(error ? error.message : body) }`,
      `function report(error: any) { console.error(...error.args) }`,
    ]) {
      const msgs = await lintSnippet(makeConfig(true), code, TS_FILE)
      expectMessageForRule(msgs, RULE, code)
    }
  })

  it("does NOT fire on a local named console", async () => {
    const code = `function f(console: { log(x: string): void }) { console.log("x") }`
    const msgs = await lintSnippet(makeConfig(true), code, TS_FILE)
    expectNoMessageForRule(msgs, RULE, code)
  })
})
