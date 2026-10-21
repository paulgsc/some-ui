import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"
import {
  LEVEL_ONE_SET,
  STARTER_SET,
} from "@topik/lib/topik/read-aloud/repo-sets"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import {
  buildSet,
  drawnFrom,
  hasThreeAlike,
  levelShortfall,
  sentencePool,
} from "@topik/lib/topik/read-aloud/set-builder"
import { describe, expect, it } from "vitest"

const levelOf = new Map(STARTER_SET.lines.map((line) => [line.id, line.level]))
const SEEDS = Array.from({ length: 200 }, (_, index) => `seed-${index}`)
const LEVELS: Array<ReadAloudLevel> = [1, 2, 3]

const keys = (items: Array<SetItem>): Array<string> =>
  items.map((item) => item.key)

describe("buildSet", () => {
  it("never presents three items of one kind in a row (Cor. 4.6 (i))", () => {
    for (const level of LEVELS) {
      for (const seedKey of SEEDS) {
        expect(hasThreeAlike(buildSet(STARTER_SET, { level, seedKey }))).toBe(
          false
        )
      }
    }
  })

  it("mixes words with sentences, at the requested counts", () => {
    const items = buildSet(STARTER_SET, { level: 2, seedKey: "mix" })
    expect(items.filter((item) => item.kind === "word")).toHaveLength(6)
    expect(items.filter((item) => item.kind === "sentence")).toHaveLength(4)
  })

  it("draws nothing from above the level", () => {
    for (const seedKey of SEEDS) {
      for (const item of buildSet(STARTER_SET, { level: 1, seedKey })) {
        expect(levelOf.get(item.lineId)).toBe(1)
      }
    }
  })

  it("draws the level's own sentences first", () => {
    const sentences = buildSet(STARTER_SET, {
      level: 3,
      seedKey: "first",
    }).filter((item) => item.kind === "sentence")
    const levels = sentences.map((item) => levelOf.get(item.lineId))
    expect(levels.filter((level) => level === 3)).toHaveLength(2)
  })

  it("shows a word at most once, and a sentence's words are its line's", () => {
    for (const seedKey of SEEDS.slice(0, 20)) {
      const items = buildSet(STARTER_SET, { level: 3, seedKey })
      const words = items.flatMap((item) =>
        item.kind === "word" ? [item.wordId] : []
      )
      expect(new Set(words).size).toBe(words.length)
      for (const item of items) {
        if (item.kind !== "sentence") continue
        const line = STARTER_SET.lines.find((each) => each.id === item.lineId)
        expect(item.wordIds).toEqual([
          ...new Set(line?.words.map((word) => word.wordId)),
        ])
      }
    }
  })

  it("is deterministic in its seed, and a new seed draws a new order", () => {
    const again = (seedKey: string): Array<string> =>
      keys(buildSet(STARTER_SET, { level: 2, seedKey }))
    expect(again("same")).toEqual(again("same"))
    const orders = new Set(SEEDS.slice(0, 20).map((seed) => again(seed).join()))
    expect(orders.size).toBeGreaterThan(15)
  })

  it("spreads a lopsided set as far as its counts allow", () => {
    for (const seedKey of SEEDS) {
      const items = buildSet(STARTER_SET, {
        level: 1,
        seedKey,
        words: 6,
        sentences: 2,
      })
      expect(items).toHaveLength(8)
      expect(hasThreeAlike(items)).toBe(false)
    }
  })

  it("still builds a set no order can spread", () => {
    const items = buildSet(STARTER_SET, {
      level: 1,
      seedKey: "words-only",
      words: 5,
      sentences: 0,
    })
    expect(items).toHaveLength(5)
    expect(items.every((item) => item.kind === "word")).toBe(true)
  })
})

const sorted = (ids: ReadonlyArray<string>): Array<string> => [...ids].sort()

/**
 * The line ids of a set's sentences, sorted: a built set is shuffled after
 * the draw, so which sentences it holds is what the draw decides.
 */
const sentencesOf = (items: Array<SetItem>): Array<string> =>
  sorted(
    items.flatMap((item) => (item.kind === "sentence" ? [item.lineId] : []))
  )

