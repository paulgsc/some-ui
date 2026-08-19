import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { narrow } from "./rationale-match"

/**
 * Routed through a helper taking a variable, not a string literal directly
 * inside `new URL(...)` — the same shape `prompt-panel/index.test.tsx` uses
 * and for the same reason: a literal there triggers Vite's static
 * import.meta.url asset-URL transform, which resolves to a dev-server
 * `http://localhost` URL in this environment instead of a real file path.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf-8"
  )
}

describe("narrow", () => {
  const candidates = [
    "borrowing avoids the copy",
    "borrowing avoids the allocation",
    "the iterator adaptor never materializes a second Vec",
  ]

  it("returns every candidate live and nothing completed for an empty typed string", () => {
    const state = narrow(candidates, "")
    expect(state.live).toEqual(candidates)
    expect(state.completed).toBeNull()
  })

  it("narrows to a single surviving candidate as characters diverge the rest out", () => {
    const state = narrow(candidates, "the iterator")
    expect(state.live).toEqual([candidates[2]])
    expect(state.completed).toBeNull()
  })

  it("completes the instant typed exactly equals the one live candidate", () => {
    const state = narrow(candidates, candidates[2] ?? "")
    expect(state.live).toEqual([candidates[2]])
    expect(state.completed).toBe(candidates[2])
  })

  it("eliminates the live set to zero on a typo inconsistent with every candidate", () => {
    const state = narrow(candidates, "borrowing avoids the reticulation")
    expect(state.live).toEqual([])
    expect(state.completed).toBeNull()
  })

  it("is case-sensitive and does not trim, the same posture the engine holds", () => {
    expect(narrow(["Borrowing"], "borrowing").live).toEqual([])
    expect(narrow(["borrowing"], " borrowing").live).toEqual([])
    expect(narrow(["borrowing"], "borrowing ").live).toEqual([])
    expect(narrow(["borrowing "], "borrowing ").completed).toBe("borrowing ")
  })

  it("restores previously-eliminated candidates when typed shortens — backspace is free", () => {
    // No incremental state inside narrow: a shorter `typed` is just a
    // smaller input, not a separate undo path.
    const narrowed = narrow(candidates, "borrowing avoids the a")
    expect(narrowed.live).toEqual([candidates[1]])

    const backspaced = narrow(candidates, "borrowing avoids the ")
    expect(backspaced.live).toEqual([candidates[0], candidates[1]])
  })

  it("reproduces the ambiguous silent completion a shared-prefix pair causes — the corpus lint's whole reason to exist", () => {
    // `lib/leetype/exercises/corpus-lint.ts`'s no-shared-prefix check
    // (LTY-WHY W2) rejects exactly this pair of candidates at author time.
    // This test proves what happens if that check were ever bypassed:
    // typing "ok" completes on the shorter candidate while "okay" is still
    // live and has not been ruled out — a completion the player has no way
    // to tell apart from a real, unambiguous one.
    const sharedPrefixCandidates = ["ok", "okay"]
    const state = narrow(sharedPrefixCandidates, "ok")
    expect(state.completed).toBe("ok")
    expect(state.live).toContain("okay")
  })
})

describe("rationale-match.ts stays engine-free (LTY-WHY W3, #1103)", () => {
  it("imports nothing from the wasm hook, the wasm package, or types/leetype's engine vocabulary", () => {
    const source = sourceOf("./rationale-match.ts")
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    const forbidden = [
      "use-typing-game-wasm",
      "@some-ui/leetype-wasm",
      "leetype-wasm-loader",
      "@leetype/types/leetype",
    ]
    for (const token of forbidden) {
      expect(codeOnly.includes(token)).toBe(false)
    }
    // Matches both a static `import ... from "..."` and a dynamic
    // `import("...")` — a literal `"import "` check alone misses the
    // latter, since there is no space between `import` and its `(`.
    expect(codeOnly).not.toMatch(/\bimport\s*[("]/)
  })
})
