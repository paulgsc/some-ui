import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

import {
  createPastedLessonStore,
  PASTED_LESSON_KEY,
  purgeRetiredLessons,
  RETIRED_KEYS,
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

/** Another tree, under another id. */
const otherLesson = (): ReturnType<typeof workedLesson> => ({
  ...workedLesson(),
  id: "second-tea",
})

describe("createPastedLessonStore", () => {
  it("holds one tree, and a second paste replaces the first", () => {
    const store = createPastedLessonStore(memoryStorage())
    expect(store.getTree()).toBeNull()
    store.setTree(workedLesson())
    store.setTree(otherLesson())
    expect(store.getTree()).toEqual(otherLesson())
  })

  it("reads a conversation lesson an earlier build held as nothing", () => {
    const storage = memoryStorage()
    storage.setItem(
      PASTED_LESSON_KEY,
      JSON.stringify({ version: 1, meta: { key: "local:a" }, batches: [] })
    )
    expect(createPastedLessonStore(storage).getTree()).toBeNull()
  })

  it("reads a held tree back through both audits (MK4)", () => {
    const storage = memoryStorage()
    const store = createPastedLessonStore(storage)
    store.setTree(workedLesson())
    const held: unknown = JSON.parse(storage.getItem(PASTED_LESSON_KEY) ?? "")
    // A tree edited in storage to name a feeling the renderer lacks.
    storage.setItem(
      PASTED_LESSON_KEY,
      JSON.stringify(held).replace('"feeling":"tension"', '"feeling":"ennui"')
    )
    expect(store.getTree()).toBeNull()
  })

  it("keeps a tree's place for the visit when storage refuses to write", () => {
    const refusing = {
      getItem: (): string | null => null,
      setItem: (): void => {
        throw new Error("QuotaExceededError")
      },
    }
    const store = createPastedLessonStore(refusing)
    store.setTree(workedLesson())
    store.points.set("first-tea", { route: ["b"] })
    expect(store.points.get("first-tea")).toEqual({ route: ["b"] })
    expect(store.points.get("another")).toBeUndefined()
    // A new paste starts from its opening.
    store.setTree(workedLesson())
    expect(store.points.get("first-tea")).toBeUndefined()
  })

  it("forgets the lesson on clear", () => {
    const store = createPastedLessonStore(memoryStorage())
    store.setTree(workedLesson())
    store.clear()
    expect(store.getTree()).toBeNull()
  })

  it("reads nothing from a document it does not recognise", () => {
    const storage = memoryStorage()
    storage.setItem(PASTED_LESSON_KEY, JSON.stringify({ version: 2 }))
    expect(createPastedLessonStore(storage).getTree()).toBeNull()
    storage.setItem(PASTED_LESSON_KEY, "{not json")
    expect(createPastedLessonStore(storage).getTree()).toBeNull()
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
    expect(() => store.setTree(workedLesson())).not.toThrow()
    expect(store.getTree()).toBeNull()
  })
})

describe("a replacement storage refuses", () => {
  it("empties the slot rather than leave the tree it replaced", () => {
    const storage = memoryStorage()
    const store = createPastedLessonStore(storage)
    store.setTree(workedLesson())
    const full: Storage = {
      ...storage,
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        // Room for an empty slot, not for a tree.
        if (value.length > 0) throw new Error("QuotaExceededError")
        storage.setItem(key, value)
      },
    }
    createPastedLessonStore(full).setTree(otherLesson())
    expect(store.getTree()).toBeNull()
  })

  it("removes the tree it replaced when storage takes no write at all", () => {
    const storage = memoryStorage()
    const store = createPastedLessonStore(storage)
    store.setTree(workedLesson())
    // Reads and removals still work; every write is refused.
    const full: Storage = {
      ...storage,
      getItem: (key) => storage.getItem(key),
      removeItem: (key) => storage.removeItem(key),
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
    }
    createPastedLessonStore(full).setTree(otherLesson())
    expect(store.getTree()).toBeNull()
  })
})

describe("purgeRetiredLessons", () => {
  it("deletes what the retired stores kept, and nothing else", () => {
    const storage = memoryStorage()
    for (const key of RETIRED_KEYS) storage.setItem(key, "[]")
    storage.setItem(PASTED_LESSON_KEY, "kept")
    purgeRetiredLessons(storage)
    for (const key of RETIRED_KEYS) expect(storage.getItem(key)).toBeNull()
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
