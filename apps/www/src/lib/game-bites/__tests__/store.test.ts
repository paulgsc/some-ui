/**
 * The game bites kept on this phone (`../model`, `../runtime`): a bite is
 * kept whole or not at all, one the phone could not keep is held by the
 * store and tried again, nothing lets it go but Undo while it is held back,
 * no audio a record might name is deleted, and an unreadable record is
 * moved aside, never written over (GW3).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import type { KeptBite } from "@some-ui/game-week"
import type { BlobShelf } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import { isReady, parseGameBites, stepGameBites } from "@/lib/game-bites/model"
import type { GameBitesPorts } from "@/lib/game-bites/runtime"
import { createGameBites, RETRY_MS } from "@/lib/game-bites/runtime"

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
  refuse: boolean
} {
  const map = new Map<string, string>()
  return {
    map,
    refuse,
    getItem: (key): string | null => map.get(key) ?? null,
    setItem(key, value): void {
      if (this.refuse) throw new Error("quota")
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

/** A clock the test moves, with the timers it runs and the page's visibility. */
function world(start = T0): {
  ports: Pick<GameBitesPorts, "now" | "after" | "onVisibility">
  advance: (ms: number) => Promise<void>
  show: () => Promise<void>
} {
  let now = start
  let timers: Array<{ at: number; run: () => void }> = []
  const visibility = new Set<(hidden: boolean) => void>()
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  return {
    ports: {
      now: () => now,
      after: (ms, run): (() => void) => {
        const timer = { at: now + ms, run }
        timers.push(timer)
        return (): void => {
          timers = timers.filter((each) => each !== timer)
        }
      },
      onVisibility: (listener): (() => void) => {
        visibility.add(listener)
        listener(false)
        return () => visibility.delete(listener)
      },
    },
    async advance(ms): Promise<void> {
      now += ms
      const due = timers.filter(({ at }) => at <= now)
      timers = timers.filter(({ at }) => at > now)
      for (const { run } of due) run()
      await settle()
    },
    async show(): Promise<void> {
      for (const listener of visibility) listener(false)
      await settle()
    },
  }
}

