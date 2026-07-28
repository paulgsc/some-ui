import { buildDisplayMap } from "@leetype/lib/leetype/leetype-wasm-loader"
import { describe, expect, it, vi } from "vitest"

import {
  codeToUnits,
  deriveCursorDisplayIndex,
  deriveDisplayMap,
  sliceUserUnits,
} from "."

vi.mock("@leetype/lib/leetype/leetype-wasm-loader", () => ({
  buildDisplayMap: vi.fn(),
}))

describe("codeToUnits", () => {
  it("maps every character to a char-kind canonical unit", () => {
    expect(codeToUnits("ab")).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "b" },
    ])
  })

  it("preserves multi-codepoint characters as single units", () => {
    expect(codeToUnits("a🙂")).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "🙂" },
    ])
  })

  it("returns an empty array for empty input", () => {
    expect(codeToUnits("")).toEqual([])
  })
})

describe("sliceUserUnits", () => {
  const target = codeToUnits("abcde")

  it("slices the first N units", () => {
    expect(sliceUserUnits(target, 3)).toEqual(target.slice(0, 3))
  })

  it("returns an empty array when typedChars is 0", () => {
    expect(sliceUserUnits(target, 0)).toEqual([])
  })

  it("clamps to the full array when typedChars exceeds its length", () => {
    expect(sliceUserUnits(target, 100)).toEqual(target)
  })

  it("mirrors Array.prototype.slice's end-relative semantics for negative typedChars", () => {
    // slice(0, -1) trims the last element rather than yielding an empty
    // array — pinning this so a future rewrite (e.g. to .at()-based
    // bounds-checking) doesn't silently change negative-input behavior.
    expect(sliceUserUnits(target, -1)).toEqual(target.slice(0, -1))
    expect(sliceUserUnits(target, -1)).toHaveLength(target.length - 1)
  })
})

describe("deriveCursorDisplayIndex", () => {
  it("returns the raw input's character count", () => {
    expect(deriveCursorDisplayIndex("func")).toBe(4)
  })

  it("returns 0 for empty input", () => {
    expect(deriveCursorDisplayIndex("")).toBe(0)
  })

  it("counts by code point, not UTF-16 code unit, for astral characters", () => {
    expect(deriveCursorDisplayIndex("a🙂b")).toBe(3)
  })
})

describe("deriveDisplayMap", () => {
  it("short-circuits to an empty array for empty input without calling wasm", () => {
    expect(deriveDisplayMap("")).toEqual([])
    expect(buildDisplayMap).not.toHaveBeenCalled()
  })

  it("delegates non-empty input to buildDisplayMap", () => {
    vi.mocked(buildDisplayMap).mockReturnValue(new Uint32Array([2, 1, 0]))
    expect(deriveDisplayMap("abc")).toEqual([2, 1, 0])
    expect(buildDisplayMap).toHaveBeenCalledWith("abc")
  })
})
