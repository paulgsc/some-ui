import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createLensRecordStore,
  LENS_RECORD_KEY,
  LENS_RECORD_MAX,
  lensRecordForExport,
  lensRecordHeldByHome,
} from "@topik/lib/topik/adapter/lens-record-store"
import type { LensRecordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import { afterEach, describe, expect, it } from "vitest"

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 17)

const entry = (
  closedAt: number,
  overrides: Partial<LensRecordEntry> = {}
): LensRecordEntry => ({
  session: "s1",
  line: "school",
  shownAt: new Date(closedAt - 5000).toISOString(),
  closedAt: new Date(closedAt).toISOString(),
  cue: null,
  shape: "judge-authored",
  answer: "looks right",
  right: true,
  expired: false,
  shown: [],
  chosen: null,
  answerMs: 4000,
  rushed: false,
  racing: false,
  stepDown: null,
  situation: null,
  take: null,
  ...overrides,
})

describe("the lens record store", () => {
  afterEach(() => {
    lensRecordHeldByHome(() => (): boolean => false)
  })

  it("keeps every entry however old, and none past the bound while home holds none", () => {
    const storage = memoryStorage()
    const store = createLensRecordStore(storage)
    store.add(entry(NOW - 400 * DAY, { line: "old" }))
    for (let n = 1; n < LENS_RECORD_MAX; n += 1)
      store.add(entry(NOW - n, { line: `l${n}` }))
    expect(store.full()).toBe(true)
    store.add(entry(NOW, { line: "refused" }))
    // A rewrite of an item already kept still lands.
    store.add(entry(NOW - 1, { line: "l1", right: false }))
    const { entries } = lensRecordForExport(storage)
    expect(entries).toHaveLength(LENS_RECORD_MAX)
    expect(entries[0]?.line).toBe("old")
    expect(entries.some((e) => e.line === "refused")).toBe(false)
    expect(entries.find((e) => e.line === "l1")?.right).toBe(false)
    // A thousand adds, each rewriting the whole record: about 1.2 s here and
    // 5.1 to 5.8 s on CI's runner, past vitest's 5 s default.
  }, 15_000)

  it("makes room at the bound with the earliest entry home holds, and only one it holds (HF5)", () => {
    const storage = memoryStorage()
    const store = createLensRecordStore(storage)
    store.add(entry(NOW - 400 * DAY, { line: "oldest" }))
    for (let n = 1; n < LENS_RECORD_MAX; n += 1)
      store.add(entry(NOW - n, { line: `l${n}` }))
    lensRecordHeldByHome(
      () =>
        (e): boolean =>
          e.line === "l5" || e.line === "l9"
    )
    expect(store.full()).toBe(false)
    store.add(entry(NOW, { line: "new" }))
    const lines = lensRecordForExport(storage).entries.map((e) => e.line)
    expect(lines).toHaveLength(LENS_RECORD_MAX)
    expect(lines).toContain("new")
    expect(lines).toContain("oldest")
    expect(lines).not.toContain("l9")
    expect(lines).toContain("l5")
  }, 15_000)

  it("replaces an entry written again for the same item", () => {
    const storage = memoryStorage()
    const store = createLensRecordStore(storage)
    store.add(entry(NOW - 1000, { situation: null }))
    store.add(entry(NOW - 1000, { line: "other" }))
    const chosen = { chosen: "a", intended: true }
    store.add({
      ...entry(NOW - 1000),
      closedAt: new Date(NOW - 500).toISOString(),
      situation: chosen,
    })
    expect(lensRecordForExport(storage).entries).toMatchObject([
      { line: "other" },
      { line: "school", situation: chosen },
    ])
  })

  it("flags a session racing once any of its entries was", () => {
    const storage = memoryStorage()
    const store = createLensRecordStore(storage)
    store.add(entry(NOW, { line: "a" }))
    store.add(entry(NOW, { line: "b", racing: true }))
    store.add(entry(NOW, { session: "s2" }))
    expect(lensRecordForExport(storage).sessions).toEqual([
      { session: "s1", racing: true },
      { session: "s2", racing: false },
    ])
  })

  it("says it keeps nothing new over a record it cannot read and cannot copy aside, or after a refused write", () => {
    const storage = memoryStorage()
    storage.map.set(LENS_RECORD_KEY, '{"version":2,"entries":[]}')
    storage.full = true
    expect(createLensRecordStore(storage).full()).toBe(true)
    storage.full = false
    expect(createLensRecordStore(storage).full()).toBe(false)
    expect(storage.map.get(`${LENS_RECORD_KEY}:unreadable:1`)).toBe(
      '{"version":2,"entries":[]}'
    )
    storage.map.clear()
    const store = createLensRecordStore(storage)
    expect(store.full()).toBe(false)
    storage.full = true
    store.add(entry(NOW))
    expect(store.full()).toBe(true)
  })

  it("exports no entry with a field it does not know", () => {
    const storage = memoryStorage()
    const newer = { ...entry(NOW), mood: "calm" }
    const nested = {
      ...entry(NOW, { line: "nested" }),
      take: { count: 1, lastMs: 2_000, heardFirst: false, pitch: 3 },
    }
    storage.map.set(
      LENS_RECORD_KEY,
      JSON.stringify({ version: 1, entries: [newer, nested] })
    )
    expect(lensRecordForExport(storage).entries).toEqual([])
  })

  it("keeps what it cannot parse, and copies a record it cannot read aside before writing", () => {
    const storage = memoryStorage()
    const unknown = { ...entry(NOW), shown: ["no-such-mistake"] }
    storage.map.set(
      LENS_RECORD_KEY,
      JSON.stringify({ version: 1, entries: [entry(NOW), unknown] })
    )
    expect(lensRecordForExport(storage).entries).toHaveLength(1)
    createLensRecordStore(storage).add(entry(NOW, { line: "next" }))
    expect(JSON.parse(storage.map.get(LENS_RECORD_KEY) ?? "null")).toEqual({
      version: 1,
      entries: [entry(NOW), unknown, entry(NOW, { line: "next" })],
    })
    for (const [n, unreadable] of [
      [1, "{not json"],
      [2, '{"version":2,"entries":[]}'],
    ] as const) {
      storage.map.set(LENS_RECORD_KEY, unreadable)
      expect(lensRecordForExport(storage).entries).toEqual([])
      createLensRecordStore(storage).add(entry(NOW))
      expect(storage.map.get(`${LENS_RECORD_KEY}:unreadable:${n}`)).toBe(
        unreadable
      )
      expect(lensRecordForExport(storage).entries).toEqual([entry(NOW)])
    }
  })
})
