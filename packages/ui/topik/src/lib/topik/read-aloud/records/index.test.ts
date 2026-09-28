import type { PracticeRecord } from "@topik/lib/topik/read-aloud/records"
import {
  addRep,
  addSet,
  dayKey,
  emptyRecord,
  parsePaceBook,
  parsePracticeRecord,
  prunePaceBook,
  RECORD_DAYS,
} from "@topik/lib/topik/read-aloud/records"
import { describe, expect, it } from "vitest"

const dayNumber = (index: number): string =>
  dayKey(new Date(2026, 0, 1 + index))

describe("the practice record (Def. 6.6)", () => {
  it("adds reps, practice and sets per day and to the totals", () => {
    let record = emptyRecord()
    record = addRep(record, "2026-09-01", 9000)
    record = addRep(record, "2026-09-01", 6000)
    record = addSet(record, "2026-09-01")
    record = addRep(record, "2026-09-02", 5000)
    expect(record.days).toEqual([
      { day: "2026-09-01", reps: 2, sets: 1, practiceMs: 15_000 },
      { day: "2026-09-02", reps: 1, sets: 0, practiceMs: 5000 },
    ])
    expect(record.totals).toEqual({ reps: 3, sets: 1, practiceMs: 20_000 })
  })

  it("keeps the last sixty days and every total (Rem. 7.5)", () => {
    let record = emptyRecord()
    for (let index = 0; index < RECORD_DAYS + 5; index += 1) {
      record = addRep(record, dayNumber(index), 1000)
    }
    expect(record.days).toHaveLength(RECORD_DAYS)
    expect(record.days[0]?.day).toBe(dayNumber(5))
    expect(record.days.at(-1)?.day).toBe(dayNumber(RECORD_DAYS + 4))
    expect(record.totals.reps).toBe(RECORD_DAYS + 5)
  })

  it("keys days by local date", () => {
    expect(dayKey(new Date(2026, 8, 5, 23, 59))).toBe("2026-09-05")
  })
})

describe("parsePracticeRecord", () => {
  const stored: PracticeRecord = addSet(
    addRep(emptyRecord(), "2026-09-01", 9000),
    "2026-09-01"
  )

  it("round-trips a stored record", () => {
    expect(parsePracticeRecord(JSON.parse(JSON.stringify(stored)))).toEqual(
      stored
    )
  })

  it("discards a malformed record whole", () => {
    for (const raw of [
      null,
      "record",
      { ...stored, version: 2 },
      { ...stored, totals: { reps: -1, sets: 0, practiceMs: 0 } },
      {
        ...stored,
        days: [{ day: "yesterday", reps: 1, sets: 0, practiceMs: 0 }],
      },
      { ...stored, days: [...stored.days, ...stored.days] },
    ]) {
      expect(parsePracticeRecord(raw)).toEqual(emptyRecord())
    }
  })
})

describe("the pace book (Cor. 4.6 (iii))", () => {
  it("keeps each entry that parses and drops the rest", () => {
    expect(
      parsePaceBook({
        juda: { factor: 1.2, seen: 3 },
        hana: { factor: 9, seen: 1 },
        jan: { factor: 1, seen: -1 },
        keopi: "fast",
      })
    ).toEqual({ juda: { factor: 1.2, seen: 3 } })
    expect(parsePaceBook(["juda"])).toEqual({})
    expect(parsePaceBook(undefined)).toEqual({})
  })

  it("is bounded by the vocabulary (Rem. 7.5)", () => {
    const book = {
      juda: { factor: 1, seen: 1 },
      gone: { factor: 1, seen: 1 },
    }
    expect(prunePaceBook(book, ["juda", "hana"])).toEqual({
      juda: { factor: 1, seen: 1 },
    })
  })
})