describe("createGameBites", () => {
  it("keeps the audio and the record together, and a later launch reads them", async () => {
    const storage = memoryStorage()
    const shelf = memoryShelf()
    const store = createGameBites({ storage, shelf, ...world().ports })
    await store.keep(bite("b1"), new Blob(["said"]))
    const again = createGameBites({
      storage,
      shelf,
      ...world(T0 + 10_000).ports,
    })
    expect(again.getSnapshot()).toEqual([bite("b1")])
    expect(again.ready().map(({ id }) => id)).toEqual(["b1"])
    await expect(again.audio("b1")).resolves.toBeInstanceOf(Blob)
  })

  it("keeps nothing it cannot keep whole, and holds the bite to try again", async () => {
    const refusing = memoryShelf()
    const noRecord = createGameBites({
      storage: memoryStorage(true),
      shelf: refusing,
      ...world().ports,
    })
    await expect(noRecord.keep(bite("b1"), new Blob(["x"]))).rejects.toThrow()
    expect(refusing.blobs.size).toBe(0)
    expect(noRecord.unkept()).toBe(1)

    const full = createGameBites({
      storage: memoryStorage(),
      shelf: memoryShelf(true),
      ...world().ports,
    })
    await expect(full.keep(bite("b1"), new Blob(["x"]))).rejects.toThrow()
    expect(full.getSnapshot()).toEqual([])
    expect(full.unkept()).toBe(1)
  })

  it("keeps a held bite once the phone can, on its timer or when the page comes back", async () => {
    for (const comeBack of ["timer", "shown"] as const) {
      const storage = memoryStorage(true)
      const shelf = memoryShelf()
      const clock = world()
      const store = createGameBites({ storage, shelf, ...clock.ports })
      let heard = 0
      store.subscribe(() => (heard += 1))
      await expect(store.keep(bite("b1"), new Blob(["x"]))).rejects.toThrow()
      await clock.advance(RETRY_MS)
      expect(store.unkept()).toBe(1)
      expect(store.isKept("b1")).toBe(false)
      storage.refuse = false
      heard = 0
      if (comeBack === "timer") await clock.advance(RETRY_MS)
      else await clock.show()
      expect(store.unkept()).toBe(0)
      expect(store.isKept("b1")).toBe(true)
      expect(store.getSnapshot().map(({ id }) => id)).toEqual(["b1"])
      expect(shelf.blobs.has("b1")).toBe(true)
      expect(heard).toBeGreaterThan(0)
    }
  })

  it("applies an answer and Undo to a bite it holds (A6)", async () => {
    const storage = memoryStorage(true)
    const clock = world()
    const store = createGameBites({
      storage,
      shelf: memoryShelf(),
      ...clock.ports,
    })
    const kept = store.keep(bite("b1", T0 + 600_000), new Blob(["x"]))
    const answered = store.amend("b1", { how: "offered" }, T0 + 5_000)
    await expect(kept).rejects.toThrow()
    await expect(answered).resolves.toBe("noted")
    storage.refuse = false
    await clock.show()
    expect(store.getSnapshot()).toEqual([
      { ...bite("b1"), fields: { how: "offered" }, holdUntil: T0 + 5_000 },
    ])

    storage.refuse = true
    await expect(store.keep(bite("b2"), new Blob(["y"]))).rejects.toThrow()
    await store.undo("b2")
    expect(store.unkept()).toBe(0)
  })

  it("Undo throws away a bite it holds only while the bite's hold lasts", async () => {
    const storage = memoryStorage(true)
    const clock = world()
    const store = createGameBites({
      storage,
      shelf: memoryShelf(),
      ...clock.ports,
    })
    await expect(store.keep(bite("b1"), new Blob(["x"]))).rejects.toThrow()
    await clock.advance(5_000)
    await expect(store.undo("b1")).rejects.toThrow()
    expect(store.unkept()).toBe(1)
    storage.refuse = false
    await clock.show()
    expect(store.isKept("b1")).toBe(true)
  })

  it("answers an answer that comes after the hold as too late, changing nothing", async () => {
    for (const keptFirst of [true, false]) {
      const storage = memoryStorage(!keptFirst)
      const clock = world()
      const store = createGameBites({
        storage,
        shelf: memoryShelf(),
        ...clock.ports,
      })
      await store.keep(bite("b1"), new Blob(["x"])).catch(() => undefined)
      await clock.advance(5_000)
      await expect(
        store.amend("b1", { how: "offered" }, T0 + 10_000)
      ).resolves.toBe("on-its-way")
      storage.refuse = false
      await clock.show()
      expect(store.getSnapshot()).toEqual([bite("b1")])
      await expect(store.amend("b9", {}, T0 + 10_000)).rejects.toThrow()
    }
  })

  it("runs calls in the order made: an Undo right after a keep finds the bite", async () => {
    const shelf = memoryShelf()
    const store = createGameBites({
      storage: memoryStorage(),
      shelf,
      ...world().ports,
    })
    const kept = store.keep(bite("b1"), new Blob(["x"]))
    const undone = store.undo("b1")
    await Promise.all([kept, undone])
    expect(store.getSnapshot()).toEqual([])
    expect(shelf.blobs.size).toBe(0)
  })

  it("holds a bite back until released, then never lets it go", async () => {
    const clock = world()
    const store = createGameBites({
      storage: memoryStorage(),
      shelf: memoryShelf(),
      ...clock.ports,
    })
    await store.keep(bite("b1"), new Blob(["x"]))
    expect(store.ready()).toEqual([])
    await store.release("b1")
    expect(store.ready().map(({ id }) => id)).toEqual(["b1"])
    await clock.advance(1)
    await expect(store.undo("b1")).rejects.toThrow()
    expect(store.getSnapshot().map(({ id }) => id)).toEqual(["b1"])
  })

  it("wakes its listeners when a hold runs out on its own (A4)", async () => {
    const clock = world()
    const store = createGameBites({
      storage: memoryStorage(),
      shelf: memoryShelf(),
      ...clock.ports,
    })
    await store.keep(bite("b1"), new Blob(["x"]))
    let heard = 0
    store.subscribe(() => (heard += 1))
    await clock.advance(4_999)
    expect(heard).toBe(0)
    await clock.advance(1)
    expect(heard).toBe(1)
    expect(store.ready().map(({ id }) => id)).toEqual(["b1"])
  })

  it("moves an unreadable record aside rather than writing over it", () => {
    const storage = memoryStorage()
    storage.map.set("some-ui:game-bites", "[{broken")
    const store = createGameBites({
      storage,
      shelf: memoryShelf(),
      ...world().ports,
    })
    expect(store.getSnapshot()).toEqual([])
    expect(
      [...storage.map.keys()].some((key) =>
        key.startsWith("some-ui:game-bites.unreadable.")
      )
    ).toBe(true)
  })

  it("deletes no audio a record might name, however the record opened (A2)", async () => {
    const opens: Array<[string, () => KeyedStorage | null]> = [
      ["empty", (): KeyedStorage => memoryStorage()],
      [
        "moved",
        (): KeyedStorage => {
          const storage = memoryStorage()
          storage.map.set("some-ui:game-bites", "[{broken")
          return storage
        },
      ],
      [
        "unreadable",
        (): KeyedStorage => ({
          getItem: (): string => {
            throw new Error("blocked")
          },
          setItem: (): void => undefined,
          removeItem: (): void => undefined,
        }),
      ],
      ["no storage", (): null => null],
    ]
    for (const [how, storage] of opens) {
      const shelf = memoryShelf()
      shelf.blobs.set("b1", new Blob(["said"]))
      const store = createGameBites({
        storage: storage(),
        shelf,
        ...world().ports,
      })
      await store.release("b9").catch(() => undefined)
      expect([...shelf.blobs.keys()], how).toEqual(["b1"])
    }
  })

  it("adds a bite whose audio was written when the app stopped before its record (A3)", async () => {
    const storage = memoryStorage()
    const shelf = memoryShelf()
    storage.map.set("some-ui:game-bites.keeping", JSON.stringify([bite("b1")]))
    shelf.blobs.set("b1", new Blob(["said"]))
    shelf.blobs.set("named-by-nothing", new Blob(["kept anyway"]))
    const store = createGameBites({ storage, shelf, ...world().ports })
    await store.release("b1")
    expect(store.getSnapshot().map(({ id }) => id)).toEqual(["b1"])
    expect([...shelf.blobs.keys()]).toEqual(["b1", "named-by-nothing"])
    expect(storage.map.get("some-ui:game-bites.keeping")).toBe("[]")
  })
})
