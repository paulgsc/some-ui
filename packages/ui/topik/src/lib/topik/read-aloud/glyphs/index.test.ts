import type { GlyphCell } from "@topik/lib/topik/read-aloud/glyphs"
import {
  glossOf,
  glyphCells,
  isMarked,
  markUnits,
} from "@topik/lib/topik/read-aloud/glyphs"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"
import { describe, expect, it } from "vitest"

const PRICE: SetItem = {
  kind: "sentence",
  key: "s:cafe-price",
  lineId: "cafe-price",
  text: "사천오백 원입니다.",
  syllables: 8,
  wordIds: ["sacheon-obaek", "won"],
}

const WONIMNIDA: SetItem = {
  kind: "word",
  key: "w:won:원입니다",
  wordId: "won",
  text: "원입니다",
  lineId: "cafe-price",
  syllables: 4,
}

const shown = (cells: Array<GlyphCell>): string =>
  cells.map((cell) => cell.text).join("")

describe("glyphCells (Cor. 4.6 (iv))", () => {
  it("draws the spelling, one cell per syllable and per gap", () => {
    const cells = glyphCells(STARTER_DECK, PRICE, "spelled")
    expect(shown(cells)).toBe(PRICE.text)
    expect(cells.filter((cell) => cell.kind === "syllable")).toHaveLength(8)
    expect(cells.filter((cell) => cell.kind === "gap")).toEqual([
      { kind: "gap", key: "g4", text: " " },
      { kind: "gap", key: "g8", text: "." },
    ])
  })

  it("shows syllables as said while the audio runs, keeping the spelling", () => {
    const cells = glyphCells(STARTER_DECK, PRICE, "pronounced")
    expect(shown(cells)).toBe("사처노백 워님니다.")
    const changed = cells.flatMap((cell) =>
      cell.kind === "syllable" && cell.spelled
        ? [`${cell.spelled}>${cell.text}`]
        : []
    )
    expect(changed).toEqual(["천>처", "오>노", "원>워", "입>님"])
  })

  it("restores the spelling at the gloss and divides a word at its stem", () => {
    const cells = glyphCells(STARTER_DECK, WONIMNIDA, "divided")
    expect(shown(cells)).toBe("원입니다")
    expect(
      cells.map((cell) => (cell.kind === "syllable" ? cell.ending : null))
    ).toEqual([false, true, true, true])
  })

  it("divides no sentence: its gloss is the basket", () => {
    const cells = glyphCells(STARTER_DECK, PRICE, "divided")
    expect(cells.some((cell) => cell.kind === "syllable" && cell.ending)).toBe(
      false
    )
  })

  it("shows the spelling when the line has no matching occurrence", () => {
    const stray: SetItem = { ...WONIMNIDA, lineId: "missing" }
    expect(shown(glyphCells(STARTER_DECK, stray, "pronounced"))).toBe(
      "원입니다"
    )
  })
})

describe("the mark", () => {
  it("steps a syllable at a time for a word, a word at a time for a sentence", () => {
    expect(markUnits(WONIMNIDA)).toBe(4)
    expect(markUnits(PRICE)).toBe(2)
    const word = glyphCells(STARTER_DECK, WONIMNIDA, "spelled")
    expect(word.map((cell) => isMarked(WONIMNIDA, cell, 1))).toEqual([
      false,
      true,
      false,
      false,
    ])
    const sentence = glyphCells(STARTER_DECK, PRICE, "spelled")
    expect(
      sentence
        .filter((cell) => isMarked(PRICE, cell, 1))
        .map((cell) => cell.text)
        .join("")
    ).toBe("원입니다")
    expect(sentence.some((cell) => isMarked(PRICE, cell, null))).toBe(false)
  })
})

describe("glossOf", () => {
  it("gives a word its dictionary form and its sense here", () => {
    expect(glossOf(STARTER_DECK, WONIMNIDA)).toEqual({
      kind: "word",
      lemma: "원",
      meaning: "it's … won",
      surface: "원입니다",
    })
  })

  it("gives a sentence its English and its vocabulary basket", () => {
    expect(glossOf(STARTER_DECK, PRICE)).toEqual({
      kind: "sentence",
      english: "That's 4,500 won.",
      words: [
        {
          wordId: "sacheon-obaek",
          lemma: "사천오백",
          meaning: "four thousand five hundred",
        },
        { wordId: "won", lemma: "원", meaning: "it's … won" },
      ],
    })
  })
})