describe("buildSet, within a sitting (Rem. 4.9)", () => {
  const ids = LEVEL_ONE_SET.lines.map((line) => line.id)

  it("draws the sentences not yet shown while four of them remain", () => {
    for (const seedKey of SEEDS) {
      const shown = ids.slice(0, 40)
      const drawn = sentencesOf(
        buildSet(LEVEL_ONE_SET, { level: 1, seedKey, shown })
      )
      expect(drawn).toHaveLength(4)
      expect(drawn.some((id) => shown.includes(id))).toBe(false)
    }
  })

  it("takes every unshown sentence, then the one shown longest ago", () => {
    for (const seedKey of SEEDS.slice(0, 20)) {
      // Oldest first: the list is in the order the sentences were last shown.
      const shown = ids.slice(0, -2).reverse()
      const drawn = sentencesOf(
        buildSet(LEVEL_ONE_SET, { level: 1, seedKey, shown })
      )
      expect(drawn).toEqual(sorted([...ids.slice(-2), ...shown.slice(0, 2)]))
    }
  })

  it("draws the one shown longest ago first once every sentence is shown", () => {
    const shown = [...ids].reverse()
    for (const seedKey of SEEDS.slice(0, 20)) {
      expect(
        sentencesOf(buildSet(LEVEL_ONE_SET, { level: 1, seedKey, shown }))
      ).toEqual(sorted(shown.slice(0, 4)))
    }
  })

  it("keeps the level's own unshown lines ahead of the lower ones", () => {
    const own = STARTER_SET.lines.filter((line) => line.level === 3)
    for (const seedKey of SEEDS.slice(0, 20)) {
      const drawn = sentencesOf(
        buildSet(STARTER_SET, {
          level: 3,
          seedKey,
          shown: [own[0]?.id ?? ""],
        })
      )
      expect(drawn).toContain(own[1]?.id)
    }
  })

  it("ignores a shown line the deck does not hold at the level", () => {
    const plain = buildSet(STARTER_SET, { level: 1, seedKey: "same" })
    expect(
      buildSet(STARTER_SET, {
        level: 1,
        seedKey: "same",
        shown: ["not-a-line"],
      })
    ).toEqual(plain)
  })

  it("draws the same sentences as ever when nothing has been shown", () => {
    for (const seedKey of SEEDS.slice(0, 20)) {
      expect(
        sentencesOf(buildSet(LEVEL_ONE_SET, { level: 1, seedKey, shown: [] }))
      ).toEqual(sentencesOf(buildSet(LEVEL_ONE_SET, { level: 1, seedKey })))
    }
  })

  it("never drills a word on its own when a sentence of the set holds it", () => {
    for (const deck of [STARTER_SET, LEVEL_ONE_SET]) {
      for (const level of LEVELS) {
        for (const seedKey of SEEDS.slice(0, 40)) {
          const items = buildSet(deck, { level, seedKey })
          const held = new Set(
            items.flatMap((item) =>
              item.kind === "sentence" ? item.wordIds : []
            )
          )
          for (const item of items) {
            if (item.kind === "word") expect(held.has(item.wordId)).toBe(false)
          }
        }
      }
    }
  })
})

describe("sentencePool", () => {
  it("counts the different sentences shown, of those at or below the level", () => {
    const ids = STARTER_SET.lines
      .filter((line) => line.level <= 2)
      .map((line) => line.id)
    expect(sentencePool(STARTER_SET, 2, [])).toEqual({
      shown: 0,
      of: ids.length,
    })
    expect(sentencePool(STARTER_SET, 2, ids.slice(0, 3))).toEqual({
      shown: 3,
      of: ids.length,
    })
  })

  it("leaves out a line shown that the level or the deck does not hold", () => {
    const high = STARTER_SET.lines.find((line) => line.level === 3)?.id ?? ""
    const low = STARTER_SET.lines.find((line) => line.level === 1)?.id ?? ""
    expect(sentencePool(STARTER_SET, 1, [high, low, "gone", low]).shown).toBe(1)
  })
})

describe("levelShortfall", () => {
  const ownLines = (level: ReadAloudLevel): number =>
    STARTER_SET.lines.filter((line) => line.level === level).length

  it("names the level's own sentences when lower levels fill its sets", () => {
    expect(ownLines(2)).toBeLessThan(4)
    expect(levelShortfall(STARTER_SET, 2)).toBe(ownLines(2))
    expect(levelShortfall(STARTER_SET, 3)).toBe(ownLines(3))
  })

  it("is null when the level's own lines fill a set", () => {
    expect(levelShortfall(STARTER_SET, 2, ownLines(2))).toBeNull()
  })

  it("is null when nothing below the level could fill it", () => {
    expect(levelShortfall(STARTER_SET, 1, ownLines(1) + 1)).toBeNull()
  })
})

describe("drawnFrom", () => {
  const items = buildSet(STARTER_SET, { level: 3, seedKey: "kept" })

  it("holds for a set drawn from the deck as it stands", () => {
    expect(drawnFrom(items, STARTER_SET, 3)).toBe(true)
  })

  it("fails once a line the set drew is gone or reads differently", () => {
    const drawn = items[0]?.lineId
    expect(
      drawnFrom(
        items,
        {
          ...STARTER_SET,
          lines: STARTER_SET.lines.filter((line) => line.id !== drawn),
        },
        3
      )
    ).toBe(false)
    expect(
      drawnFrom(
        items,
        {
          ...STARTER_SET,
          lines: STARTER_SET.lines.map((line) =>
            line.id === drawn
              ? {
                  ...line,
                  korean: `${line.korean} `,
                  words: line.words.map((word) => ({
                    ...word,
                    surface: `${word.surface}요`,
                  })),
                }
              : line
          ),
        },
        3
      )
    ).toBe(false)
  })

  it("fails once a line the set drew sits above the level it resumes at", () => {
    const levelOne = buildSet(STARTER_SET, { level: 1, seedKey: "kept" })
    const drawn = levelOne[0]?.lineId
    expect(drawnFrom(levelOne, STARTER_SET, 1)).toBe(true)
    expect(
      drawnFrom(
        levelOne,
        {
          ...STARTER_SET,
          lines: STARTER_SET.lines.map((line) =>
            line.id === drawn ? { ...line, level: 2 } : line
          ),
        },
        1
      )
    ).toBe(false)
  })
})
