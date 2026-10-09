import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createReadAloudStore,
  READ_ALOUD_STORAGE_KEYS,
} from "@topik/lib/topik/adapter/read-aloud-store"
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import { emptyRecord } from "@topik/lib/topik/read-aloud/records"
import type { SetProgress } from "@topik/lib/topik/read-aloud/set-machine"
import { describe, expect, it } from "vitest"

const refusing: StorageLike = {
  getItem: (): string | null => {
    throw new Error("denied")
  },
  setItem: (): void => {
    throw new Error("quota")
  },
}

const PROGRESS: SetProgress = {
  queue: [
    {
      role: "rep",
      item: {
        kind: "word",
        key: "w:juda:주세요",
        wordId: "juda",
        text: "주세요",
        lineId: "cafe-order",
        syllables: 3,
      },
    },
    {
      role: "return",
      item: {
        kind: "sentence",
        key: "s:cafe-order",
        lineId: "cafe-order",
        text: "아이스 아메리카노 한 잔 주세요.",
        syllables: 13,
        wordIds: ["aiseu", "amerikano", "hana", "jan", "juda"],
      },
    },
  ],
  returns: { "s:cafe-order": 1 },
  counted: 4,
  reported: true,
}

describe("the read-aloud store", () => {
  it("keeps each word's pace across stores on the same storage", () => {
    const storage = memoryStorage()
    createReadAloudStore(storage).savePace("juda", { factor: 1.4, seen: 2 })
    createReadAloudStore(storage).savePace("jan", { factor: 0.9, seen: 1 })
    expect(createReadAloudStore(storage).paces()).toEqual({
      juda: { factor: 1.4, seen: 2 },
      jan: { factor: 0.9, seen: 1 },
    })
  })

  it("prunes the pace book to the vocabulary (Rem. 7.5)", () => {
    const store = createReadAloudStore(memoryStorage())
    store.savePace("juda", { factor: 1, seen: 1 })
    store.savePace("gone", { factor: 1, seen: 1 })
    store.prunePaces(["juda", "jan"])
    expect(store.paces()).toEqual({ juda: { factor: 1, seen: 1 } })
  })

  it("counts reps and sets into the practice record (Def. 6.6)", () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    store.count({ type: "rep", creditMs: 9000 }, "2026-09-28")
    const after = store.count({ type: "set" }, "2026-09-28")
    expect(after.totals).toEqual({ reps: 1, sets: 1, practiceMs: 9000 })
    expect(createReadAloudStore(storage).record()).toEqual(after)
  })

  it("resumes an unfinished set at its own level only", () => {
    const store = createReadAloudStore(memoryStorage())
    store.saveProgress(2, PROGRESS)
    expect(store.progress(2)).toEqual(PROGRESS)
    expect(store.progress(1)).toBeNull()
    store.saveProgress(2, null)
    expect(store.progress(2)).toBeNull()
  })

  it("discards what it cannot parse", () => {
    const storage = memoryStorage()
    storage.map.set(READ_ALOUD_STORAGE_KEYS.paces, "{not json")
    storage.map.set(READ_ALOUD_STORAGE_KEYS.record, '{"version":9}')
    storage.map.set(
      READ_ALOUD_STORAGE_KEYS.progress,
      JSON.stringify({
        version: 1,
        level: 2,
        progress: { ...PROGRESS, queue: [{ role: "rep", item: {} }] },
      })
    )
    const store = createReadAloudStore(storage)
    expect(store.paces()).toEqual({})
    expect(store.record()).toEqual(emptyRecord())
    expect(store.progress(2)).toBeNull()
  })

  it("runs without storage, and survives storage that throws", () => {
    for (const storage of [null, refusing]) {
      const store = createReadAloudStore(storage)
      store.savePace("juda", { factor: 1, seen: 1 })
      store.saveProgress(1, PROGRESS)
      expect(store.paces()).toEqual({})
      expect(store.progress(1)).toBeNull()
      expect(store.count({ type: "set" }, "2026-09-28").totals.sets).toBe(1)
    }
  })
})
