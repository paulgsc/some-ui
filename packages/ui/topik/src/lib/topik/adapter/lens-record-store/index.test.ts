import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createLensRecordStore,
  LENS_RECORD_KEY,
  LENS_RECORD_MAX,
  lensRecordForExport,
  letGoLensRecord,
} from "@topik/lib/topik/adapter/lens-record-store"
import type { LensRecordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import { describe, expect, it } from "vitest"

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
  it("keeps every entry however old, and none past the bound until shared", () => {
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

  it("lets go only what an export carried, unchanged since", () => {
    const storage = memoryStorage()
    const store = createLensRecordStore(storage)
    store.add(entry(NOW, { line: "a" }))
    store.add(entry(NOW, { line: "b" }))
    const sent = lensRecordForExport(storage).entries
    // After the export: b is answered further, c is new.
    store.add(
      entry(NOW, { line: "b", situation: { chosen: "x", intended: true } })
    )
    store.add(entry(NOW, { line: "c" }))
    expect(letGoLensRecord(sent, storage)).toBe(1)
    expect(lensRecordForExport(storage).entries.map((e) => e.line)).toEqual([
      "b",
      "c",
    ])
    expect(letGoLensRecord(sent, storage)).toBe(0)
  })

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

  it("says it keeps nothing new over a record it cannot read, or after a refused write", () => {
    const storage = memoryStorage()
    storage.map.set(LENS_RECORD_KEY, '{"version":2,"entries":[]}')
    expect(createLensRecordStore(storage).full()).toBe(true)
    storage.map.clear()
    const store = createLensRecordStore(storage)
    expect(store.full()).toBe(false)
    storage.full = true
    store.add(entry(NOW))
    expect(store.full()).toBe(true)
  })

  it("neither exports nor lets go an entry with a field it does not know", () => {
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
    expect(letGoLensRecord([entry(NOW)], storage)).toBe(0)
    expect(
      letGoLensRecord(
        [
          {
            ...entry(NOW, { line: "nested" }),
            take: { count: 1, lastMs: 2_000, heardFirst: false },
          },
        ],
        storage
      )
    ).toBe(0)
    expect(storage.map.get(LENS_RECORD_KEY)).toContain('"mood"')
    expect(storage.map.get(LENS_RECORD_KEY)).toContain('"pitch"')
  })

  it("keeps what it cannot parse, and writes over no record it cannot read", () => {
    const storage = memoryStorage()
    const unknown = { ...entry(NOW), shown: ["no-such-mistake"] }
    storage.map.set(
      LENS_RECORD_KEY,
      JSON.stringify({ version: 1, entries: [entry(NOW), unknown] })
    )
    expect(lensRecordForExport(storage).entries).toHaveLength(1)
    createLensRecordStore(storage).add(entry(NOW, { line: "next" }))
    letGoLensRecord(lensRecordForExport(storage).entries, storage)
    expect(JSON.parse(storage.map.get(LENS_RECORD_KEY) ?? "null")).toEqual({
      version: 1,
      entries: [unknown],
    })
    for (const unreadable of ["{not json", '{"version":2,"entries":[]}']) {
      storage.map.set(LENS_RECORD_KEY, unreadable)
      expect(lensRecordForExport(storage).entries).toEqual([])
      createLensRecordStore(storage).add(entry(NOW))
      letGoLensRecord([entry(NOW)], storage)
      expect(storage.map.get(LENS_RECORD_KEY)).toBe(unreadable)
    }
  })
})
