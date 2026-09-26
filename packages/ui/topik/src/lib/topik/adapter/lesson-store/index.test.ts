import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { TopikMetadata } from "@topik/lib/topik"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { describe, expect, it } from "vitest"

import { createLessonStore, LESSON_STORAGE_KEY, MAX_LOCAL_LESSONS } from "."

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => void map.set(key, value),
  }
}

const meta = (key: string): TopikMetadata => ({
  key,
  displayName: key,
  description: "",
  batchCount: 2,
  totalQuestions: 4,
  totalMessages: 6,
})

describe("createLessonStore", () => {
  it("keeps a lesson, newest first, and replaces one saved again", () => {
    let clock = 0
    const store = createLessonStore(memory(), () => clock++)
    store.save(meta("local:a"), FIXTURE_BATCHES)
    store.save(meta("local:b"), FIXTURE_BATCHES)
    store.save(meta("local:a"), FIXTURE_BATCHES)
    expect(store.list().map((lesson) => lesson.meta.key)).toEqual([
      "local:a",
      "local:b",
    ])
    expect(store.get("local:b")?.batches).toEqual(FIXTURE_BATCHES)
    store.remove("local:a")
    expect(store.get("local:a")).toBeNull()
  })

  it("forgets the oldest past the bound", () => {
    let clock = 0
    const store = createLessonStore(memory(), () => clock++)
    for (let i = 0; i <= MAX_LOCAL_LESSONS; i += 1) {
      store.save(meta(`local:${i}`), FIXTURE_BATCHES)
    }
    expect(store.list()).toHaveLength(MAX_LOCAL_LESSONS)
    expect(store.get("local:0")).toBeNull()
  })

  it("drops one lesson it can no longer read without losing the rest", () => {
    const storage = memory()
    storage.map.set(
      LESSON_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lessons: [
          { meta: meta("local:ok"), batches: FIXTURE_BATCHES, at: 1 },
          { meta: { key: 3 }, batches: "nope", at: 2 },
        ],
      })
    )
    expect(
      createLessonStore(storage)
        .list()
        .map((l) => l.meta.key)
    ).toEqual(["local:ok"])
  })

  it("survives storage that throws", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("quota")
      },
    }
    const store = createLessonStore(broken)
    expect(() => store.save(meta("local:a"), FIXTURE_BATCHES)).not.toThrow()
    expect(store.list()).toEqual([])
  })
})
