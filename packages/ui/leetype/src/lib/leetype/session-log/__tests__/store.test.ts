import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type { SessionEvent } from "@leetype/lib/leetype/session-log/model"
import { INDEX_KEY, sessionKey } from "@leetype/lib/leetype/session-log/stored"
import type { KeyedStorage } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

function started(id: string, session: string): SessionEvent {
  return {
    id,
    at: "2026-10-18T20:00:00.000Z",
    session,
    type: "started",
    file: "thread-1.json",
    form: "full",
    declaredMinutes: 10,
  }
}

describe("createSessionLogStore", () => {
  it("keeps each session under its own key across a reopen", () => {
    const storage = memoryStorage()
    const store = createSessionLogStore(storage)
    const seen: Array<number> = []
    store.subscribe(() => seen.push(store.getSnapshot().log.length))

    expect(store.append(started("e1", "a"))).toBe(true)
    expect(store.append(started("e2", "b"))).toBe(true)
    expect(seen).toEqual([1, 2])
    expect([...storage.map.keys()]).toEqual([
      sessionKey("a"),
      INDEX_KEY,
      sessionKey("b"),
    ])
    expect(createSessionLogStore(storage).getSnapshot().log).toEqual([
      started("e1", "a"),
      started("e2", "b"),
    ])
  })

  it("adds to what another store over the same storage kept", () => {
    const storage = memoryStorage()
    const one = createSessionLogStore(storage)
    const two = createSessionLogStore(storage)
    one.append(started("e1", "a"))
    two.append(started("e2", "a"))
    expect(
      createSessionLogStore(storage)
        .getSnapshot()
        .log.map((event) => event.id)
    ).toEqual(["e1", "e2"])
  })

  it("moves an unreadable session aside rather than writing over it", () => {
    const storage = memoryStorage([[sessionKey("a"), "{not json"]])
    const store = createSessionLogStore(storage)
    expect(store.append(started("e1", "a"))).toBe(true)
    expect(storage.map.get(`${sessionKey("a")}:unreadable:1`)).toBe("{not json")
  })

  it("opens read-only when the storage throws, and says so on every append", () => {
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
    expect(store.append(started("e1", "a"))).toBe(false)
    expect(store.getSnapshot().log).toEqual([])
    expect(store.getSnapshot().problem).toContain("can't read")
  })

  it("says the device is full until an append is kept again", () => {
    const storage = memoryStorage()
    const store = createSessionLogStore(storage)
    storage.full = true
    expect(store.append(started("e1", "a"))).toBe(false)
    expect(store.getSnapshot().log).toEqual([])
    expect(store.getSnapshot().problem).toContain("Free some space")

    storage.full = false
    expect(store.append(started("e1", "a"))).toBe(true)
    expect(store.getSnapshot().problem).toBeNull()
  })
})
