import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createLastDramaStore,
  LAST_DRAMA_TTL_MS,
} from "@topik/lib/topik/adapter/last-drama-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { ADDED_SET_LIMIT } from "@topik/lib/topik/read-aloud/added-sets"
import { RECORD_DAYS } from "@topik/lib/topik/read-aloud/records"
import { describe, expect, it } from "vitest"

import { topikKeptCounts } from "."

const DAY = 24 * 60 * 60 * 1000

describe("topikKeptCounts", () => {
  it("counts nothing kept against each bound", () => {
    expect(topikKeptCounts(memoryStorage(), () => 0)).toEqual({
      wordSets: { kept: 0, limit: ADDED_SET_LIMIT },
      practiceDays: { kept: 0, limit: RECORD_DAYS },
      lastDrama: { ageMs: null, keptMs: LAST_DRAMA_TTL_MS },
    })
  })

  it("reads each record through its own store", () => {
    const storage = memoryStorage()
    const readAloud = createReadAloudStore(storage)
    readAloud.count({ type: "set" }, "2026-10-29")
    readAloud.count({ type: "set" }, "2026-10-30")
    readAloud.count({ type: "set" }, "2026-10-30")
    createLastDramaStore(storage, () => 10 * DAY).save({
      lessonId: "first-tea",
      content: "x",
      level: 2,
      title: "회장님 댁 거실",
      at: 10 * DAY,
      scenes: [],
      tries: [],
    })

    const counts = topikKeptCounts(storage, () => 13 * DAY)
    expect(counts.practiceDays.kept).toBe(2)
    expect(counts.lastDrama.ageMs).toBe(3 * DAY)
  })

  it("counts no last drama once it has expired", () => {
    const storage = memoryStorage()
    createLastDramaStore(storage, () => 0).save({
      lessonId: "first-tea",
      content: "x",
      level: 2,
      title: "회장님 댁 거실",
      at: 0,
      scenes: [],
      tries: [],
    })
    expect(
      topikKeptCounts(storage, () => LAST_DRAMA_TTL_MS + 1).lastDrama.ageMs
    ).toBeNull()
  })
})
