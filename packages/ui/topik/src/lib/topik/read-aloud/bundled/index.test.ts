import { BUNDLED_DECK } from "@topik/lib/topik/read-aloud/bundled"
import type { GrammarRole } from "@topik/lib/topik/read-aloud/content"
import { parseReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import { lensesOf } from "@topik/lib/topik/read-aloud/lens"
import {
  LEVEL_ONE_LINES,
  LEVEL_ONE_WORDS,
} from "@topik/lib/topik/read-aloud/level-one"
import {
  buildSet,
  hasThreeAlike,
} from "@topik/lib/topik/read-aloud/set-builder"
import { describe, expect, it } from "vitest"

describe("BUNDLED_DECK", () => {
  const result = parseReadAloudDeck({ schemaVersion: 1, ...BUNDLED_DECK })

  it("parses with no findings, so no line or word is dropped", () => {
    expect(result.ok && result.findings).toEqual([])
    expect(result.ok && result.deck).toEqual(BUNDLED_DECK)
  })

  it("names each word once", () => {
    const ids = BUNDLED_DECK.words.map((word) => word.id)
    expect(new Set(ids).size).toBe(ids.length)
    const lines = BUNDLED_DECK.lines.map((line) => line.id)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it("uses every word it names", () => {
    const used = new Set(
      BUNDLED_DECK.lines.flatMap((line) => line.words.map((w) => w.wordId))
    )
    expect(BUNDLED_DECK.words.filter((w) => !used.has(w.id))).toEqual([])
  })

  it("adds level-one lines and beginner words", () => {
    expect(LEVEL_ONE_LINES.every((line) => line.level === 1)).toBe(true)
    expect(LEVEL_ONE_LINES.length).toBeGreaterThanOrEqual(60)
    const levelOneWords = new Set(
      BUNDLED_DECK.lines
        .filter((line) => line.level === 1)
        .flatMap((line) => line.words.map((w) => w.wordId))
    )
    expect(levelOneWords.size).toBeGreaterThanOrEqual(150)
    expect(LEVEL_ONE_WORDS.length).toBeGreaterThan(100)
  })

  it("gives only pronunciations that differ from the spelling", () => {
    for (const line of LEVEL_ONE_LINES) {
      for (const word of line.words) {
        if (word.pronunciation === undefined) continue
        expect(word.pronunciation).not.toBe(word.surface)
        expect(word.pronunciation).toHaveLength(word.surface.length)
      }
    }
  })

  it("marks each role with the particle that shows it", () => {
    // What a learner sees: a role is given only where its form shows it.
    const ENDINGS: Partial<Record<GrammarRole, RegExp>> = {
      subject: /[이가]$/,
      topic: /[은는]$/,
      object: /[을를]$/,
      place: /에서$|여기서$/,
      goal: /[^서]에$/,
      means: /로$/,
      company: /(와|과|하고)$/,
    }
    const wrong = BUNDLED_DECK.lines.flatMap((line) =>
      line.words.flatMap(({ role, surface }) => {
        const ending = role === undefined ? undefined : ENDINGS[role]
        return role !== undefined && ending && !ending.test(surface)
          ? [`${line.id}/${surface}: ${role}`]
          : []
      })
    )
    expect(wrong).toEqual([])
  })

  it("gives most level-one lines a lens, and every tense often enough to ask", () => {
    const lines = BUNDLED_DECK.lines.filter((line) => line.level === 1)
    const lensed = lines.filter((line) => lensesOf(line).length > 0)
    expect(lensed.length / lines.length).toBeGreaterThan(0.8)
    for (const tense of ["past", "present", "future"] as const) {
      const count = lines.filter((line) => line.tense === tense).length
      expect(count, tense).toBeGreaterThanOrEqual(4)
    }
  })

  it("draws level-one sets without three alike in a row", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const items = buildSet(BUNDLED_DECK, { level: 1, seedKey: `s${seed}` })
      expect(items).toHaveLength(10)
      expect(hasThreeAlike(items)).toBe(false)
    }
  })
})
