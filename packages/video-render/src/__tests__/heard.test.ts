import { isOrdinal, tokenized } from "@video-render/heard"
import { describe, expect, it } from "vitest"

const words = (text: string): Array<string> =>
  tokenized(text.split(/\s+/)).map((token) => token.word)

describe("tokenized", () => {
  it("compares words with case, punctuation, apostrophes and a plural's s aside", () => {
    expect(words("The model's picks, 1,000 ... this")).toEqual([
      "the",
      "model",
      "pick",
      "1000",
      "this",
    ])
    expect(words("don’t don't")).toEqual(["dont", "dont"])
  })

  it("reads a number however it is written", () => {
    const spoken: ReadonlyArray<[string, string]> = [
      ["21 days", "twenty-one days"],
      ["21 days", "twenty one days"],
      ["200 people", "two hundred people"],
      ["2,500 words", "two thousand five hundred words"],
      ["120 people", "one hundred and twenty people"],
      ["3.5 stars", "three point five stars"],
      ["the 3rd pick", "the third pick"],
      ["the 21st pick", "the twenty-first pick"],
      ["-5 degrees", "minus five degrees"],
      ["2 million users", "two million users"],
      ["2.5 million users", "two point five million users"],
      ["6½ wins", "six and a half wins"],
      ["6½ wins", "6 and a half wins"],
      ["½ win", "0.5 win"],
    ]
    for (const [written, said] of spoken)
      expect(words(said), said).toEqual(words(written))
    expect(words("twenty twenty and one two then thirty seconds")).toEqual([
      "20",
      "20",
      "and",
      "1",
      "2",
      "then",
      "30",
      "second",
    ])
  })

  it("tells an ordinal from a cardinal", () => {
    for (const word of ["first", "third", "eleventh", "twentieth", "21st"])
      expect(isOrdinal(word), word).toBe(true)
    for (const word of ["second", "eleven", "21", "fifth-wheel"])
      expect(isOrdinal(word), word).toBe(false)
  })

  it("keeps where each token came from in the raw words", () => {
    expect(tokenized(["two", "hundred", "units"])).toEqual([
      { word: "200", first: 0, last: 1 },
      { word: "unit", first: 2, last: 2 },
    ])
  })
})
