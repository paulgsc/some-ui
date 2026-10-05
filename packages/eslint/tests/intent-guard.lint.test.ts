/**
 * Lint-time integration tests for intent-guard/no-unbounded-intent. The rule
 * is syntactic, so a plain @typescript-eslint/parser with JSX parses the
 * snippets.
 */

import { intentGuardPlugin } from "@eslint/configs/intent-guard.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  expectSnippet,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TSX_FILE = "src/example.tsx"
const RULE = "intent-guard/no-unbounded-intent"

function makeConfig(options?: Record<string, unknown>): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "intent-guard": intentGuardPlugin },
      rules: {
        [RULE]: options ? ["error", options] : "error",
      },
    },
  ])
}

/** A component whose button's onClick is `name`, an arrow running `body`. */
function handlerWidget(name: string, body: string, label: string): string {
  return `
function Widget() {
  const ${name} = () => {
    ${body}
  }
  return <button onClick={${name}}>${label}</button>
}
`
}

describe("lint: intent-guard/no-unbounded-intent", () => {
  it("fires on a bare fetch() inside an inline onClick", async () => {
    const code = `
function Widget() {
  return <button onClick={() => { void fetch("/api/x") }}>Go</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "fetch() inside inline onClick")
  })

  it.each<
    readonly [string, string, Record<string, unknown> | undefined, boolean]
  >([
    [
      "fires on .mutate(...) inside a named handle* function referenced by onClick",
      handlerWidget("handleDelete", "deleteSession.mutate(id)", "Delete"),
      undefined,
      true,
    ],
    [
      "does NOT fire on a handler that calls useIntent's start",
      handlerWidget("handleSave", "saveIntent.start(draft)", "Save"),
      undefined,
      false,
    ],
    [
      "does NOT fire on a handler that calls retry",
      handlerWidget("handleRetry", "saveIntent.retry()", "Retry"),
      undefined,
      false,
    ],
    [
      "does NOT fire on a plain setState handler",
      handlerWidget("handleToggle", "setOpen(true)", "Open"),
      undefined,
      false,
    ],
    [
      "does NOT fire on a navigate-only handler with no I/O",
      handlerWidget("handleBack", 'navigate({ to: "/sessions" })', "Back"),
      undefined,
      false,
    ],
    [
      "does NOT fire when the call carries an intent-exempt comment",
      handlerWidget(
        "handleWarm",
        [
          "// intent-exempt: fire-and-forget cache warm, not a user-facing intent",
          'void fetch("/api/warm")',
        ].join("\n    "),
        "Warm"
      ),
      undefined,
      false,
    ],
    [
      "does NOT fire on a custom-configured allowedCallees entry",
      handlerWidget("handleSave", "safeMutate(draft)", "Save"),
      {
        effectCallees: ["safeMutate"],
        allowedCallees: ["safeMutate"],
      },
      false,
    ],
    [
      "fires on a configured effectCallees member call",
      handlerWidget("handleTrack", 'analytics.track("clicked")', "Go"),
      { effectCallees: ["track"] },
      true,
    ],
    [
      "fires when the effect is nested inside a closure within the handler (forEach)",
      handlerWidget(
        "handleDeleteMany",
        "items.forEach(() => { deleteSession.mutate(item.id) })",
        "Delete all"
      ),
      undefined,
      true,
    ],
  ])("%s", (title, code, options, fires) =>
    expectSnippet(makeConfig(options), code, TSX_FILE, RULE, fires, title)
  )

  it("fires on .mutateAsync(...) inside a handle* function declared with `function`", async () => {
    const code = `
function Widget() {
  function handleSave() {
    saveSession.mutateAsync(draft)
  }
  return <button onClick={handleSave}>Save</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(
      msgs,
      RULE,
      ".mutateAsync(...) inside a `function handleSave` referenced by onClick"
    )
  })

  it("does NOT fire on fetch() outside any JSX event handler", async () => {
    const code = `
function loadEverything() {
  void fetch("/api/warm")
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "fetch() outside a JSX event handler")
  })

  it("does NOT fire on a custom component's onPress handler that renders quietly", async () => {
    const code = `
function Widget() {
  const handleToggleSelected = (id) => {
    onToggleSelected(id)
  }
  return <input onChange={() => handleToggleSelected(id)} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a handler with no effect call at all")
  })

  it("still fires under a custom component's onPress prop, not just native DOM props", async () => {
    const code = `
function Widget() {
  const handleSave = () => {
    saveSession.mutate(draft)
  }
  return <IntentButton onPress={handleSave} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.some((m) => m.ruleId === RULE)).toBe(true)
  })

  // The nearest enclosing function is not always the producer: it can wrap
  // the effect in another closure (forEach, then, an IIFE).
  it("fires when the effect is nested inside a .then() within an inline handler", async () => {
    const code = `
function Widget() {
  return (
    <button onClick={() => {
      checkThing().then(() => { session.mutate(draft) })
    }}>Go</button>
  )
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(
      msgs,
      RULE,
      "an effect nested inside a .then() callback within an inline handler"
    )
  })

  // Two components' same-named handle* functions must not be conflated by a
  // file-wide name lookup, in either direction.
  it("fires on the dirty handleSave and not the unrelated clean handleSave sharing its name", async () => {
    const code = `
function Dirty() {
  const handleSave = () => {
    saveSession.mutate(draft)
  }
  return <button onClick={handleSave}>Save dirty</button>
}

function Clean() {
  const handleSave = () => {
    setSaved(true)
  }
  return <button onClick={handleSave}>Save clean</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "the dirty handleSave's own mutate() call")
    expect(msgs.filter((m) => m.ruleId === RULE)).toHaveLength(1)
  })

  it("fires on the dirty handleSave even when its own clean namesake is declared later in the file", async () => {
    const code = `
function Clean() {
  const handleSave = () => {
    setSaved(true)
  }
  return <button onClick={handleSave}>Save clean</button>
}

function Dirty() {
  const handleSave = () => {
    saveSession.mutate(draft)
  }
  return <button onClick={handleSave}>Save dirty</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(
      msgs,
      RULE,
      "the dirty handleSave's own mutate() call, declared after its clean namesake"
    )
    expect(msgs.filter((m) => m.ruleId === RULE)).toHaveLength(1)
  })
})
