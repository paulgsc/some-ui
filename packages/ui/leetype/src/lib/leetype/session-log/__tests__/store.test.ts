import {
  createSessionLogStore,
  onSessionLogged,
} from "@leetype/lib/leetype/session-log"
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
    expect(new Set(storage.map.keys())).toEqual(
      new Set([INDEX_KEY, sessionKey("a"), sessionKey("b")])
    )
    expect(createSessionLogStore(storage).getSnapshot().log).toEqual([
      started("e1", "a"),
      started("e2", "b"),
    ])
  })

  it("tells onSessionLogged each event a store keeps, whichever store, and none it refuses", () => {
    const storage = memoryStorage()
    const one = createSessionLogStore(storage)
    const two = createSessionLogStore(storage)
    const told: Array<string> = []
    const stop = onSessionLogged((event) => told.push(event.id))
    one.append(started("e1", "a"))
    two.append(started("e2", "b"))
    storage.full = true
    expect(one.append(started("e3", "c"))).toBe(false)
    expect(told).toEqual(["e1", "e2"])
    stop()
    storage.full = false
    one.append(started("e4", "d"))
    expect(told).toEqual(["e1", "e2"])
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

  it("keeps an event once, and says it is kept", () => {
    const storage = memoryStorage()
    const store = createSessionLogStore(storage)
    store.append(started("e1", "a"))
    storage.full = true
    expect(store.append(started("e1", "a"))).toBe(true)
    expect(store.getSnapshot().problem).toBeNull()
  })

  it("lists a session before keeping it, so a refused index keeps nothing unlisted", () => {
    const storage = memoryStorage()
    const setItem = storage.setItem
    storage.setItem = (key, value): void => {
      if (key === INDEX_KEY)
        throw new DOMException("full", "QuotaExceededError")
      setItem(key, value)
    }
    const store = createSessionLogStore(storage)
    expect(store.append(started("e1", "a"))).toBe(false)
    expect(storage.map.size).toBe(0)

    storage.setItem = setItem
    expect(store.append(started("e1", "a"))).toBe(true)
    expect(createSessionLogStore(storage).getSnapshot().log).toHaveLength(1)
  })

  it("leaves an unreadable index as it is and opens read-only", () => {
    const storage = memoryStorage([[INDEX_KEY, `{"v":2,"sessions":["a"]}`]])
    const store = createSessionLogStore(storage)
    expect(store.readOnly).toBe(true)
    expect(store.append(started("e1", "b"))).toBe(false)
    expect([...storage.map]).toEqual([[INDEX_KEY, `{"v":2,"sessions":["a"]}`]])
  })

  it("opens read-only when a listed session cannot be read", () => {
    const storage = memoryStorage([[INDEX_KEY, `{"v":1,"sessions":["a"]}`]])
    const getItem = storage.getItem
    storage.getItem = (key): string | null => {
      if (key === sessionKey("a")) throw new Error("denied")
      return getItem(key)
    }
    expect(createSessionLogStore(storage).readOnly).toBe(true)
  })

  it("refuses an event the log cannot read back, and says why", () => {
    const store = createSessionLogStore(memoryStorage())
    expect(store.append({ ...started("e1", "a"), session: "a:b" })).toBe(false)
    expect(store.getSnapshot().problem).toContain("isn't one the log can keep")
  })

  it("moves an unreadable session aside rather than writing over it", () => {
    const storage = memoryStorage([
      [INDEX_KEY, `{"v":1,"sessions":["a"]}`],
      [sessionKey("a"), "{not json"],
    ])
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
    expect(store.getSnapshot().problem).toContain("free some space")

    storage.full = false
    expect(store.append(started("e1", "a"))).toBe(true)
    expect(store.getSnapshot().problem).toBeNull()
  })
})
