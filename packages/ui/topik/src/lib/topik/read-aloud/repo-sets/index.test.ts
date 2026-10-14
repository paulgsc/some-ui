import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import { resolveSets } from "@topik/lib/topik/read-aloud/added-sets"
import type {
  GrammarRole,
  ReadAloudDeck,
} from "@topik/lib/topik/read-aloud/content"
import {
  parseReadAloudDeck,
  READ_ALOUD_LEVELS,
} from "@topik/lib/topik/read-aloud/content"
import { lensesOf } from "@topik/lib/topik/read-aloud/lens"
import {
  LEVEL_ONE_SET,
  rawSet,
  STARTER_SET,
} from "@topik/lib/topik/read-aloud/repo-sets"
import {
  buildSet,
  hasThreeAlike,
} from "@topik/lib/topik/read-aloud/set-builder"
import { describe, expect, it } from "vitest"

const added = (deck: ReadAloudDeck): AddedSet => ({
  deck,
  addedAt: "",
  openedAt: null,
})

/** Both sets added, in the order a learner would: what the drill reads. */
const BOTH = resolveSets([added(STARTER_SET), added(LEVEL_ONE_SET)])

describe.each([
  ["starter", STARTER_SET],
  ["level-one", LEVEL_ONE_SET],
] as const)("%s.json", (name, deck) => {
  const result = parseReadAloudDeck(rawSet(name))

  it("parses with no findings, so no line or word is dropped", () => {
    expect(result.ok && result.findings).toEqual([])
    expect(result.ok && result.deck).toEqual(deck)
  })

  it("names each word and line once, and uses every word it names", () => {
    const ids = deck.words.map((word) => word.id)
    expect(new Set(ids).size).toBe(ids.length)
    const lines = deck.lines.map((line) => line.id)
    expect(new Set(lines).size).toBe(lines.length)
    const used = new Set(
      deck.lines.flatMap((line) => line.words.map((w) => w.wordId))
    )
    expect(deck.words.filter((w) => !used.has(w.id))).toEqual([])
  })

  it("is written for anyone, so says it answers no one", () => {
    expect(deck.from).toBeUndefined()
  })
})

describe("the repo's sets, both added", () => {
  it("lose nothing to each other: a shared word is the same word", () => {
    expect(BOTH.all.lines).toHaveLength(
      STARTER_SET.lines.length + LEVEL_ONE_SET.lines.length
    )
  })

  it("have lines at every level", () => {
    for (const level of READ_ALOUD_LEVELS) {
      expect(STARTER_SET.lines.some((line) => line.level === level)).toBe(true)
    }
  })

  it("give level one its lines and beginner words", () => {
    expect(LEVEL_ONE_SET.lines.every((line) => line.level === 1)).toBe(true)
    expect(LEVEL_ONE_SET.lines.length).toBeGreaterThanOrEqual(60)
    const levelOneWords = new Set(
      BOTH.all.lines
        .filter((line) => line.level === 1)
        .flatMap((line) => line.words.map((w) => w.wordId))
    )
    expect(levelOneWords.size).toBeGreaterThanOrEqual(150)
  })

  it("give only pronunciations that differ from the spelling", () => {
    for (const line of BOTH.all.lines) {
      for (const word of line.words) {
        if (word.pronunciation === undefined) continue
        expect(word.pronunciation).not.toBe(word.surface)
        expect(word.pronunciation).toHaveLength(word.surface.length)
      }
    }
  })

  it("mark each role with the particle that shows it", () => {
    const ENDINGS: Partial<Record<GrammarRole, RegExp>> = {
      subject: /[이가]$/,
      topic: /[은는]$/,
      object: /[을를]$/,
      place: /에서$|여기서$/,
      goal: /[^서]에$/,
      means: /로$/,
      company: /(와|과|하고)$/,
    }
    const wrong = BOTH.all.lines.flatMap((line) =>
      line.words.flatMap(({ role, surface }) => {
        const ending = role === undefined ? undefined : ENDINGS[role]
        return role !== undefined && ending && !ending.test(surface)
          ? [`${line.id}/${surface}: ${role}`]
          : []
      })
    )
    expect(wrong).toEqual([])
  })

  it("give most level-one lines a lens, and every tense often enough to ask", () => {
    const lines = BOTH.all.lines.filter((line) => line.level === 1)
    const lensed = lines.filter((line) => lensesOf(line).length > 0)
    expect(lensed.length / lines.length).toBeGreaterThan(0.8)
    for (const tense of ["past", "present", "future"] as const) {
      const count = lines.filter((line) => line.tense === tense).length
      expect(count, tense).toBeGreaterThanOrEqual(4)
    }
  })

  it("draw level-one sets without three alike in a row", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const items = buildSet(BOTH.all, { level: 1, seedKey: `s${seed}` })
      expect(items).toHaveLength(10)
      expect(hasThreeAlike(items)).toBe(false)
    }
  })
})
