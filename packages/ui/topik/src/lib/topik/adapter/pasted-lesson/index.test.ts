import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { TopikMetadata } from "@topik/lib/topik"
import { describe, expect, it } from "vitest"

import {
  createPastedLessonStore,
  PASTED_LESSON_KEY,
  purgeRetiredLessons,
  RETIRED_LESSONS_KEY,
} from "."

const memoryStorage = (): Storage => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length(): number {
      return data.size
    },
  }
}

const meta = (key: string): TopikMetadata => ({
  key,
  displayName: key,
  description: "",
  batchCount: FIXTURE_BATCHES.length,
  totalQuestions: 1,
  totalMessages: 1,
})

describe("createPastedLessonStore", () => {
  it("holds one lesson, and a second paste replaces the first", () => {
    const store = createPastedLessonStore(memoryStorage())
    expect(store.get()).toBeNull()
    store.set(meta("local:a"), FIXTURE_BATCHES)
    store.set(meta("local:b"), FIXTURE_BATCHES)
    expect(store.get()?.meta.key).toBe("local:b")
    expect(store.get()?.batches).toHaveLength(FIXTURE_BATCHES.length)
  })

  it("forgets the lesson on clear", () => {
    const store = createPastedLessonStore(memoryStorage())
    store.set(meta("local:a"), FIXTURE_BATCHES)
    store.clear()
    expect(store.get()).toBeNull()
  })

  it("reads nothing from a document it does not recognise", () => {
    const storage = memoryStorage()
    storage.setItem(PASTED_LESSON_KEY, JSON.stringify({ version: 2 }))
    expect(createPastedLessonStore(storage).get()).toBeNull()
    storage.setItem(PASTED_LESSON_KEY, "{not json")
    expect(createPastedLessonStore(storage).get()).toBeNull()
  })

  it("is silent when storage refuses", () => {
    const refusing = {
      getItem: (): string => {
        throw new Error("denied")
      },
      setItem: (): void => {
        throw new Error("quota")
      },
    }
    const store = createPastedLessonStore(refusing)
    expect(() => store.set(meta("local:a"), FIXTURE_BATCHES)).not.toThrow()
    expect(store.get()).toBeNull()
  })
})

describe("a replacement storage refuses (Codex, #1555)", () => {
  it("empties the slot rather than leave the lesson it replaced", () => {
    const storage = memoryStorage()
    const store = createPastedLessonStore(storage)
    store.set(meta("local:a"), FIXTURE_BATCHES)
    const full: Storage = {
      ...storage,
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        // Room for an empty slot, not for a lesson.
        if (value.length > 0) throw new Error("QuotaExceededError")
        storage.setItem(key, value)
      },
    }
    createPastedLessonStore(full).set(meta("local:b"), FIXTURE_BATCHES)
    expect(store.get()).toBeNull()
  })
})

describe("purgeRetiredLessons", () => {
  it("deletes what the retired store kept, and nothing else (Codex, #1555)", () => {
    const storage = memoryStorage()
    storage.setItem(RETIRED_LESSONS_KEY, "[]")
    storage.setItem(PASTED_LESSON_KEY, "kept")
    purgeRetiredLessons(storage)
    expect(storage.getItem(RETIRED_LESSONS_KEY)).toBeNull()
    expect(storage.getItem(PASTED_LESSON_KEY)).toBe("kept")
  })

  it("is silent where storage throws", () => {
    expect(() =>
      purgeRetiredLessons({
        removeItem: () => {
          throw new Error("denied")
        },
      })
    ).not.toThrow()
  })
})
