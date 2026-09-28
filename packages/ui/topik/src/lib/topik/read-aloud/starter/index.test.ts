import {
  parseReadAloudDeck,
  READ_ALOUD_LEVELS,
} from "@topik/lib/topik/read-aloud/content"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"
import { describe, expect, it } from "vitest"

describe("STARTER_DECK", () => {
  const result = parseReadAloudDeck({ schemaVersion: 1, ...STARTER_DECK })

  it("parses with no findings", () => {
    expect(result.ok && result.findings).toEqual([])
  })

  it("survives parsing unchanged", () => {
    expect(result.ok && result.deck).toEqual(STARTER_DECK)
  })

  it("has lines at every level", () => {
    for (const level of READ_ALOUD_LEVELS) {
      expect(STARTER_DECK.lines.some((line) => line.level === level)).toBe(true)
    }
  })

  it("uses every word it names", () => {
    const used = new Set(
      STARTER_DECK.lines.flatMap((line) => line.words.map((w) => w.wordId))
    )
    expect(STARTER_DECK.words.filter((w) => !used.has(w.id))).toEqual([])
  })
})
