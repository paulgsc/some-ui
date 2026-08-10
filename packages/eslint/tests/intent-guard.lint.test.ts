/**
 * LAYER 2 — Lint-time integration tests for intent-guard/no-unbounded-intent.
 *
 * Purely syntactic (JSXAttribute/CallExpression/VariableDeclarator shape
 * checks, no type information needed) — a plain @typescript-eslint/parser
 * with `ecmaFeatures.jsx: true` and no `project`/`projectService` is enough
 * to parse the TSX snippets below. Same rationale as switch-lint.lint.test.ts.
 */

import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import { intentGuardPlugin } from "../src/configs/intent-guard.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
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

  it("fires on .mutate(...) inside a named handle* function referenced by onClick", async () => {
    const code = `
function Widget() {
  const handleDelete = () => {
    deleteSession.mutate(id)
  }
  return <button onClick={handleDelete}>Delete</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(
      msgs,
      RULE,
      ".mutate(...) inside a handle* function referenced by onClick"
    )
  })

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

  it("does NOT fire on a handler that calls useIntent's start", async () => {
    const code = `
function Widget() {
  const handleSave = () => {
    saveIntent.start(draft)
  }
  return <button onClick={handleSave}>Save</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a handler that calls start()")
  })

  it("does NOT fire on a handler that calls retry", async () => {
    const code = `
function Widget() {
  const handleRetry = () => {
    saveIntent.retry()
  }
  return <button onClick={handleRetry}>Retry</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a handler that calls retry()")
  })

  it("does NOT fire on a plain setState handler", async () => {
    const code = `
function Widget() {
  const handleToggle = () => {
    setOpen(true)
  }
  return <button onClick={handleToggle}>Open</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a plain setState handler")
  })

  it("does NOT fire on a navigate-only handler with no I/O", async () => {
    const code = `
function Widget() {
  const handleBack = () => {
    navigate({ to: "/sessions" })
  }
  return <button onClick={handleBack}>Back</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a navigate-only handler")
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

  it("does NOT fire when the call carries an intent-exempt comment", async () => {
    const code = `
function Widget() {
  const handleWarm = () => {
    // intent-exempt: fire-and-forget cache warm, not a user-facing intent
    void fetch("/api/warm")
  }
  return <button onClick={handleWarm}>Warm</button>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a call with an intent-exempt comment")
  })

  it("does NOT fire on a custom-configured allowedCallees entry", async () => {
    const code = `
function Widget() {
  const handleSave = () => {
    safeMutate(draft)
  }
  return <button onClick={handleSave}>Save</button>
}
`
    const msgs = await lintSnippet(
      makeConfig({
        effectCallees: ["safeMutate"],
        allowedCallees: ["safeMutate"],
      }),
      code,
      TSX_FILE
    )
    expectNoMessageForRule(msgs, RULE, "a call allowed via allowedCallees")
  })

  it("fires on a configured effectCallees member call", async () => {
    const code = `
function Widget() {
  const handleTrack = () => {
    analytics.track("clicked")
  }
  return <button onClick={handleTrack}>Go</button>
}
`
    const msgs = await lintSnippet(
      makeConfig({ effectCallees: ["track"] }),
      code,
      TSX_FILE
    )
    expectMessageForRule(msgs, RULE, "a configured effectCallees member call")
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
})
