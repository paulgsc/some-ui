import { indexedDbSoundbiteStore } from "@soundbites/lib/store"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** An `indexedDB` whose every open fails, counting the attempts. */
function failingIndexedDb(): { open: ReturnType<typeof vi.fn> } {
  const open = vi.fn(() => {
    const request: {
      error: DOMException
      onerror: (() => void) | null
      onsuccess: (() => void) | null
      onupgradeneeded: (() => void) | null
    } = {
      error: new DOMException("blocked", "UnknownError"),
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    }
    queueMicrotask(() => request.onerror?.())
    return request
  })
  return { open }
}

describe("indexedDbSoundbiteStore", () => {
  it("tries the database afresh after an open that failed", async () => {
    const indexedDb = failingIndexedDb()
    vi.stubGlobal("indexedDB", indexedDb)
    const store = indexedDbSoundbiteStore()

    await expect(store.list()).rejects.toThrow("blocked")
    await expect(store.list()).rejects.toThrow("blocked")

    expect(indexedDb.open).toHaveBeenCalledTimes(2)
  })
})
