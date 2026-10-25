/**
 * The store of voice notes on their way home (`../runtime`): a note's audio
 * copied once, before the record names it; a shelf with no room leaving it
 * to wait; a copy kept until home holds its note, and kept for good when
 * home refuses it; the record read back on the next launch; and the sweep
 * clearing only copies nothing names.
 */
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { BlobShelf } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import type { VoiceOut } from "@/lib/voice-home/model"
import { createVoiceHome } from "@/lib/voice-home/runtime"

const note = (id: string): VoiceOut => ({
  id,
  of: "scene",
  ref: "drama-20261025T031000000Z",
  at: "2026-10-25T03:10:00.000Z",
  contentType: "audio/ogg",
})

/** An in-memory shelf, refusing more than `room` blobs. */
function shelf(room = Infinity): BlobShelf & { held: Map<string, Blob> } {
  const held = new Map<string, Blob>()
  return {
    held,
    put: (id, blob): Promise<void> => {
      if (held.size >= room) return Promise.reject(new ShelfFullError())
      held.set(id, blob)
      return Promise.resolve()
    },
    get: (id) => Promise.resolve(held.get(id) ?? null),
    remove: (ids): Promise<void> => {
      for (const id of ids) held.delete(id)
      return Promise.resolve()
    },
    ids: () => Promise.resolve([...held.keys()]),
  }
}

const encode = (): Promise<{ base64: string; sha256: string }> =>
  Promise.resolve({ base64: "", sha256: "" })

describe("the voice notes on their way home", () => {
  it("copies a note's audio once, and tells whoever listens", async () => {
    const s = shelf()
    const home = createVoiceHome({ storage: memoryStorage(), shelf: s, encode })
    const heard = vi.fn()
    home.subscribe(heard)
    await Promise.all([
      home.copy(note("n1"), new Blob(["a"])),
      home.copy(note("n1"), new Blob(["b"])),
    ])
    expect(await s.held.get("n1")?.text()).toBe("a")
    expect(home.getSnapshot().waiting).toEqual([note("n1")])
    expect(home.settled("n1")).toBe(true)
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it("leaves a note with no room waiting, and copies it once there is room", async () => {
    const s = shelf(1)
    const home = createVoiceHome({ storage: memoryStorage(), shelf: s, encode })
    await home.copy(note("n1"), new Blob(["a"]))
    await home.copy(note("n2"), new Blob(["b"]))
    expect(home.getSnapshot()).toMatchObject({
      waiting: [note("n1")],
      roomless: ["n2"],
    })
    expect(home.settled("n2")).toBe(false)
    home.keeping.answered({ kind: "held", id: "n1" })
    await Promise.resolve()
    await home.copy(note("n2"), new Blob(["b"]))
    expect(home.getSnapshot()).toMatchObject({
      waiting: [note("n2")],
      held: ["n1"],
      roomless: [],
    })
  })

  it("lets a copy go once home holds its note, and keeps one home refused", async () => {
    const s = shelf()
    const home = createVoiceHome({ storage: memoryStorage(), shelf: s, encode })
    await home.copy(note("n1"), new Blob(["a"]))
    await home.copy(note("n2"), new Blob(["b"]))
    home.keeping.answered({ kind: "held", id: "n1" })
    home.keeping.answered({ kind: "refused", id: "n2", why: "x" })
    await Promise.resolve()
    expect([...s.held.keys()]).toEqual(["n2"])
    expect(await home.keeping.audio("n2")).not.toBeNull()
  })

  it("reads its record back on the next launch, and sweeps only copies nothing names", async () => {
    const storage = memoryStorage()
    const s = shelf()
    const first = createVoiceHome({ storage, shelf: s, encode })
    await first.copy(note("n1"), new Blob(["a"]))
    await first.copy(note("n2"), new Blob(["b"]))
    first.keeping.answered({ kind: "refused", id: "n2", why: "x" })
    s.held.set("stray", new Blob(["c"]))

    const next = createVoiceHome({ storage, shelf: s, encode })
    expect(next.getSnapshot()).toEqual(first.getSnapshot())
    next.sweep()
    await vi.waitFor(() => {
      expect([...s.held.keys()].sort()).toEqual(["n1", "n2"])
    })
  })

  it("counts no copy the record can't keep in storage, and lets its audio go", async () => {
    for (const storage of [
      null,
      {
        ...memoryStorage(),
        setItem: (): void => {
          throw new Error("quota")
        },
      },
    ]) {
      const s = shelf()
      const home = createVoiceHome({ storage, shelf: s, encode })
      await home.copy(note("n1"), new Blob(["a"]))
      expect(home.getSnapshot().waiting).toEqual([])
      expect(home.settled("n1")).toBe(false)
      expect(s.held.size).toBe(0)
    }
  })
})
