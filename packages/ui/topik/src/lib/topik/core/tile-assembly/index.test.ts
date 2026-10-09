import { describe, expect, it } from "vitest"

import { excerptRevealsAnswer, tokenize } from "."

describe("tokenize", () => {
  it("splits several words into words and one Hangul word into syllables", () => {
    expect(tokenize("저는 학생이에요.")).toEqual({
      tokens: ["저는", "학생이에요"],
      joiner: " ",
    })
    expect(tokenize("감사합니다")).toEqual({
      tokens: ["감", "사", "합", "니", "다"],
      joiner: "",
    })
  })

  it("refuses a single non-Hangul word and a single syllable", () => {
    expect(tokenize("hello")).toBeNull()
    expect(tokenize("네")).toBeNull()
  })
})

describe("excerptRevealsAnswer", () => {
  it("flags an excerpt that contains any accepted answer, spacing aside", () => {
    const accepted = ["포장해 주세요"]
    expect(excerptRevealsAnswer("아니요, 포장해 주세요.", accepted)).toBe(true)
    expect(excerptRevealsAnswer("포장해주세요", accepted)).toBe(true)
    expect(excerptRevealsAnswer("여기서 드시고 가세요?", accepted)).toBe(false)
    expect(excerptRevealsAnswer("", accepted)).toBe(false)
  })
})
