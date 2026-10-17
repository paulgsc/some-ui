import type { ReadAloudLine } from "@topik/lib/topik/read-aloud/content"
import { lineOf } from "@topik/lib/topik/read-aloud/glyphs"
import type { LensItem } from "@topik/lib/topik/read-aloud/lens/items"
import {
  askedWord,
  buildLensSet,
  graded,
  lensLines,
} from "@topik/lib/topik/read-aloud/lens/items"
import { REPO_SETS } from "@topik/lib/topik/read-aloud/repo-sets"
import { describe, expect, it } from "vitest"

const SEEDS = Array.from({ length: 40 }, (_, n) => `seed-${n}`)

const lineOfItem = (item: LensItem): ReadAloudLine => {
  const line = lineOf(REPO_SETS, item.lineId)
  if (!line) throw new Error(`no line ${item.lineId}`)
  return line
}

describe("buildLensSet", () => {
  it("asks only about lines with an authored misform (Def. 4.9)", () => {
    for (const seedKey of SEEDS) {
      const items = buildLensSet(REPO_SETS, { level: 1, seedKey })
      expect(items).toHaveLength(8)
      for (const item of items) {
        expect(lineOfItem(item).lens?.misforms.length).toBeGreaterThan(0)
      }
    }
  })

  it("always shows at least one judge as authored (Cor. 4.8 (iii))", () => {
    for (const seedKey of SEEDS) {
      const items = buildLensSet(REPO_SETS, { level: 1, seedKey })
      const asAuthored = items.filter(
        ({ shape }) => shape.kind === "judge" && shape.misform === null
      )
      expect(asAuthored.length).toBeGreaterThanOrEqual(1)
      expect(items.some(({ shape }) => shape.kind === "pick")).toBe(true)
    }
    const one = buildLensSet(REPO_SETS, { level: 1, seedKey: "x", size: 1 })
    expect(one[0]?.shape).toEqual({ kind: "judge", misform: null })
  })

  it("offers a pick the word as written against its authored misforms only", () => {
    for (const seedKey of SEEDS) {
      for (const item of buildLensSet(REPO_SETS, { level: 1, seedKey })) {
        const { shape } = item
        if (shape.kind !== "pick") continue
        const authored = lineOfItem(item).lens?.misforms.filter(
          (m) => m.word === shape.word
        )
        expect(shape.candidates.map((c) => c.surface).sort()).toEqual(
          [
            item.words[shape.word],
            ...(authored ?? []).map((m) => m.surface),
          ].sort()
        )
        for (const candidate of shape.candidates) {
          expect(candidate.label.length).toBeGreaterThan(0)
          expect(shape.prefix + candidate.label).toBe(candidate.surface)
        }
      }
    }
  })

  it("marks only the deciders of the misforms an item shows", () => {
    for (const seedKey of SEEDS) {
      for (const item of buildLensSet(REPO_SETS, { level: 1, seedKey })) {
        const misforms = lineOfItem(item).lens?.misforms ?? []
        const { shape } = item
        const shown =
          shape.kind === "pick"
            ? misforms.filter((m) => m.word === shape.word)
            : misforms.filter(
                (m) =>
                  m.word === shape.misform?.word &&
                  m.surface === shape.misform.surface
              )
        expect(item.decides.sort()).toEqual(
          [...new Set(shown.flatMap((m) => m.decides))].sort()
        )
        expect(item.cue?.decides.sort() ?? []).toEqual(
          item.cue
            ? [...new Set(shown.flatMap((m) => m.cueDecides))].sort()
            : []
        )
      }
    }
  })

  it("asks the step-down only below the item, uniquely, at most three", () => {
    for (const seedKey of SEEDS) {
      for (const item of buildLensSet(REPO_SETS, { level: 1, seedKey })) {
        expect(item.probes.length).toBeLessThanOrEqual(3)
        const rungs = item.probes.map((probe) => probe.rung)
        expect(rungs).toEqual([...rungs].sort((a, b) => b - a))
        expect(new Set(rungs).size).toBe(rungs.length)
        for (const probe of item.probes) {
          if (probe.kind === "split") {
            expect(probe.cuts.length).toBeGreaterThanOrEqual(2)
            expect(probe.cuts).toContain(probe.answer)
          }
        }
      }
    }
  })

  it("never shows or asks about the word the item asked, in the step-down (Rem. 4.15)", () => {
    for (const seedKey of SEEDS) {
      for (const item of buildLensSet(REPO_SETS, { level: 1, seedKey })) {
        const asks = askedWord(item)
        if (asks === null) continue
        const asked = item.words[asks]
        for (const probe of item.probes) {
          if (probe.kind === "tense" || probe.kind === "split") {
            expect(probe.word).not.toBe(asked)
          } else {
            expect(probe.answer).not.toBe(asks)
          }
        }
      }
    }
  })

  it("never splits a word with no ending, which has no right cut", () => {
    const [line] = lensLines(REPO_SETS, 1)
    if (!line) throw new Error("no lens line")
    const words = line.words.map((word, index) =>
      index === 0
        ? { ...word, surface: "우체국", stemEnd: 3 }
        : { ...word, stemEnd: 99 }
    )
    const deck = { ...REPO_SETS, lines: [{ ...line, words }] }
    for (const seedKey of SEEDS) {
      for (const item of buildLensSet(deck, { level: 1, seedKey })) {
        expect(item.probes.some((probe) => probe.kind === "split")).toBe(false)
      }
    }
  })

  it("draws the same set from the same key, a long cue never as audio alone", () => {
    const first = buildLensSet(REPO_SETS, { level: 1, seedKey: "same" })
    expect(buildLensSet(REPO_SETS, { level: 1, seedKey: "same" })).toEqual(
      first
    )
    for (const item of first) {
      if (item.cue?.modality === "audio") {
        expect(lineOfItem(item).lens?.cue?.hearable).toBe(true)
      }
    }
  })

  it("is empty for a deck with nothing to ask at the level", () => {
    const plain = {
      ...REPO_SETS,
      lines: REPO_SETS.lines.map(({ lens: _lens, ...line }) => line),
    }
    expect(buildLensSet(plain, { level: 3, seedKey: "x" })).toEqual([])
  })
})

