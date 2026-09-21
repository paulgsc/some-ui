/**
 * The session index (#1398, #1399): one key per session, and nothing left
 * behind in `storage.local` that the picker cannot list.
 *
 * The index machinery itself is `@some-extension/common/observability`'s
 * `createSessionIndex`, exercised in depth by some-censor's suite; this
 * covers this adapter's wiring of it and the two leaks #1399 names — the cap
 * and the `pagehide` path through `removeFromIndex()`.
 */

import {
  compactIndex,
  indexStorageKey,
  LEGACY_INDEX_KEY,
  readIndex,
  removeFromIndex,
  sessionStorageKey,
  touchIndex,
  type IndexEntry,
} from "@filter/lib/content/coverage-observability"
import { ext } from "@filter/platform/content"
import { afterEach, describe, expect, it } from "vitest"

const NOW = 1_700_000_000_000

function installFakeStorage(): Map<string, unknown> {
  const store = new Map<string, unknown>()
  const asList = (keys: string | Array<string> | null): Array<string> =>
    keys === null ? [...store.keys()] : typeof keys === "string" ? [keys] : keys
  Reflect.set(ext, "storage", {
    local: {
      get: (
        keys: string | Array<string> | null
      ): Promise<Record<string, unknown>> => {
        const out: Record<string, unknown> = {}
        for (const k of asList(keys)) if (store.has(k)) out[k] = store.get(k)
        return Promise.resolve(out)
      },
      set: (items: Record<string, unknown>): Promise<void> => {
        for (const [k, v] of Object.entries(items)) store.set(k, v)
        return Promise.resolve()
      },
      remove: (keys: string | Array<string>): Promise<void> => {
        for (const k of asList(keys)) store.delete(k)
        return Promise.resolve()
      },
    },
  })
  return store
}

function entry(sessionId: string, updatedAt: number): IndexEntry {
  return {
    sessionId,
    origin: "https://example.com",
    title: "A page",
    tabState: "auto",
    updatedAt,
  }
}

/** An indexed session: its index entry plus its persisted bundle. */
async function record(store: Map<string, unknown>, i: number): Promise<void> {
  store.set(sessionStorageKey(`s${String(i)}`), { version: 1, events: [] })
  await touchIndex(entry(`s${String(i)}`, NOW + i))
}

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
})

describe("the session index", () => {
  it("lists what each tab published under its own key, newest first", async () => {
    const store = installFakeStorage()
    await record(store, 1)
    await record(store, 2)

    expect((await readIndex()).map((e) => e.sessionId)).toEqual(["s2", "s1"])
    expect(store.has(indexStorageKey("s1"))).toBe(true)
    expect(store.has(LEGACY_INDEX_KEY)).toBe(false)
  })

  it("takes the bundle with it when a session is removed — pagehide used to delist a bundle dispose() had just flushed, leaving it unreachable for good (#1399)", async () => {
    const store = installFakeStorage()
    await record(store, 1)
    expect(store.has(sessionStorageKey("s1"))).toBe(true)

    await removeFromIndex("s1")
    expect(await readIndex()).toEqual([])
    expect(store.has(sessionStorageKey("s1"))).toBe(false)
    expect(store.size).toBe(0)
  })

  it("deletes the bundle of a session the cap evicts, not only its entry (#1399)", async () => {
    const store = installFakeStorage()
    for (let i = 0; i < 21; i++) await record(store, i)

    const { evicted } = await compactIndex()
    expect(evicted).toEqual(["s0"])
    expect(store.has(sessionStorageKey("s0"))).toBe(false)
    expect(store.has(sessionStorageKey("s1"))).toBe(true)
    expect(await readIndex()).toHaveLength(20)
    expect(store.size).toBe(40)
  })

  it("sweeps a bundle whose index key is gone", async () => {
    const store = installFakeStorage()
    await record(store, 1)
    store.set(sessionStorageKey("ghost"), { version: 1, events: [] })

    const { orphaned } = await compactIndex()
    expect(orphaned).toEqual(["ghost"])
    expect(store.has(sessionStorageKey("ghost"))).toBe(false)
    expect(store.has(sessionStorageKey("s1"))).toBe(true)
  })

  it("migrates the shared v1 array once, carrying only entries whose bundle still exists", async () => {
    const store = installFakeStorage()
    store.set(LEGACY_INDEX_KEY, [entry("kept", NOW + 1), entry("gone", NOW)])
    store.set(sessionStorageKey("kept"), { version: 1, events: [] })

    expect((await readIndex()).map((e) => e.sessionId)).toEqual(["kept"])
    expect(store.has(LEGACY_INDEX_KEY)).toBe(false)
    expect(store.has(indexStorageKey("kept"))).toBe(true)
    expect(store.has(indexStorageKey("gone"))).toBe(false)
  })

  it("survives a storage area that is not there at all", async () => {
    Reflect.deleteProperty(ext, "storage")
    expect(await readIndex()).toEqual([])
    await expect(touchIndex(entry("s1", NOW))).resolves.toBeUndefined()
    await expect(removeFromIndex("s1")).resolves.toBeUndefined()
    await expect(compactIndex()).resolves.toEqual({
      entries: [],
      evicted: [],
      orphaned: [],
    })
  })
})
