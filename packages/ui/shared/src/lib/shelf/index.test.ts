import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import type { ShelfPort } from "."
import { keepWithoutReplacing, plainShelfKey, shelfFailureOf } from "."

describe("plainShelfKey", () => {
  it("keeps a plain name as it is", () => {
    expect(plainShelfKey("count-present", "round")).toBe("count-present")
  })

  it("holds any other name to the shelf's key rule", () => {
    expect(plainShelfKey("my round: pairs", "round")).toBe("my-round-pairs")
    expect(plainShelfKey("http-basics", "lesson")).toBe("lesson-http-basics")
    expect(plainShelfKey(".hidden.json", "round")).toBe("hidden")
    expect(plainShelfKey("notes.json.json", "lesson")).toBe("notes")
    expect(plainShelfKey("::", "round")).toBe("-")
    expect(plainShelfKey(".", "lesson")).toBe("lesson")
    expect(plainShelfKey("Notes.JSON", "lesson")).toBe("Notes")
  })

  it("stays linear on many .json repeats, ending the name or not", () => {
    const repeats = ".json".repeat(50_000)
    const started = performance.now()
    expect(plainShelfKey(`${repeats}x`, "round")).toBe(`${repeats.slice(1)}x`)
    expect(plainShelfKey(`notes${repeats}`, "round")).toBe("notes")
    expect(plainShelfKey(repeats.toUpperCase(), "round")).toBe("round")
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe("shelfFailureOf", () => {
  it("reads the host's reason, and calls anything else a failure", () => {
    expect(shelfFailureOf(Object.assign(new Error(), { reason: "full" }))).toBe(
      "full"
    )
    expect(shelfFailureOf({ reason: "signed-out" })).toBe("signed-out")
    expect(shelfFailureOf({ reason: "invalid" })).toBe("invalid")
    expect(shelfFailureOf(new Error("offline"))).toBe("failed")
    expect(shelfFailureOf({ reason: "other" })).toBe("failed")
  })
})

describe("keepWithoutReplacing", () => {
  const sha256 = (body: string): string =>
    createHash("sha256").update(body).digest("hex")

  function port(held: Record<string, string>): ShelfPort & {
    held: Map<string, string>
  } {
    const bodies = new Map(Object.entries(held))
    return {
      held: bodies,
      list: vi.fn(() =>
        Promise.resolve({
          items: [...bodies].map(([key, body]) => ({
            key,
            contentHash: sha256(body),
            savedAt: "2026-09-29T00:00:00.000Z",
          })),
          cap: 20,
        })
      ),
      read: vi.fn(),
      keep: vi.fn((key: string, body: string) => {
        bodies.set(key, body)
        return Promise.resolve({
          change: "kept" as const,
          item: { key, contentHash: sha256(body), savedAt: "" },
        })
      }),
      remove: vi.fn(),
    }
  }

  it("keeps under the name when the shelf does not hold it", async () => {
    const shelf = port({})
    await expect(keepWithoutReplacing(shelf, "k", "{}")).resolves.toEqual({
      change: "kept",
      key: "k",
    })
    expect(shelf.held.get("k")).toBe("{}")
  })

  it("writes nothing when the same bytes are already kept", async () => {
    const shelf = port({ k: "{}" })
    await expect(keepWithoutReplacing(shelf, "k", "{}")).resolves.toEqual({
      change: "unchanged",
      key: "k",
    })
    expect(shelf.keep).not.toHaveBeenCalled()
  })

  it("never replaces a different item that holds the name", async () => {
    const shelf = port({ k: '{"a":1}', "k-2": '{"a":2}' })
    await expect(keepWithoutReplacing(shelf, "k", '{"a":3}')).resolves.toEqual({
      change: "kept",
      key: "k-3",
    })
    expect(shelf.held.get("k")).toBe('{"a":1}')
    expect(shelf.held.get("k-2")).toBe('{"a":2}')
    await expect(keepWithoutReplacing(shelf, "k", '{"a":2}')).resolves.toEqual({
      change: "unchanged",
      key: "k-2",
    })
  })

  it("keeps a body that depends on its key under the key it lands on", async () => {
    const shelf = port({ k: '{"key":"k","a":1}' })
    const bodyAt = (key: string): string => JSON.stringify({ key, a: 2 })
    await expect(keepWithoutReplacing(shelf, "k", bodyAt)).resolves.toEqual({
      change: "kept",
      key: "k-2",
    })
    expect(shelf.held.get("k-2")).toBe('{"key":"k-2","a":2}')
    await expect(keepWithoutReplacing(shelf, "k", bodyAt)).resolves.toEqual({
      change: "unchanged",
      key: "k-2",
    })
  })

  it("finds the same bytes past a gap before taking the free key", async () => {
    const shelf = port({ k: '{"a":1}', "k-3": '{"a":3}' })
    await expect(keepWithoutReplacing(shelf, "k", '{"a":3}')).resolves.toEqual({
      change: "unchanged",
      key: "k-3",
    })
    expect(shelf.keep).not.toHaveBeenCalled()
  })

  it("compares what is kept where Web Crypto is not available", async () => {
    vi.stubGlobal("crypto", {})
    try {
      const shelf = port({ k: '{"a":1}' })
      shelf.read = vi.fn((key: string) => {
        const kept: unknown = JSON.parse(shelf.held.get(key)!)
        return Promise.resolve(kept)
      })
      await expect(
        keepWithoutReplacing(shelf, "k", '{"a":1}')
      ).resolves.toEqual({
        change: "unchanged",
        key: "k",
      })
      await expect(
        keepWithoutReplacing(shelf, "k", '{"a":2}')
      ).resolves.toEqual({
        change: "kept",
        key: "k-2",
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("finds the same bytes under any held copy, past the scan window", async () => {
    // Only `k-5` is left after removals; keeping its item again is it.
    const shelf = port({ "k-5": '{"a":5}' })
    await expect(keepWithoutReplacing(shelf, "k", '{"a":5}')).resolves.toEqual({
      change: "unchanged",
      key: "k-5",
    })
    expect(shelf.keep).not.toHaveBeenCalled()
  })
})
