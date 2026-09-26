import { describe, expect, it } from "vitest"

import type { StorageLike } from "."
import { createResumeStore, MAX_RESUME_POINTS, RESUME_STORAGE_KEY } from "."

const memory = (): StorageLike => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => void map.set(key, value),
  }
}

describe("createResumeStore", () => {
  it("round-trips a point and remembers the last topik", () => {
    const store = createResumeStore(memory(), () => 1)
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

  it("keeps only the most recent points", () => {
    let clock = 0
    const store = createResumeStore(memory(), () => (clock += 1))
    for (let i = 0; i <= MAX_RESUME_POINTS; i += 1) {
      store.set(`t${i}`, { conversation: 0, messageId: "m" })
    }
    expect(store.get("t0")).toBeNull()
    expect(store.get(`t${MAX_RESUME_POINTS}`)).not.toBeNull()
  })

  it("clears a point and the last pointer with it", () => {
    const store = createResumeStore(memory())
    store.set("a", { conversation: 0, messageId: "m" })
    store.clear("a")
    expect(store.get("a")).toBeNull()
    expect(store.last()).toBeNull()
  })

  it("treats unknown shapes, bad JSON and throwing storage as empty", () => {
    const storage = memory()
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
