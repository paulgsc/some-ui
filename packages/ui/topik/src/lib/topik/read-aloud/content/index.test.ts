import type { ParsedDeck } from "@topik/lib/topik/read-aloud/content"
import {
  parseReadAloudDeck,
  readAloudLevelFor,
} from "@topik/lib/topik/read-aloud/content"
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

  it("keeps a known role and tense", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      deck({
        lines: [
          {
            ...ONE_CUP,
            tense: "present",
            words: [HAN, JAN, { ...ONE_CUP.words[2], role: "action" }],
          },
        ],
      })
    )
    expect(findings).toEqual([])
    expect(parsed.lines[0]?.tense).toBe("present")
    expect(parsed.lines[0]?.words[2]?.role).toBe("action")
  })

  it("keeps the occurrence and the line without an unknown role or tense", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      deck({
        lines: [
          {
            ...ONE_CUP,
            tense: 3,
            words: [HAN, JAN, { ...ONE_CUP.words[2], role: "verb" }],
          },
        ],
      })
    )
    expect(findings.map((f) => f.kind)).toEqual([
      "role-unknown",
      "tense-unknown",
    ])
    expect(parsed.lines[0]).not.toHaveProperty("tense")
    expect(parsed.lines[0]?.words[2]).toEqual(ONE_CUP.words[2])
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

