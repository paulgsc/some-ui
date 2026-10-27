/**
 * Lint-time tests for log-guard/console-reports-message-only (apps/mailbox,
 * MB3): the one console call is the reporter's, and logs a message. And the
 * same rule as FT1, in every preset's `src/`: `console` is no way to report
 * a failure, since a release build strips it.
 */

import logGuardConfig, {
  failureLogConfig,
  logGuardPlugin,
} from "@eslint/configs/log-guard.config.js"
import {
  appsRecommended,
  extensionsRecommended,
  maishatuRecommended,
  uiRecommended,
} from "@eslint/index.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import globals from "globals"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  flat,
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

describe("lint: log-guard as FT1 (failureLogConfig)", () => {
  const config = defineConfig([
    { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
    ...failureLogConfig,
  ])

  it("fires on console in src/, whatever no-console disable sits above it", async () => {
    for (const code of [
      `// eslint-disable-next-line no-console\nconsole.error("failed", error)`,
      `// eslint-disable-next-line no-console -- dev only\nconsole.warn("x")`,
      `/* eslint-disable no-console */\nconsole.info("x")`,
      `globalThis.console.error("failed")`,
      `function report(error: unknown) { console.error("x") }`,
    ]) {
      const msgs = await lintSnippet(config, code, TS_FILE)
      expectMessageForRule(msgs, RULE, code)
      expect(msgs.find((m) => m.ruleId === RULE)?.message, code).toContain(
        "FT1"
      )
    }
  })

  it("does NOT fire outside src/, or in a test", async () => {
    const code = `console.error("x")`
    for (const file of [
      "scripts/tool.ts",
      "vite.config.ts",
      "src/a.test.ts",
      "src/__tests__/a.ts",
    ]) {
      const msgs = await lintSnippet(config, code, file)
      expectNoMessageForRule(msgs, RULE, `${file}: ${code}`)
    }
  })

  it("is on in every preset's src/ but an extension's", async () => {
    const code = `// eslint-disable-next-line no-console\nconsole.error("x")`
    for (const preset of [
      maishatuRecommended,
      uiRecommended,
      appsRecommended,
    ]) {
      const msgs = await lintSnippet(flat(preset), code, TS_FILE)
      expectMessageForRule(msgs, RULE, code)
    }
    const msgs = await lintSnippet(flat(extensionsRecommended), code, TS_FILE)
    expectNoMessageForRule(msgs, RULE, code)
  })

  it("yields to the mailbox's own setting when spread after it", async () => {
    const mailbox = [...flat(maishatuRecommended), ...logGuardConfig]
    const msgs = await lintSnippet(mailbox, REPORT, TS_FILE)
    expectNoMessageForRule(msgs, RULE, "the mailbox's report")
  })
})
