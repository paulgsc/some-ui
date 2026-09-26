import type { Question } from "@topik/lib/topik"
import { describe, expect, it } from "vitest"

import {
  buildFallbackOptions,
  buildTileBoard,
  excerptRevealsAnswer,
  gradeAssembly,
  gradeSelection,
  MAX_TILES,
  tokenize,
} from "."

const textQuestion = (
  answer: string,
  extra: Partial<Question> = {}
): Question => ({
  type: "text-input",
  korean: "",
  question: "Write it",
  acceptedAnswers: [answer],
  correctAnswer: answer,
  explanation: "",
  ...extra,
})

const POOL = ["오늘 날씨가 정말 좋네요.", "같이 산책할까요?"]

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

describe("buildTileBoard", () => {
  it("is deterministic for a seed and holds every target tile plus distractors", () => {
    const q = textQuestion("저는 학생이에요")
    const a = buildTileBoard(q, "t:0:1", POOL)
    const b = buildTileBoard(q, "t:0:1", POOL)
    expect(a).toEqual(b)
    expect(a!.target).toEqual(["저는", "학생이에요"])
    expect(a!.tiles).toHaveLength(4)
    expect(a!.tiles).toEqual(expect.arrayContaining(["저는", "학생이에요"]))
  })

  it("never shows the answer already in order", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const board = buildTileBoard(
        textQuestion("저는 학생이에요"),
        `s${seed}`,
        []
      )
      expect(board!.tiles.join(" ")).not.toBe("저는 학생이에요")
    }
  })

  it("draws syllable distractors for a syllable board, without duplicating target tiles", () => {
    const board = buildTileBoard(textQuestion("좋네요"), "k", POOL)!
    expect(board.joiner).toBe("")
    const extras = board.tiles.filter((tile) => !board.target.includes(tile))
    expect(extras).toHaveLength(2)
    for (const tile of extras) expect(tile).toMatch(/^[가-힯]$/)
  })

  it("returns null for answers it cannot tile or that would not fit", () => {
    expect(buildTileBoard(textQuestion("yes"), "k", POOL)).toBeNull()
    const long = Array.from({ length: MAX_TILES + 1 }, (_, i) => `w${i}`).join(
      " "
    )
    expect(buildTileBoard(textQuestion(long), "k", POOL)).toBeNull()
  })
})

describe("gradeAssembly", () => {
  it("accepts any accepted form, ignoring punctuation and case", () => {
    const q = textQuestion("I am a student.", {
      acceptedAnswers: ["I am a student", "I'm a student"],
    })
    expect(gradeAssembly(["i", "am", "a", "student"], q, " ")).toBe(true)
    expect(gradeAssembly(["am", "I", "a", "student"], q, " ")).toBe(false)
    expect(gradeAssembly([], q, " ")).toBe(false)
  })

  it("compares syllable boards without spacing", () => {
    expect(
      gradeAssembly(
        ["감", "사", "합", "니", "다"],
        textQuestion("감사합니다"),
        ""
      )
    ).toBe(true)
  })
})

describe("excerptRevealsAnswer", () => {
  it("flags an excerpt that contains any accepted answer, spacing aside", () => {
    const q = textQuestion("포장해 주세요")
    expect(excerptRevealsAnswer("아니요, 포장해 주세요.", q)).toBe(true)
    expect(excerptRevealsAnswer("포장해주세요", q)).toBe(true)
    expect(excerptRevealsAnswer("여기서 드시고 가세요?", q)).toBe(false)
    expect(excerptRevealsAnswer("", q)).toBe(false)
  })
})

describe("selection fallback", () => {
  it("offers the answer among sibling answers and grades by accepted form", () => {
    const q = textQuestion("yes")
    const options = buildFallbackOptions(q, "k", [
      q,
      textQuestion("no"),
      textQuestion("maybe"),
    ])
    expect(options).toHaveLength(3)
    expect(options).toContain("yes")
    expect(gradeSelection("Yes.", q)).toBe(true)
    expect(gradeSelection("no", q)).toBe(false)
  })
})
