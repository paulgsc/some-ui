import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The panel's own doc comment states the invariant in prose: "It imports
 * nothing from the typing engine. No caret, no slots, no WPM." There is no
 * existing eslint import-boundary rule that can express this (checked: no
 * `no-restricted-imports`/path-boundary config scopes this package), so this
 * is the test the doc comment asks for.
 *
 * A source-text check rather than a module-graph one on purpose: importing
 * `./index` here would need the WASM engine ready before the assertion even
 * runs, for a question ("does this file's source mention the engine's
 * modules") that grep answers without paying that cost.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf-8"
  )
}

describe("PromptPanel stays outside the typing engine", () => {
  it("imports nothing from hooks/leetype or types/leetype", () => {
    const source = sourceOf("./index.tsx")
    expect(source).not.toMatch(/@leetype\/hooks\/leetype/)
    expect(source).not.toMatch(/@leetype\/types\/leetype/)
  })

  it("its row-flattening helper is equally engine-free", () => {
    const source = sourceOf("./rows.ts")
    expect(source).not.toMatch(/@leetype\/hooks\/leetype/)
    expect(source).not.toMatch(/@leetype\/types\/leetype/)
  })
})
