import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import {
  emptyTally,
  markOf,
  noteRead,
  noteShown,
  readTally,
  rowOf,
  storedTally,
  tallyKey,
  tallySince,
  tallySize,
} from "@topik/lib/topik/read-aloud/tally"
import { describe, expect, it } from "vitest"

const MON = "2026-10-19T09:00:00.000Z"
const TUE = "2026-10-20T09:00:00.000Z"
const WED = "2026-10-21T09:00:00.000Z"

const SENTENCE: SetItem = {
  kind: "sentence",
  key: "s:cafe",
  lineId: "cafe",
  text: "한 잔 주세요.",
  syllables: 5,
  wordIds: ["juda"],
}
const WORD: SetItem = {
  kind: "word",
  key: "w:juda:주세요",
  wordId: "juda",
  text: "주세요",
  lineId: "cafe",
  syllables: 3,
}

describe("a sentence's key", () => {
  it("is its line's id and its Korean, so a line written again is another sentence", () => {
    const again = { lineId: "cafe", text: "두 잔 주세요." }
    expect(tallyKey(SENTENCE)).toBe(tallyKey({ ...SENTENCE }))
    expect(tallyKey(again)).not.toBe(tallyKey(SENTENCE))
    expect(tallyKey({ lineId: "bus", text: SENTENCE.text })).not.toBe(
      tallyKey(SENTENCE)
    )
    // What the old line showed is not shown of the new one.
    const seen = noteShown(
      noteShown(emptyTally(), tallyKey(SENTENCE), MON),
      tallyKey(SENTENCE),
      TUE
    )
    expect(
      markOf({ item: { ...SENTENCE, ...again }, role: "rep" }, seen, {})
    ).toBe("new")
  })
})

describe("the mark on a rep", () => {
  const shownOnce = noteShown(emptyTally(), tallyKey(SENTENCE), MON)
  const shownTwice = noteShown(shownOnce, tallyKey(SENTENCE), TUE)

  it("calls a sentence new on its first showing, and seen before from the second, in the tally's own count", () => {
    const entry = { item: SENTENCE, role: "rep" } as const
    expect(markOf(entry, shownOnce, {})).toBe("new")
    expect(markOf(entry, shownTwice, {})).toBe("seen")
    // A tally that has not heard of it yet is not a showing it has seen.
    expect(markOf(entry, emptyTally(), {})).toBe("new")
  })

  it("calls a return seen before, whatever the tally says, and an introduction nothing", () => {
    expect(markOf({ item: SENTENCE, role: "return" }, emptyTally(), {})).toBe(
      "seen"
    )
    expect(markOf({ item: WORD, role: "return" }, emptyTally(), {})).toBe(
      "seen"
    )
    expect(
      markOf({ item: WORD, role: "introduction" }, shownTwice, {
        juda: { factor: 1, seen: 3 },
      })
    ).toBeNull()
  })

  it("takes a word's mark from the pace book alone", () => {
    const entry = { item: WORD, role: "rep" } as const
    expect(markOf(entry, shownTwice, {})).toBe("new")
    expect(markOf(entry, emptyTally(), { juda: { factor: 1, seen: 0 } })).toBe(
      "new"
    )
    expect(markOf(entry, emptyTally(), { juda: { factor: 1, seen: 1 } })).toBe(
      "seen"
    )
    expect(
      markOf({ item: { ...WORD, wordId: "constructor" }, role: "rep" }, {}, {})
    ).toBe("new")
  })
})

describe("the sentence tally (Rem. 7.5)", () => {
  it("opens a row on a first showing and moves only its last date and count after", () => {
    const first = noteShown(emptyTally(), "cafe", MON)
    expect(rowOf(first, "cafe")).toEqual({
      first: MON,
      last: MON,
      shown: 1,
      read: 0,
    })
    const again = noteShown(first, "cafe", WED)
    expect(rowOf(again, "cafe")).toEqual({
      first: MON,
      last: WED,
      shown: 2,
      read: 0,
    })
  })

  it("counts a rep read to the end on its own row only", () => {
    const shown = noteShown(noteShown(emptyTally(), "cafe", MON), "bus", TUE)
    const read = noteRead(shown, "cafe")
    expect(rowOf(read, "cafe")?.read).toBe(1)
    expect(rowOf(read, "cafe")?.last).toBe(MON)
    expect(rowOf(read, "bus")).toEqual(rowOf(shown, "bus"))
  })

  it("adds nothing for a rep whose line has no row, or is already read as often as shown", () => {
    const empty = emptyTally()
    expect(noteRead(empty, "cafe")).toBe(empty)
    const read = noteRead(noteShown(empty, "cafe", MON), "cafe")
    expect(noteRead(read, "cafe")).toBe(read)
  })

  it("never lets a line id reach a prototype", () => {
    expect(rowOf(emptyTally(), "constructor")).toBeNull()
    const tally = noteShown(emptyTally(), "constructor", MON)
    expect(rowOf(tally, "constructor")?.shown).toBe(1)
    expect(Object.getPrototypeOf(tally)).toBe(Object.prototype)
  })

  it("says how many sentences it holds and since when", () => {
    expect(tallySince(emptyTally())).toBeNull()
    const tally = noteShown(
      noteShown(noteShown(emptyTally(), "bus", TUE), "cafe", MON),
      "bus",
      WED
    )
    expect(tallySize(tally)).toBe(2)
    expect(tallySince(tally)).toBe(MON)
  })

  it("round-trips what it keeps, and keeps nothing for an empty tally", () => {
    const tally = noteRead(noteShown(emptyTally(), "cafe", MON), "cafe")
    expect(readTally(JSON.parse(JSON.stringify(storedTally(tally))))).toEqual({
      value: tally,
      whole: true,
    })
    expect(storedTally(emptyTally())).toBeNull()
  })

  it("keeps a row a clock set back wrote, with its last date before its first", () => {
    const set = noteShown(noteShown(emptyTally(), "cafe", WED), "cafe", MON)
    expect(rowOf(set, "cafe")).toMatchObject({ first: WED, last: MON })
    expect(readTally(JSON.parse(JSON.stringify(storedTally(set))))).toEqual({
      value: set,
      whole: true,
    })
    expect(tallySince(set)).toBe(WED)
  })

  describe("parsed, not trusted", () => {
    const good = { first: MON, last: TUE, shown: 2, read: 1 }
    const rows = (row: unknown): unknown => ({
      version: 1,
      rows: { good, bad: row },
    })

    it.each([
      ["a missing field", { first: MON, last: TUE, shown: 2 }],
      ["a date that is not one", { ...good, first: "yesterday" }],
      ["more reads than showings", { ...good, read: 3 }],
      ["a row never shown", { ...good, shown: 0, read: 0 }],
      ["a fraction", { ...good, shown: 1.5 }],
      ["a negative count", { ...good, read: -1 }],
      ["a string where a count goes", { ...good, shown: "2" }],
    ])("leaves out a row with %s and keeps the rest", (_, bad) => {
      expect(readTally(rows(bad))).toEqual({ value: { good }, whole: false })
    })

    it.each([
      ["nothing", null],
      ["a string", "tally"],
      ["a bare list of rows", [good]],
      ["another version", { version: 2, rows: { good } }],
      ["rows that are not a record", { version: 1, rows: [good] }],
    ])("reads %s as an empty tally", (_, raw) => {
      expect(readTally(raw)?.value ?? {}).toEqual({})
    })
  })
})
