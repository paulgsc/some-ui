import type { ReadAloudLine } from "@topik/lib/topik/read-aloud/content"
import {
  lensesOf,
  lensOutcome,
  lensWords,
  pickLens,
} from "@topik/lib/topik/read-aloud/lens"
import { describe, expect, it } from "vitest"

// 고양이가 소파에서 자요: who, where, the action; present.
const CAT: ReadAloudLine = {
  id: "cat-sofa",
  level: 1,
  korean: "고양이가 소파에서 자요.",
  english: "The cat sleeps on the sofa.",
  tense: "present",
  words: [
    { wordId: "goyangi", surface: "고양이가", stemEnd: 3, role: "subject" },
    { wordId: "sopa", surface: "소파에서", stemEnd: 2, role: "place" },
    { wordId: "jada", surface: "자요", stemEnd: 1, role: "action" },
  ],
}

// 내일 영화를 볼 거예요: the tense shows from 볼 on.
const MOVIE: ReadAloudLine = {
  id: "movie-tomorrow",
  level: 1,
  korean: "내일 영화를 볼 거예요.",
  english: "I'm going to watch a movie tomorrow.",
  tense: "future",
  words: [
    { wordId: "naeil", surface: "내일", stemEnd: 2, role: "time" },
    { wordId: "yeonghwa", surface: "영화를", stemEnd: 2, role: "object" },
    { wordId: "boda", surface: "볼", stemEnd: 1, role: "action" },
    { wordId: "geot", surface: "거예요", stemEnd: 1 },
  ],
}

describe("lensesOf", () => {
  it("asks each role one word plays, then the tense", () => {
    expect(lensesOf(CAT)).toEqual([
      { kind: "role", role: "subject", word: 0 },
      { kind: "role", role: "place", word: 1 },
      { kind: "role", role: "action", word: 2 },
      { kind: "tense", tense: "present", from: 2 },
    ])
  })

  it("never asks a role two words play: it would have two answers", () => {
    const twice: ReadAloudLine = {
      ...CAT,
      words: CAT.words.map((word) => ({ ...word, role: "action" as const })),
    }
    expect(lensesOf(twice)).toEqual([
      { kind: "tense", tense: "present", from: 2 },
    ])
  })

  it("shows the tense from the last predicate to the end", () => {
    expect(lensesOf(MOVIE).at(-1)).toEqual({
      kind: "tense",
      tense: "future",
      from: 2,
    })
    expect(lensWords({ kind: "tense", tense: "future", from: 2 }, 4)).toEqual([
      2, 3,
    ])
  })

  it("shows the tense on the last word when no predicate is marked", () => {
    const bare: ReadAloudLine = {
      ...CAT,
      words: CAT.words.map(({ role: _role, ...word }) => word),
    }
    expect(lensesOf(bare)).toEqual([
      { kind: "tense", tense: "present", from: 2 },
    ])
  })

  it("asks nothing of a line with neither roles nor a tense", () => {
    const { tense: _tense, ...untensed } = CAT
    const line = { ...untensed, words: [] }
    expect(lensesOf(line)).toEqual([])
    expect(pickLens(line, "seed")).toBeNull()
  })
})

describe("pickLens", () => {
  it("draws the same lens for the same seed, and each lens for some seed", () => {
    expect(pickLens(CAT, "set-1")).toEqual(pickLens(CAT, "set-1"))
    const drawn = new Set(
      Array.from({ length: 64 }, (_, n) =>
        JSON.stringify(pickLens(CAT, `set-${n}`))
      )
    )
    expect(drawn.size).toBe(lensesOf(CAT).length)
  })
})

describe("lensOutcome", () => {
  const place = { kind: "role", role: "place", word: 1 } as const
  const tense = { kind: "tense", tense: "present", from: 2 } as const

  it("finds the right word or tense, and misses another", () => {
    expect(lensOutcome(place, { kind: "word", word: 1 })).toBe("found")
    expect(lensOutcome(place, { kind: "word", word: 0 })).toBe("missed")
    expect(lensOutcome(tense, { kind: "tense", tense: "present" })).toBe(
      "found"
    )
    expect(lensOutcome(tense, { kind: "tense", tense: "past" })).toBe("missed")
  })

  it("counts no answer, or one of the wrong kind, as unanswered", () => {
    expect(lensOutcome(place, null)).toBe("unanswered")
    expect(lensOutcome(place, { kind: "tense", tense: "past" })).toBe(
      "unanswered"
    )
  })
})
