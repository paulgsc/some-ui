import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type { SessionEvent } from "@leetype/lib/leetype/session-log/model"
import { STORAGE_KEY } from "@leetype/lib/leetype/session-log/stored"
import type { KeyedStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

function memory(): KeyedStorage & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

const started: SessionEvent = {
  id: "e1",
  at: "2026-10-18T20:00:00.000Z",
  session: "a",
  type: "started",
  file: "thread-1.json",
  form: "full",
  declaredMinutes: 10,
}

describe("createSessionLogStore", () => {
  it("keeps what it appends across a reopen", () => {
    const storage = memory()
    const store = createSessionLogStore(storage)
    const seen: Array<number> = []
    store.subscribe(() => seen.push(store.getSnapshot().length))

    expect(store.append(started)).toBe(true)
    expect(seen).toEqual([1])
    expect(createSessionLogStore(storage).getSnapshot()).toEqual([started])
  })

  it("moves an unreadable record aside rather than writing over it", () => {
    const storage = memory()
    storage.items.set(STORAGE_KEY, "{not json")
    const store = createSessionLogStore(storage)

    expect(store.getSnapshot()).toEqual([])
    expect(store.append(started)).toBe(true)
    expect(storage.items.get(`${STORAGE_KEY}:unreadable:1`)).toBe("{not json")
  })

  it("opens read-only when the storage throws, and refuses every append", () => {
    const storage: KeyedStorage = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      },
      removeItem: () => {},
    }
    const store = createSessionLogStore(storage)
    expect(store.readOnly).toBe(true)
    expect(store.append(started)).toBe(false)
    expect(store.getSnapshot()).toEqual([])
  })

  it("leaves the snapshot as it was when the device refuses a write", () => {
    const storage = memory()
    const store = createSessionLogStore(storage)
    storage.setItem = (): void => {
      throw new Error("quota")
    }
    expect(store.append(started)).toBe(false)
    expect(store.getSnapshot()).toEqual([])
  })
})