describe("graded", () => {
  const items = SEEDS.flatMap((seedKey) =>
    buildLensSet(REPO_SETS, { level: 1, seedKey })
  )

  it("takes the word as written for a pick, and names the misform chosen", () => {
    const item = items.find(({ shape }) => shape.kind === "pick")
    if (item?.shape.kind !== "pick") throw new Error("no pick")
    item.shape.candidates.forEach((candidate, index) => {
      expect(graded(item, { kind: "pick", candidate: index })).toEqual({
        right: candidate.mistake === undefined,
        chosen: candidate.mistake ?? null,
      })
    })
  })

  it("takes the misformed word for a judge, and looks-right for the line as written", () => {
    const misformed = items.find(
      ({ shape }) => shape.kind === "judge" && shape.misform !== null
    )
    if (misformed?.shape.kind !== "judge" || !misformed.shape.misform) {
      throw new Error("no misformed judge")
    }
    const { word, mistake } = misformed.shape.misform
    expect(graded(misformed, { kind: "word", word }).right).toBe(true)
    expect(graded(misformed, { kind: "fine" })).toEqual({
      right: false,
      chosen: mistake,
    })
    const authored = items.find(
      ({ shape }) => shape.kind === "judge" && shape.misform === null
    )
    if (!authored) throw new Error("no judge as authored")
    expect(graded(authored, { kind: "fine" }).right).toBe(true)
    expect(graded(authored, { kind: "word", word: 0 }).right).toBe(false)
  })
})
