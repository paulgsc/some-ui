import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import type { RoundStorage } from "@leetype/lib/leetype/pasted-round"
import {
  createPastedRoundStore,
  PASTED_ROUND_KEY,
} from "@leetype/lib/leetype/pasted-round"
import { describe, expect, it } from "vitest"

const ROUND = AUTHORED_ROUNDS[0]!
const OTHER = AUTHORED_ROUNDS[1]!

function memoryStorage(): RoundStorage & { removeItem: (key: string) => void } {
  const values = new Map<string, string>()
  return {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value)
    },
    removeItem: (key: string): void => {
      values.delete(key)
    },
  }
}

describe("createPastedRoundStore", () => {
  it("holds one round and replaces it on the next set", () => {
    const store = createPastedRoundStore(memoryStorage())
    expect(store.get()).toBeNull()
    store.set(ROUND)
    expect(store.get()).toEqual(ROUND)
    store.set(OTHER)
    expect(store.get()).toEqual(OTHER)
    store.clear()
    expect(store.get()).toBeNull()
  })

  it("drops a stored value that no longer passes the round checks", () => {
    const storage = memoryStorage()
    storage.setItem(PASTED_ROUND_KEY, JSON.stringify({ ...ROUND, graph: 1 }))
    expect(createPastedRoundStore(storage).get()).toBeNull()
    storage.setItem(PASTED_ROUND_KEY, "not json")
    expect(createPastedRoundStore(storage).get()).toBeNull()
  })

  it("removes the old round when storage refuses the write", () => {
    const storage = memoryStorage()
    const store = createPastedRoundStore(storage)
    store.set(ROUND)
    storage.setItem = (): void => {
      throw new Error("QuotaExceededError")
    }
    store.set(OTHER)
    expect(store.get()).toBeNull()
  })

  it("works with no storage at all", () => {
    const store = createPastedRoundStore(null)
    store.set(ROUND)
    expect(store.get()).toBeNull()
  })
})
