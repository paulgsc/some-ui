import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

import { createResumeStore, MAX_RESUME_POINTS, RESUME_STORAGE_KEY } from "."

describe("createResumeStore", () => {
  it("round-trips a point and remembers the last topik", () => {
    const store = createResumeStore(memoryStorage(), () => 1)
    store.set("topik-01", { conversation: 2, messageId: "m7" })
    expect(store.get("topik-01")).toEqual({
      conversation: 2,
      messageId: "m7",
      at: 1,
    })
    expect(store.last()).toEqual({
      topikKey: "topik-01",
      point: { conversation: 2, messageId: "m7", at: 1 },
    })
  })

  it("keeps a point's outcomes, and still reads points written without them", () => {
    const storage = memoryStorage()
    const store = createResumeStore(storage, () => 1)
    store.set("a", {
      conversation: 0,
      messageId: "m2",
      outcomes: { firstTry: { "0": false }, review: ["0"] },
    })
    expect(store.get("a")?.outcomes).toEqual({
      firstTry: { "0": false },
      review: ["0"],
    })

    storage.setItem(
      RESUME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        last: "b",
        points: { b: { conversation: 1, messageId: "m1", at: 2 } },
      })
    )
    expect(createResumeStore(storage).get("b")).toEqual({
      conversation: 1,
      messageId: "m1",
      at: 2,
    })
  })

  it("keeps only the most recent points", () => {
    let clock = 0
    const store = createResumeStore(memoryStorage(), () => (clock += 1))
    for (let i = 0; i <= MAX_RESUME_POINTS; i += 1) {
      store.set(`t${i}`, { conversation: 0, messageId: "m" })
    }
    expect(store.get("t0")).toBeNull()
    expect(store.get(`t${MAX_RESUME_POINTS}`)).not.toBeNull()
  })

  it("clears a point and the last pointer with it", () => {
    const store = createResumeStore(memoryStorage())
    store.set("a", { conversation: 0, messageId: "m" })
    store.clear("a")
    expect(store.get("a")).toBeNull()
    expect(store.last()).toBeNull()
  })

  it("clears the points a test matches, and hands last to the newest left", () => {
    let clock = 1
    const store = createResumeStore(memoryStorage(), () => clock++)
    store.set("served-old", { conversation: 0, messageId: "m" })
    store.set("served-new", { conversation: 1, messageId: "m" })
    store.set("local:a", { conversation: 2, messageId: "m" })
    store.clearWhere((key) => key.startsWith("local:"))
    expect(store.get("local:a")).toBeNull()
    expect(store.get("served-old")).not.toBeNull()
    expect(store.last()?.topikKey).toBe("served-new")
    // Nothing matches: last stays where it was.
    store.set("served-old", { conversation: 0, messageId: "m2" })
    store.clearWhere((key) => key.startsWith("local:"))
    expect(store.last()?.topikKey).toBe("served-old")
  })

  it("removes the whole document when a purge cannot rewrite it", () => {
    const map = new Map<string, string>()
    const writable = {
      getItem: (key: string): string | null => map.get(key) ?? null,
      setItem: (key: string, value: string): void => void map.set(key, value),
    }
    createResumeStore(writable).set("local:a", {
      conversation: 0,
      messageId: "m",
    })
    // Reads and removals still work; every write is refused.
    const refusing = {
      ...writable,
      removeItem: (key: string): void => void map.delete(key),
      setItem: (): void => {
        throw new Error("QuotaExceededError")
      },
    }
    createResumeStore(refusing).clearWhere((key) => key.startsWith("local:"))
    expect(map.has(RESUME_STORAGE_KEY)).toBe(false)
  })

  it("treats unknown shapes, bad JSON and throwing storage as empty", () => {
    const storage = memoryStorage()
    storage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ version: 0 }))
    expect(createResumeStore(storage).get("a")).toBeNull()
    storage.setItem(RESUME_STORAGE_KEY, "{not json")
    expect(createResumeStore(storage).last()).toBeNull()

    const throwing = {
      getItem: (): string | null => {
        throw new Error("denied")
      },
      setItem: (): void => {
        throw new Error("quota")
      },
    }
    const store = createResumeStore(throwing)
    expect(() =>
      store.set("a", { conversation: 0, messageId: "m" })
    ).not.toThrow()
    expect(store.get("a")).toBeNull()
    expect(createResumeStore(null).last()).toBeNull()
  })
})
