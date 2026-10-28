/**
 * The game bites kept on this phone (`../model`, `../runtime`): a bite is
 * kept whole or not at all, nothing lets it go but Undo while it is held
 * back, and an unreadable record is moved aside, never written over (GW3).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import type { KeptBite } from "@some-ui/game-week"
import type { BlobShelf } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import { isReady, parseGameBites, stepGameBites } from "@/lib/game-bites/model"
import { createGameBites } from "@/lib/game-bites/runtime"

const T0 = Date.UTC(2026, 10, 1, 21)

const bite = (id: string, holdUntil = T0 + 5_000): KeptBite => ({
  id,
  gameId: "401772981",
  at: new Date(T0).toISOString(),
  contentType: "audio/webm",
  durationMs: 4_000,
  fields: { how: "said-first", strip: "", watching: "1" },
  holdUntil,
})

function memoryStorage(refuse = false): KeyedStorage & {
  map: Map<string, string>
} {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key): string | null => map.get(key) ?? null,
    setItem: (key, value): void => {
      if (refuse) throw new Error("quota")
      map.set(key, value)
    },
    removeItem: (key): void => void map.delete(key),
  }
}

function memoryShelf(full = false): BlobShelf & { blobs: Map<string, Blob> } {
  const blobs = new Map<string, Blob>()
  return {
    blobs,
    put: (id, blob): Promise<void> => {
      if (full) return Promise.reject(new ShelfFullError())
      blobs.set(id, blob)
      return Promise.resolve()
    },
    get: (id): Promise<Blob | null> => Promise.resolve(blobs.get(id) ?? null),
    remove: (ids): Promise<void> => {
      for (const id of ids) blobs.delete(id)
      return Promise.resolve()
    },
    ids: (): Promise<Array<string>> => Promise.resolve([...blobs.keys()]),
  }
}

describe("the record of game bites", () => {
  it("adds a bite once", () => {
    const once = stepGameBites([], { kind: "kept", bite: bite("b1") }, T0)
    expect(once).toEqual([bite("b1")])
    if (typeof once === "string") throw new Error(once)
    expect(stepGameBites(once, { kind: "kept", bite: bite("b1") }, T0)).toBe(
      once
    )
  })

  it("says a held-back bite again, releases it, or throws it away", () => {
    const held = [bite("b1")]
    expect(
      stepGameBites(
        held,
        { kind: "amended", id: "b1", fields: { how: "offered" }, holdUntil: 9 },
        T0
      )
    ).toEqual([{ ...bite("b1"), fields: { how: "offered" }, holdUntil: 9 }])
    expect(stepGameBites(held, { kind: "released", id: "b1" }, T0)).toEqual([
      { ...bite("b1"), holdUntil: T0 },
    ])
    expect(stepGameBites(held, { kind: "undone", id: "b1" }, T0)).toEqual([])
  })

  it("refuses to change or throw away a bite on its way home", () => {
    const going = [bite("b1", T0)]
    for (const event of [
      { kind: "amended", id: "b1", fields: {}, holdUntil: T0 + 1 },
      { kind: "undone", id: "b1" },
    ] as const) {
      expect(stepGameBites(going, event, T0)).toBe("on-its-way")
    }
    expect(stepGameBites(going, { kind: "released", id: "b1" }, T0)).toBe(going)
    expect(stepGameBites(going, { kind: "undone", id: "b9" }, T0)).toBe(
      "unknown"
    )
    expect(isReady(bite("b1", T0), T0)).toBe(true)
  })

  it("reads back what it stored, and nothing else", () => {
    const stored = [bite("b1"), bite("b2")]
    expect(parseGameBites(JSON.stringify(stored))).toEqual(stored)
    for (const raw of [
      "not json",
      "{}",
      JSON.stringify([{ ...bite("b1"), fields: { how: 1 } }]),
      JSON.stringify([{ ...bite("b1"), holdUntil: "soon" }]),
    ]) {
      expect(parseGameBites(raw)).toBeNull()
    }
  })
})

describe("createGameBites", () => {
  it("keeps the audio and the record together, and a later launch reads them", async () => {
    const storage = memoryStorage()
    const shelf = memoryShelf()
    const store = createGameBites({ storage, shelf, now: () => T0 })
    await store.keep(bite("b1"), new Blob(["said"]))
    const again = createGameBites({ storage, shelf, now: () => T0 + 10_000 })
    expect(again.getSnapshot()).toEqual([bite("b1")])
    expect(again.ready().map(({ id }) => id)).toEqual(["b1"])
    await expect(again.audio("b1")).resolves.toBeInstanceOf(Blob)
  })

  it("keeps nothing it cannot keep whole, and says so", async () => {
    const refusing = memoryShelf()
    const noRecord = createGameBites({
      storage: memoryStorage(true),
      shelf: refusing,
      now: () => T0,
    })
    await expect(noRecord.keep(bite("b1"), new Blob(["x"]))).rejects.toThrow()
    expect(refusing.blobs.size).toBe(0)

    const full = createGameBites({
      storage: memoryStorage(),
      shelf: memoryShelf(true),
      now: () => T0,
    })
    await expect(full.keep(bite("b1"), new Blob(["x"]))).rejects.toThrow()
    expect(full.getSnapshot()).toEqual([])
  })

  it("runs calls in the order made: an Undo right after a keep finds the bite", async () => {
    const shelf = memoryShelf()
    const store = createGameBites({
      storage: memoryStorage(),
      shelf,
      now: () => T0,
    })
    const kept = store.keep(bite("b1"), new Blob(["x"]))
    const undone = store.undo("b1")
    await Promise.all([kept, undone])
    expect(store.getSnapshot()).toEqual([])
    expect(shelf.blobs.size).toBe(0)
  })

  it("holds a bite back until released, then never lets it go", async () => {
    let now = T0
    const store = createGameBites({
      storage: memoryStorage(),
      shelf: memoryShelf(),
      now: () => now,
    })
    await store.keep(bite("b1"), new Blob(["x"]))
    expect(store.ready()).toEqual([])
    await store.release("b1")
    expect(store.ready().map(({ id }) => id)).toEqual(["b1"])
    now += 1
    await expect(store.undo("b1")).rejects.toThrow()
    expect(store.getSnapshot().map(({ id }) => id)).toEqual(["b1"])
  })

  it("moves an unreadable record aside rather than writing over it", () => {
    const storage = memoryStorage()
    storage.map.set("some-ui:game-bites", "[{broken")
    const store = createGameBites({
      storage,
      shelf: memoryShelf(),
      now: () => T0,
    })
    expect(store.getSnapshot()).toEqual([])
    expect(
      [...storage.map.keys()].some((key) =>
        key.startsWith("some-ui:game-bites.unreadable.")
      )
    ).toBe(true)
  })

  it("sweeps audio no bite names, and keeps what one does", async () => {
    const shelf = memoryShelf()
    const store = createGameBites({
      storage: memoryStorage(),
      shelf,
      now: () => T0,
    })
    await store.keep(bite("b1"), new Blob(["x"]))
    shelf.blobs.set("orphan", new Blob(["y"]))
    store.sweep()
    await store.release("b1")
    expect([...shelf.blobs.keys()]).toEqual(["b1"])
  })
})
