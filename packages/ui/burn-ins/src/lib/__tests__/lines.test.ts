/** @vitest-environment node */
import { byChars, charsOf } from "@burn-ins/lib/captions/__tests__/word"
import { breakLines } from "@burn-ins/lib/lines"
import { describe, expect, it } from "vitest"

const w = (sentence: string): Array<{ text: string }> =>
  sentence.split(" ").map((text) => ({ text }))
const texts = (
  rows: ReadonlyArray<ReadonlyArray<{ text: string }>>
): Array<string> => rows.map((row) => row.map((x) => x.text).join(" "))

describe("line breaking", () => {
  it("keeps words that fit on one line", () => {
    expect(texts(breakLines(w("third and eleven"), byChars(16)))).toEqual([
      "third and eleven",
    ])
    expect(breakLines([], byChars(10))).toEqual([])
  })

  it("splits into two lines whose longer line is shortest", () => {
    // Greedy filling would give "Purdy steps up, buys" / "one more".
    expect(
      texts(breakLines(w("Purdy steps up, buys one more"), byChars(20)))
    ).toEqual(["Purdy steps up,", "buys one more"])
  })

  it("never makes a line longer than the limit when a split exists", () => {
    const words = w("Kittle shakes the first tackle and carries")
    for (let limit = 22; limit <= 42; limit++) {
      for (const row of breakLines(words, byChars(limit)))
        expect(charsOf(row)).toBeLessThanOrEqual(limit)
    }
  })

  it("falls back to filling lines when two will not do, a long word alone", () => {
    expect(texts(breakLines(w("a b c d e f"), byChars(3)))).toEqual([
      "a b",
      "c d",
      "e f",
    ])
    expect(texts(breakLines(w("go Niners"), byChars(4)))).toEqual([
      "go",
      "Niners",
    ])
  })
})
