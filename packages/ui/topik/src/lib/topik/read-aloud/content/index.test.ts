import type { ParsedDeck } from "@topik/lib/topik/read-aloud/content"
import { parseReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import { describe, expect, it } from "vitest"

type RawWord = { id: string; lemma: string; gloss: string }
type RawLine = {
  id: string
  level: number
  korean: string
  english: string
  words: Array<Record<string, unknown>>
}

const word = (id: string, lemma: string): RawWord => ({ id, lemma, gloss: id })

/** The line every occurrence test varies: "One cup, please." */
const ONE_CUP: RawLine = {
  id: "one-cup",
  level: 1,
  korean: "한 잔 주세요.",
  english: "One cup, please.",
  words: [
    { wordId: "hana", surface: "한", stemEnd: 1 },
    { wordId: "jan", surface: "잔", stemEnd: 1 },
    { wordId: "juda", surface: "주세요", stemEnd: 1 },
  ],
}

const HAN = ONE_CUP.words[0] ?? {}
const JAN = ONE_CUP.words[1] ?? {}

const deck = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  schemaVersion: 1,
  id: "test-deck",
  title: "Test deck",
  words: [word("hana", "하나"), word("juda", "주다"), word("jan", "잔")],
  lines: [ONE_CUP],
  ...overrides,
})

/** A deck of the three test words and one variant of ONE_CUP. */
const withOccurrences = (
  words: Array<Record<string, unknown>>
): Record<string, unknown> => deck({ lines: [{ ...ONE_CUP, words }] })

const parsedOrThrow = (raw: unknown): Extract<ParsedDeck, { ok: true }> => {
  const result = parseReadAloudDeck(raw)
  if (!result.ok) throw new Error(result.error)
  return result
}

describe("parseReadAloudDeck", () => {
  it("accepts a well-formed deck with no findings", () => {
    const { deck: parsed, findings } = parsedOrThrow(deck())
    expect(findings).toEqual([])
    expect(parsed.words.map((w) => w.id)).toEqual(["hana", "juda", "jan"])
    expect(parsed.lines[0]?.words).toHaveLength(3)
  })

  it("fails only when the outer shape is wrong", () => {
    expect(parseReadAloudDeck(deck({ schemaVersion: 2 })).ok).toBe(false)
    expect(parseReadAloudDeck(null).ok).toBe(false)
  })

  it("drops a malformed word and keeps the rest", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      deck({
        words: [
          word("hana", "하나"),
          word("juda", "주다"),
          { id: "Bad Id", lemma: "잔" },
          word("jan", "잔"),
        ],
      })
    )
    expect(parsed.words.map((w) => w.id)).toEqual(["hana", "juda", "jan"])
    expect(findings.map((f) => f.kind)).toEqual(["word-malformed"])
  })

  it("keeps the first of two words sharing an id (Thm. 1.1)", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      deck({
        words: [
          word("hana", "하나"),
          word("juda", "주다"),
          word("jan", "잔"),
          word("jan", "잔잔"),
        ],
      })
    )
    expect(parsed.words.filter((w) => w.id === "jan")).toEqual([
      word("jan", "잔"),
    ])
    expect(findings.map((f) => f.kind)).toEqual(["word-duplicate"])
  })

  it("drops an occurrence naming a word the deck lacks", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withOccurrences([
        ...ONE_CUP.words,
        { wordId: "mwo", surface: "요", stemEnd: 1 },
      ])
    )
    expect(parsed.lines[0]?.words).toHaveLength(3)
    expect(findings.map((f) => f.kind)).toEqual(["occurrence-unknown-word"])
  })

  it("requires occurrences in reading order, and drops the line they leave incomplete", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withOccurrences([
        HAN,
        { wordId: "juda", surface: "주세요", stemEnd: 1 },
        JAN,
      ])
    )
    expect(findings.map((f) => f.kind)).toEqual([
      "occurrence-not-in-line",
      "line-incomplete",
    ])
    expect(parsed.lines).toEqual([])
  })

  it("matches only whole written words, never part of one", () => {
    const { findings } = parsedOrThrow(
      withOccurrences([
        HAN,
        JAN,
        { wordId: "juda", surface: "세요", stemEnd: 1 },
      ])
    )
    expect(findings.map((f) => f.kind)).toEqual([
      "occurrence-not-in-line",
      "line-incomplete",
    ])
  })

  it("drops a line that leaves a written word unlisted", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withOccurrences([{ wordId: "juda", surface: "주세요", stemEnd: 1 }])
    )
    expect(findings).toEqual([
      expect.objectContaining({
        kind: "line-incomplete",
        where: "one-cup",
        detail: expect.stringContaining('"한", "잔"'),
      }),
    ])
    expect(parsed.lines).toEqual([])
  })

  it("drops an occurrence whose stem runs past its syllables", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withOccurrences([
        HAN,
        { wordId: "jan", surface: "잔", stemEnd: 2 },
        { wordId: "juda", surface: "주세요", stemEnd: 1 },
      ])
    )
    expect(findings.map((f) => f.kind)).toEqual([
      "occurrence-stem-out-of-range",
      "line-incomplete",
    ])
    expect(parsed.lines).toEqual([])
  })

  it("drops a line with no written words", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      deck({ lines: [{ ...ONE_CUP, korean: "4,500!", words: [] }] })
    )
    expect(findings.map((f) => f.kind)).toEqual(["line-without-words"])
    expect(parsed.lines).toEqual([])
  })

  it("keeps an occurrence without a misaligned pronunciation (Cor. 4.6 (iv))", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withOccurrences([
        HAN,
        JAN,
        {
          wordId: "juda",
          surface: "주세요",
          stemEnd: 1,
          pronunciation: "주세",
        },
      ])
    )
    expect(parsed.lines[0]?.words[2]).toEqual({
      wordId: "juda",
      surface: "주세요",
      stemEnd: 1,
    })
    expect(findings.map((f) => f.kind)).toEqual(["pronunciation-misaligned"])
  })

  it("omits a pronunciation that only repeats the spelling", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withOccurrences([
        HAN,
        { wordId: "jan", surface: "잔", stemEnd: 1, pronunciation: "잔" },
        ONE_CUP.words[2] ?? {},
      ])
    )
    expect(parsed.lines[0]?.words[1]).not.toHaveProperty("pronunciation")
    expect(findings.map((f) => f.kind)).toEqual(["pronunciation-redundant"])
  })

  it("keeps an aligned pronunciation", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      deck({
        words: [word("won", "원")],
        lines: [
          {
            id: "price",
            level: 1,
            korean: "원입니다.",
            english: "It's won.",
            words: [
              {
                wordId: "won",
                surface: "원입니다",
                stemEnd: 1,
                pronunciation: "워님니다",
              },
            ],
          },
        ],
      })
    )
    expect(findings).toEqual([])
    expect(parsed.lines[0]?.words[0]?.pronunciation).toBe("워님니다")
  })

  it("drops a malformed or duplicate line and keeps the rest", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      deck({ lines: [ONE_CUP, { ...ONE_CUP, level: 4 }, ONE_CUP] })
    )
    expect(parsed.lines).toHaveLength(1)
    expect(findings.map((f) => f.kind)).toEqual([
      "line-malformed",
      "line-duplicate",
    ])
  })
})
