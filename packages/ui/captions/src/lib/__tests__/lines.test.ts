/** @vitest-environment node */
import { breakLines, charsOf } from "@captions/lib/lines"
import { describe, expect, it } from "vitest"

const w = (sentence: string): Array<{ text: string }> =>
  sentence.split(" ").map((text) => ({ text }))
const texts = (
  rows: ReadonlyArray<ReadonlyArray<{ text: string }>>
): Array<string> => rows.map((row) => row.map((x) => x.text).join(" "))

describe("line breaking", () => {
  it("counts every character and one space between words", () => {
    expect(charsOf(w("third and eleven"))).toBe(16)
    expect(charsOf([])).toBe(0)
  })

  it("keeps words that fit on one line", () => {
    expect(texts(breakLines(w("third and eleven"), 16))).toEqual([
      "third and eleven",
    ])
    expect(breakLines([], 10)).toEqual([])
  })

  it("splits into two lines whose longer line is shortest", () => {
    // Greedy filling would give "Purdy steps up, buys" / "one more".
    expect(texts(breakLines(w("Purdy steps up, buys one more"), 20))).toEqual([
      "Purdy steps up,",
      "buys one more",
    ])
  })

  it("never makes a line longer than the limit when a split exists", () => {
    const words = w("Kittle shakes the first tackle and carries")
    for (let limit = 22; limit <= 42; limit++) {
      for (const row of breakLines(words, limit))
        expect(charsOf(row)).toBeLessThanOrEqual(limit)
    }
  })

  it("falls back to filling lines when two will not do, a long word alone", () => {
    expect(texts(breakLines(w("a b c d e f"), 3))).toEqual([
      "a b",
      "c d",
      "e f",
    ])
    expect(texts(breakLines(w("go Niners"), 4))).toEqual(["go", "Niners"])
  })
})
