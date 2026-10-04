import type { RoundNote } from "@leetype/lib/leetype/notes"
import { NOTE_LIMIT, NOTE_TTL_MS } from "@leetype/lib/leetype/notes"
import { createNoteStore, NOTES_KEY } from "@leetype/lib/leetype/notes/store"
import { describe, expect, it } from "vitest"

const NOW = Date.parse("2026-10-03T12:00:00.000Z")

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> & {
  values: Map<string, string>
} {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value)
    },
  }
}

function note(id: string, at = NOW, text = ""): RoundNote {
  return {
    id,
    at: new Date(at).toISOString(),
    kind: "unclear",
    text,
    spoken: false,
    anchor: {
      roundId: "r",
      own: false,
      artifact: "diffSet",
      picked: 1,
      committed: false,
      sessionId: "s",
    },
  }
}

describe("createNoteStore", () => {
  it("adds a note, then replaces it by id", () => {
    const store = createNoteStore(memoryStorage())
    store.put(note("a"), NOW)
    store.put(note("b", NOW + 1), NOW)
    store.put(note("a", NOW, "more words"), NOW)
    expect(store.list(NOW).map(({ id, text }) => [id, text])).toEqual([
      ["b", ""],
      ["a", "more words"],
    ])
  })

  it("removes a note", () => {
    const store = createNoteStore(memoryStorage())
    store.put(note("a"), NOW)
    store.remove("a", NOW)
    expect(store.list(NOW)).toEqual([])
  })

  it("never holds more than Rem. 3.7 allows", () => {
    const storage = memoryStorage()
    const store = createNoteStore(storage)
    for (let index = 0; index < NOTE_LIMIT + 4; index += 1) {
      store.put(note(`n${index}`, NOW + index), NOW)
    }
    const written: unknown = JSON.parse(storage.values.get(NOTES_KEY)!)
    expect(written).toHaveProperty("notes.length", NOTE_LIMIT)
    expect(store.list(NOW + NOTE_TTL_MS + NOTE_LIMIT + 4)).toEqual([])
  })

  it("deletes an expired note from storage on read, not only from the list", () => {
    const storage = memoryStorage()
    const store = createNoteStore(storage)
    store.put(note("old", NOW, "private words"), NOW)
    store.put(note("new", NOW + NOTE_TTL_MS), NOW + NOTE_TTL_MS)
    expect(store.list(NOW + NOTE_TTL_MS + 1).map(({ id }) => id)).toEqual([
      "new",
    ])
    expect(storage.values.get(NOTES_KEY)).not.toContain("private words")
  })

  it("reads every failure as no notes (Thm. 7.2), dropping a bad entry alone", () => {
    const storage = memoryStorage()
    const store = createNoteStore(storage)
    storage.values.set(NOTES_KEY, "{not json")
    expect(store.list(NOW)).toEqual([])
    storage.values.set(NOTES_KEY, JSON.stringify({ v: 99, notes: [note("a")] }))
    expect(store.list(NOW)).toEqual([])
    storage.values.set(
      NOTES_KEY,
      JSON.stringify({ v: 1, notes: [note("a"), { id: "bad" }] })
    )
    expect(store.list(NOW).map(({ id }) => id)).toEqual(["a"])
  })

  it("swallows a failed write (Prop. 7.2) and works with no storage at all", () => {
    const store = createNoteStore({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota")
      },
    })
    expect(() => store.put(note("a"), NOW)).not.toThrow()
    expect(createNoteStore(null).list(NOW)).toEqual([])
  })
})
