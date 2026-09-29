import { describe, expect, it } from "vitest"

import {
  buildTileBoard,
  excerptRevealsAnswer,
  gradeAssembly,
  MAX_TILES,
  tokenize,
} from "."

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
    const a = buildTileBoard(["저는 학생이에요"], "t:0:1", POOL)
    const b = buildTileBoard(["저는 학생이에요"], "t:0:1", POOL)
    expect(a).toEqual(b)
    expect(a!.target).toEqual(["저는", "학생이에요"])
    expect(a!.tiles).toHaveLength(4)
    expect(a!.tiles).toEqual(expect.arrayContaining(["저는", "학생이에요"]))
  })

  it("never shows the answer already in order", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const board = buildTileBoard(["저는 학생이에요"], `s${seed}`, [])
      expect(board!.tiles.join(" ")).not.toBe("저는 학생이에요")
    }
  })

  it("draws syllable distractors for a syllable board, without duplicating target tiles", () => {
    const board = buildTileBoard(["좋네요"], "k", POOL)!
    expect(board.joiner).toBe("")
    const extras = board.tiles.filter((tile) => !board.target.includes(tile))
    expect(extras).toHaveLength(2)
    for (const tile of extras) expect(tile).toMatch(/^[가-힯]$/)
  })

  it("prefers authored foils over pieces of the conversation", () => {
    const board = buildTileBoard(["카드로 했어요"], "k", POOL, {
      distractors: ["할게요", "했어요", "카드를"],
    })!
    const extras = board.tiles.filter((tile) => !board.target.includes(tile))
    // "했어요" is part of the answer, so only the two genuine foils remain.
    expect(extras.sort()).toEqual(["카드를", "할게요"])
  })

  it("returns null for answers it cannot tile or that would not fit", () => {
    expect(buildTileBoard(["yes"], "k", POOL)).toBeNull()
    expect(buildTileBoard([], "k", POOL)).toBeNull()
    const long = Array.from({ length: MAX_TILES + 1 }, (_, i) => `w${i}`).join(
      " "
    )
    expect(buildTileBoard([long], "k", POOL)).toBeNull()
  })
})

describe("gradeAssembly", () => {
  it("accepts any accepted form, ignoring punctuation and case", () => {
    const accepted = ["I am a student.", "I'm a student"]
    expect(gradeAssembly(["i", "am", "a", "student"], accepted, " ")).toBe(true)
    expect(gradeAssembly(["am", "I", "a", "student"], accepted, " ")).toBe(
      false
    )
    expect(gradeAssembly([], accepted, " ")).toBe(false)
  })

  it("compares syllable boards without spacing", () => {
    expect(
      gradeAssembly(["감", "사", "합", "니", "다"], ["감사합니다"], "")
    ).toBe(true)
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
