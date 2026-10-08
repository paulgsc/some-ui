/**
 * What the phone keeps between launches, and that nothing it could not read
 * is ever written over: the record has no other copy.
 */
import { newDraft, stepDraft } from "@aph/lib/draft"
import type { Draft } from "@aph/lib/draft"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import type { AphState } from "@aph/lib/store"
import { createAphStore } from "@aph/lib/store"
import { deviceStorage, QUARANTINE_PREFIX, STORAGE_KEY } from "@aph/lib/stored"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it, vi } from "vitest"

const seed: AphState = { settings: SEED_SETTINGS, entries: SEED_ENTRIES }

function figure(value: string): Draft {
  return [...value].reduce(
    (d, digit) => stepDraft(d, { type: "digit", digit }),
    newDraft("mine", "12", null)
  )
}

const commit = { today: "2026-10-03", time: "12:10", id: "noon" }

describe("what the phone keeps", () => {
  it("keeps the paper notes from the first launch on", () => {
    const storage = memoryStorage()
    createAphStore(seed, storage)
    // A later build whose seed is gone still opens on them.
    const later = createAphStore({ ...seed, entries: [] }, storage)
    expect(later.get().entries).toEqual(SEED_ENTRIES)
  })

  it("refuses a change the phone would not keep, leaving the screens as they were", () => {
    const storage = memoryStorage()
    const store = createAphStore(seed, storage)
    storage.full = true
    expect(store.save(figure("4900"), commit)).toBeNull()
    expect(store.editSettings({ step: 50 })).toBe(false)
    expect(store.get()).toEqual(seed)
  })

  it("moves an unreadable record aside rather than write over it", () => {
    const storage = memoryStorage(new Map([[STORAGE_KEY, "{not json"]]))
    const store = createAphStore(seed, storage)
    expect(store.get()).toEqual(seed)
    expect(storage.map.get(`${QUARANTINE_PREFIX}1`)).toBe("{not json")

    // A second one goes beside the first, not over it.
    storage.map.set(STORAGE_KEY, JSON.stringify({ v: 99 }))
    createAphStore(seed, storage)
    expect(storage.map.get(`${QUARANTINE_PREFIX}1`)).toBe("{not json")
    expect(storage.map.get(`${QUARANTINE_PREFIX}2`)).toBe('{"v":99}')
  })

  it("moves aside a record that breaks the rules", () => {
    const twice = [...SEED_ENTRIES, ...SEED_ENTRIES]
    const raw = JSON.stringify({
      v: 1,
      settings: SEED_SETTINGS,
      entries: twice,
    })
    const storage = memoryStorage(new Map([[STORAGE_KEY, raw]]))
    createAphStore(seed, storage)
    expect(storage.map.get(`${QUARANTINE_PREFIX}1`)).toBe(raw)
  })

  it("opens read-only on storage it cannot read, and never writes to it", () => {
    let writes = 0
    const store = createAphStore(seed, {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        writes += 1
      },
    })
    expect(store.get()).toEqual(seed)
    expect(store.save(figure("4900"), commit)).toBeNull()
    expect(writes).toBe(0)
  })

  it("treats a localStorage that throws as unreadable, not as memory only", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })
    const store = createAphStore(seed, deviceStorage())
    expect(store.save(figure("4900"), commit)).toBeNull()
    expect(store.get()).toEqual(seed)
    vi.restoreAllMocks()
  })

  it("refuses a change the next launch could not read back", () => {
    const storage = memoryStorage()
    const store = createAphStore(seed, storage)
    expect(store.editSettings({ tolerance: Infinity })).toBe(false)
    expect(createAphStore(seed, storage).get()).toEqual(seed)
  })

  it("opens read-only when an unreadable record cannot be moved aside", () => {
    const storage = memoryStorage(new Map([[STORAGE_KEY, "{not json"]]))
    storage.full = true
    const store = createAphStore(seed, storage)
    expect(store.save(figure("4900"), commit)).toBeNull()
    expect(storage.map.get(STORAGE_KEY)).toBe("{not json")
  })
})
