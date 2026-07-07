import { describe, expect, it, vi } from "vitest"
import { buildDisplayBuffer } from "./build-display-buffer"

vi.mock("./leetype-wasm-loader", () => ({
  buildDisplayMap: vi.fn(),
}))

import { buildDisplayMap } from "./leetype-wasm-loader"

describe("buildDisplayBuffer", () => {
  it("zips each character with its unit index on the happy path", () => {
    vi.mocked(buildDisplayMap).mockReturnValue(new Uint32Array([0, 1, 2]))

    expect(buildDisplayBuffer("abc")).toEqual([
      { char: "a", unitIndex: 0, displayIndex: 0 },
      { char: "b", unitIndex: 1, displayIndex: 1 },
      { char: "c", unitIndex: 2, displayIndex: 2 },
    ])
  })

  it("pads a shorter map with its last index to match the char count", () => {
    // wasm returned fewer unit indices than characters
    vi.mocked(buildDisplayMap).mockReturnValue(new Uint32Array([0, 1]))

    expect(buildDisplayBuffer("abcd")).toEqual([
      { char: "a", unitIndex: 0, displayIndex: 0 },
      { char: "b", unitIndex: 1, displayIndex: 1 },
      { char: "c", unitIndex: 1, displayIndex: 2 },
      { char: "d", unitIndex: 1, displayIndex: 3 },
    ])
  })

  it("pads with 0 when the map is empty", () => {
    vi.mocked(buildDisplayMap).mockReturnValue(new Uint32Array([]))

    expect(buildDisplayBuffer("ab")).toEqual([
      { char: "a", unitIndex: 0, displayIndex: 0 },
      { char: "b", unitIndex: 0, displayIndex: 1 },
    ])
  })

  it("preserves multi-codepoint characters as single display units", () => {
    const code = "a🙂b"
    // Array.from(code) === ["a", "🙂", "b"] — 3 grapheme-safe entries even
    // though "🙂" spans 2 UTF-16 code units.
    vi.mocked(buildDisplayMap).mockReturnValue(new Uint32Array([0, 1, 2]))

    const result = buildDisplayBuffer(code)
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.char)).toEqual(["a", "🙂", "b"])
  })
})
