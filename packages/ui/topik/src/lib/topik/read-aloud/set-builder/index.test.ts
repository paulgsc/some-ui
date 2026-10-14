import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"
import { pickLens } from "@topik/lib/topik/read-aloud/lens"
import { STARTER_SET } from "@topik/lib/topik/read-aloud/repo-sets"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import {
  buildSet,
  hasThreeAlike,
  levelShortfall,
} from "@topik/lib/topik/read-aloud/set-builder"
import { describe, expect, it } from "vitest"

const levelOf = new Map(STARTER_SET.lines.map((line) => [line.id, line.level]))
const SEEDS = Array.from({ length: 200 }, (_, index) => `seed-${index}`)
const LEVELS: Array<ReadAloudLevel> = [1, 2, 3]

const keys = (items: Array<SetItem>): Array<string> =>
  items.map((item) => item.key)

describe("buildSet", () => {
  it("gives each sentence its line's lens only when drawn with lenses", () => {
    const plain = buildSet(STARTER_SET, { level: 2, seedKey: "lens" })
    const lensed = buildSet(STARTER_SET, {
      level: 2,
      seedKey: "lens",
      lenses: true,
    })
    expect(keys(lensed)).toEqual(keys(plain))
    expect(plain.some((item) => "lens" in item)).toBe(false)
    for (const item of lensed) {
      if (item.kind === "word") {
        expect(item).not.toHaveProperty("lens")
        continue
      }
      const line = STARTER_SET.lines.find(({ id }) => id === item.lineId)
      const lens = line ? pickLens(line, "lens") : null
      if (lens) expect(item.lens).toEqual(lens)
      else expect(item).not.toHaveProperty("lens")
    }
  })

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