describe("parseReadAloudDeck, a line's lens (Def. 4.9)", () => {
  const SITUATIONS = {
    options: ["Ordering at a café", "Asking the time", "Saying goodbye"],
    intended: 0,
  }
  // 주아요: -아요 after a stem whose last vowel is ㅜ.
  const MISFORM = {
    word: 2,
    surface: "주아요",
    mistake: "vowel-harmony",
    instead: "x",
    decides: [1],
    cueDecides: ["드릴까요"],
  }
  const LENS = {
    cue: { korean: "뭐 드릴까요?" },
    misforms: [MISFORM],
    situations: SITUATIONS,
  }
  const withLens = (lens: unknown): Record<string, unknown> =>
    deck({ lines: [{ ...ONE_CUP, lens }] })

  it("keeps a well-formed lens, the cue audible unless said otherwise", () => {
    const { deck: parsed, findings } = parsedOrThrow(withLens(LENS))
    expect(findings).toEqual([])
    expect(parsed.lines[0]?.lens).toEqual({
      ...LENS,
      cue: { korean: "뭐 드릴까요?", hearable: true },
    })
  })

  it("drops each malformed part and keeps the rest", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withLens({
        cue: { korean: "" },
        misforms: [
          { ...MISFORM, word: 7 },
          { ...MISFORM, surface: "주세요" },
          { ...MISFORM, mistake: "no-such-mistake" },
          { ...MISFORM, surface: "줘요 " },
          { ...MISFORM, decides: [2] },
          { ...MISFORM, cueDecides: ["커피"] },
          { word: 2, surface: "주아요", mistake: "vowel-harmony" },
          { word: 2, surface: "주아요", mistake: "eu-kept" },
        ],
        situations: { ...SITUATIONS, options: ["a", "a", "b"] },
      })
    )
    expect(parsed.lines[0]?.lens).toEqual({
      misforms: [
        {
          word: 2,
          surface: "주아요",
          mistake: "vowel-harmony",
          decides: [],
          cueDecides: [],
        },
      ],
    })
    expect(findings.map((f) => f.kind)).toEqual([
      "lens-malformed",
      "misform-malformed",
      "misform-malformed",
      "misform-unknown-mistake",
      "misform-malformed",
      "misform-malformed",
      "misform-malformed",
      "misform-malformed",
      "lens-malformed",
    ])
    expect(new Set(findings.map((f) => f.where))).toEqual(
      new Set(["one-cup/lens"])
    )
  })

  it("indexes the authored words, past an occurrence that was dropped", () => {
    const stray = { wordId: "nope", surface: "잔", stemEnd: 1 }
    const misform = { ...MISFORM, word: 3, decides: [2], cueDecides: [] }
    const { deck: parsed, findings } = parsedOrThrow(
      deck({
        lines: [
          {
            ...ONE_CUP,
            words: [stray, ...ONE_CUP.words],
            lens: {
              misforms: [
                misform,
                { ...MISFORM, surface: "줘아요", word: 3, decides: [0] },
                misform,
              ],
            },
          },
        ],
      })
    )
    expect(parsed.lines[0]?.lens?.misforms).toEqual([
      { ...MISFORM, word: 2, decides: [1], cueDecides: [] },
    ])
    expect(findings.map((f) => f.detail)).toContain(
      `"${MISFORM.surface}" is given twice`
    )
  })

  it("drops a cue that holds the word a misform replaces, or a misform", () => {
    for (const korean of ["주세요?", "주아요?"]) {
      const { deck: parsed, findings } = parsedOrThrow(
        withLens({
          ...LENS,
          cue: { korean },
          misforms: [{ ...MISFORM, cueDecides: [] }],
        })
      )
      expect(parsed.lines[0]?.lens).not.toHaveProperty("cue")
      expect(findings.map((f) => f.detail)).toEqual([
        `cue: ${korean.slice(0, -1)} gives the answer away`,
      ])
    }
  })

  it("drops, with a cue that gives the answer away, the misforms only it decides", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withLens({
        cue: { korean: "주세요 드릴까요?" },
        misforms: [
          { ...MISFORM, cueDecides: [] },
          { ...MISFORM, surface: "줘아요" },
        ],
      })
    )
    expect(parsed.lines[0]?.lens?.misforms).toEqual([
      { ...MISFORM, cueDecides: [] },
    ])
    expect(findings.map((f) => f.detail)).toEqual([
      "cue: 주세요 gives the answer away",
      '"줘아요" is wrong only beside the cue',
    ])
  })

  it("keeps a cue and situations past misforms that are not a list, but no lens without a misform", () => {
    const { deck: parsed, findings } = parsedOrThrow(
      withLens({ ...LENS, misforms: "no" })
    )
    expect(parsed.lines[0]).not.toHaveProperty("lens")
    expect(findings.map((f) => f.detail)).toEqual([
      "misforms is not a list",
      "no misform; a lens asks nothing without one",
    ])
    for (const lens of [[], {}]) {
      const empty = parsedOrThrow(withLens(lens))
      expect(empty.deck.lines[0]).not.toHaveProperty("lens")
      expect(empty.deck.lines[0]?.words).toHaveLength(3)
      expect(empty.findings.map((f) => f.kind)).toEqual(["lens-malformed"])
    }
  })

  describe("a set's practice and context", () => {
    const TWO_CUPS: RawLine = { ...ONE_CUP, id: "two-cups" }
    const both = (
      overrides: Record<string, unknown>
    ): Record<string, unknown> =>
      deck({ lines: [{ ...ONE_CUP, lens: LENS }, TWO_CUPS], ...overrides })
    const CONTEXT = {
      genre: "romance",
      premise: "Two strangers share a table.",
    }

    it("keeps a known practice and context", () => {
      const { deck: parsed } = parsedOrThrow(
        both({ practice: "lens", context: CONTEXT })
      )
      expect(parsed.practice).toBe("lens")
      expect(parsed.context).toEqual(CONTEXT)
    })

    it("keeps only lines with a lens in a lens set", () => {
      const { deck: parsed, findings } = parsedOrThrow(
        both({ practice: "lens" })
      )
      expect(parsed.lines.map((kept) => kept.id)).toEqual(["one-cup"])
      expect(findings).toEqual([
        expect.objectContaining({
          kind: "line-without-lens",
          where: "two-cups",
        }),
      ])
    })

    it("keeps no lens in a read-aloud set, and every line", () => {
      const { deck: parsed, findings } = parsedOrThrow(
        both({ practice: "read-aloud" })
      )
      expect(parsed.lines.map((kept) => kept.lens)).toEqual([
        undefined,
        undefined,
      ])
      expect(findings.map((finding) => finding.kind)).toEqual([
        "lens-in-read-aloud-set",
      ])
    })

    it("serves both without a practice, or with one it does not know", () => {
      expect(parsedOrThrow(both({})).deck.practice).toBeUndefined()
      const { deck: parsed, findings } = parsedOrThrow(
        both({ practice: "drama" })
      )
      expect(parsed.practice).toBeUndefined()
      expect(parsed.lines).toHaveLength(2)
      expect(findings.map((finding) => finding.kind)).toEqual([
        "practice-unknown",
      ])
    })

    it("keeps the deck without a context it cannot read", () => {
      const { deck: parsed, findings } = parsedOrThrow(
        both({ context: { genre: "space-opera", premise: "x" } })
      )
      expect(parsed.context).toBeUndefined()
      expect(findings.map((finding) => finding.kind)).toEqual([
        "context-malformed",
      ])
    })
  })
})

describe("readAloudLevelFor", () => {
  it("follows the TOPIK level up to the drill's highest", () => {
    expect([1, 2, 3, 4, 6].map(readAloudLevelFor)).toEqual([1, 2, 3, 3, 3])
  })
})
