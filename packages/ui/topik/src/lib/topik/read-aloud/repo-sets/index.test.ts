import type { GrammarRole } from "@topik/lib/topik/read-aloud/content"
import {
  parseReadAloudDeck,
  READ_ALOUD_LEVELS,
} from "@topik/lib/topik/read-aloud/content"
import { lensesOf } from "@topik/lib/topik/read-aloud/lens"
import {
  LEVEL_ONE_SET,
  rawSet,
  REPO_SETS,
  STARTER_SET,
} from "@topik/lib/topik/read-aloud/repo-sets"
import {
  buildSet,
  hasThreeAlike,
} from "@topik/lib/topik/read-aloud/set-builder"
import { describe, expect, it } from "vitest"

describe.each([
  ["starter", STARTER_SET],
  ["level-one", LEVEL_ONE_SET],
] as const)("%s.json", (name, deck) => {
  const result = parseReadAloudDeck(rawSet(name))

  it("parses with no findings, so no line or word is dropped", () => {
    expect(result.ok && result.findings).toEqual([])
    expect(result.ok && result.deck).toEqual(deck)
  })

  it("uses every word it names", () => {
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
    expect(REPO_SETS.lines).toHaveLength(
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
      REPO_SETS.lines
        .filter((line) => line.level === 1)
        .flatMap((line) => line.words.map((w) => w.wordId))
    )
    expect(levelOneWords.size).toBeGreaterThanOrEqual(150)
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
    const wrong = REPO_SETS.lines.flatMap((line) =>
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
    const lines = REPO_SETS.lines.filter((line) => line.level === 1)
    const lensed = lines.filter((line) => lensesOf(line).length > 0)
    expect(lensed.length / lines.length).toBeGreaterThan(0.8)
    for (const tense of ["past", "present", "future"] as const) {
      const count = lines.filter((line) => line.tense === tense).length
      expect(count, tense).toBeGreaterThanOrEqual(4)
    }
  })

  it("give the grammar lens enough lines for a full set at level one", () => {
    const misformed = REPO_SETS.lines.filter(
      (line) => line.level === 1 && line.lens !== undefined
    )
    expect(misformed.length).toBeGreaterThanOrEqual(16)
  })

  it("draw level-one sets without three alike in a row", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const items = buildSet(REPO_SETS, { level: 1, seedKey: `s${seed}` })
      expect(items).toHaveLength(10)
      expect(hasThreeAlike(items)).toBe(false)
    }
  })
})
