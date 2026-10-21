import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createReadAloudStore,
  READ_ALOUD_STORAGE_KEYS,
} from "@topik/lib/topik/adapter/read-aloud-store"
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import { storedSet } from "@topik/lib/topik/read-aloud/added-sets"
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

  it("resumes an unfinished set at its own level, from its own deck, only", () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    store.saveProgress(2, "everyday-2", PROGRESS)
    expect(store.progress(2, "everyday-2")).toEqual(PROGRESS)
    expect(store.progress(1, "everyday-2")).toBeNull()
    expect(store.progress(2, ":all")).toBeNull()
    store.saveProgress(2, "everyday-2", null)
    expect(store.progress(2, "everyday-2")).toBeNull()

    // Progress saved without a deck's id never resumes.
    storage.map.set(
      READ_ALOUD_STORAGE_KEYS.progress,
      JSON.stringify({ version: 1, level: 2, progress: PROGRESS })
    )
    expect(store.progress(2, ":all")).toBeNull()
    expect(store.progress(2, "starter")).toBeNull()
  })

  it("keeps the added word sets, and drops one that no longer parses", () => {
    const storage = memoryStorage()
    const store = createReadAloudStore(storage)
    const set = {
      deck: {
        id: "everyday-2",
        title: "Everyday",
        from: 'your note on Oct 13: "level two"',
        words: [{ id: "juda", lemma: "주다", gloss: "give" }],
        lines: [
          {
            id: "give",
            level: 2 as const,
            korean: "주세요.",
            english: "Please give it to me.",
            words: [{ wordId: "juda", surface: "주세요", stemEnd: 1 }],
          },
        ],
      },
      addedAt: "2026-10-14T06:00:00.000Z",
      openedAt: null,
    }
    store.saveSets([set])
    expect(createReadAloudStore(storage).sets()).toEqual([set])

    storage.map.set(
      READ_ALOUD_STORAGE_KEYS.sets,
      JSON.stringify([
        { deck: { id: "broken" }, addedAt: "x", openedAt: null },
        storedSet(set),
      ])
    )
    expect(store.sets()).toEqual([set])
  })

  it("resumes a set an older build stored with lenses, without them", () => {
    const storage = memoryStorage()
    storage.map.set(
      READ_ALOUD_STORAGE_KEYS.progress,
      JSON.stringify({
        version: 1,
        level: 1,
        deck: ":all",
        progress: {
          ...PROGRESS,
          queue: PROGRESS.queue.map((entry) => ({
            ...entry,
            item: { ...entry.item, lens: { kind: "tense", tense: "past" } },
          })),
        },
      })
    )
    expect(createReadAloudStore(storage).progress(1, ":all")).toEqual(PROGRESS)
  })

  it("keeps the sitting's answers across stores, and says when it could not", () => {
    const storage = memoryStorage()
    const answers = {
      tooEasy: { at: "2026-10-21T08:00:00.000Z" },
      tooManyRepeats: null,
    }
    expect(createReadAloudStore(storage).saveFeedback(answers)).toBe(true)
    expect(createReadAloudStore(storage).feedback()).toEqual(answers)
    createReadAloudStore(storage).saveFeedback(null)
    expect(createReadAloudStore(storage).feedback()).toBeNull()
    for (const gone of [null, refusing]) {
      expect(createReadAloudStore(gone).saveFeedback(answers)).toBe(false)
    }
  })

  it("discards what it cannot parse", () => {
    const storage = memoryStorage()
    storage.map.set(READ_ALOUD_STORAGE_KEYS.paces, "{not json")
    storage.map.set(READ_ALOUD_STORAGE_KEYS.record, '{"version":9}')
    storage.map.set(READ_ALOUD_STORAGE_KEYS.feedback, '{"version":1}')
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
    expect(store.feedback()).toBeNull()
    expect(store.progress(2, ":all")).toBeNull()
  })

  it("runs without storage, and survives storage that throws", () => {
    for (const storage of [null, refusing]) {
      const store = createReadAloudStore(storage)
      store.savePace("juda", { factor: 1, seen: 1 })
      store.saveProgress(1, ":all", PROGRESS)
      store.saveSets([])
      expect(store.paces()).toEqual({})
      expect(store.progress(1, ":all")).toBeNull()
      expect(store.sets()).toEqual([])
      expect(store.count({ type: "set" }, "2026-09-28").totals.sets).toBe(1)
    }
  })
})
