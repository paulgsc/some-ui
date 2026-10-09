import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { LastDrama } from "@topik/lib/topik/core/last-drama"
import { describe, expect, it, vi } from "vitest"

import { createLastDramaStore, LAST_DRAMA_KEY, LAST_DRAMA_TTL_MS } from "."

const record = (extra: Partial<LastDrama> = {}): LastDrama => ({
  lessonId: "first-tea",
  level: 2,
  title: "회장님 댁 거실",
  at: 1,
  scenes: [{ id: "s1", place: "회장님 댁 거실", feeling: "tension" }],
  tries: [{ prompt: "서연은?", chosen: "응, 마실래.", answered: false }],
  ...extra,
})

describe("createLastDramaStore", () => {
  it("keeps one record, the same object until it changes, and tells its readers", () => {
    const store = createLastDramaStore(memoryStorage(), () => 2)
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.get()).toBeNull()
    store.save(record())
    expect(store.get()).toEqual(record())
    expect(store.get()).toBe(store.get())
    store.save(record({ lessonId: "another" }))
    expect(store.get()?.lessonId).toBe("another")
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("never reads a record past its expiry, and deletes it when made (canon Rem. 7.4)", () => {
    const storage = memoryStorage()
    let now = 1
    const store = createLastDramaStore(storage, () => now)
    store.save(record())
    now = 2 + LAST_DRAMA_TTL_MS
    expect(store.get()).toBeNull()
    createLastDramaStore(storage, () => now)
    expect(storage.getItem(LAST_DRAMA_KEY)).toBeNull()
  })

  it("discards a shape this build does not know", () => {
    const storage = memoryStorage([[LAST_DRAMA_KEY, '{"version":2}']])
    expect(createLastDramaStore(storage, () => 2).get()).toBeNull()
  })

  it("forgets the free text a prompt carried, and keeps text written since", () => {
    const store = createLastDramaStore(memoryStorage(), () => 2)
    store.save(record({ review: { enjoyed: "fine", next: "revenge" } }))
    store.forgetNext({ lessonId: "first-tea", next: "an older text" })
    expect(store.get()?.review?.next).toBe("revenge")
    store.forgetNext({ lessonId: "first-tea", next: "revenge" })
    expect(store.get()?.review).toEqual({ enjoyed: "fine" })
    store.save(record({ review: { next: "revenge" } }))
    store.forgetNext({ lessonId: "first-tea", next: "revenge" })
    expect(store.get()?.review).toBeUndefined()
  })

  it("is silent where storage fails", () => {
    const failing = {
      getItem: (): string => {
        throw new Error("denied")
      },
      setItem: (): void => {
        throw new Error("quota")
      },
      removeItem: (): void => {
        throw new Error("denied")
      },
    }
    const store = createLastDramaStore(failing, () => 2)
    expect(() => store.save(record())).not.toThrow()
    expect(store.get()).toBeNull()
  })
})
