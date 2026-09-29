import { createHash } from "node:crypto"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import { describe, expect, it, vi } from "vitest"

import type { ShelfPort } from "."
import {
  keepWithoutReplacing,
  keptRoundOf,
  shelfFailureOf,
  shelfKeyOf,
} from "."

const ROUND = AUTHORED_ROUNDS[0]!

describe("shelfKeyOf", () => {
  it("keeps a plain round id as it is", () => {
    expect(shelfKeyOf("count-present")).toBe("count-present")
  })

  it("holds any other id to the shelf's key rule", () => {
    expect(shelfKeyOf("my round: pairs")).toBe("my-round-pairs")
    expect(shelfKeyOf("http-cache")).toBe("round-http-cache")
    expect(shelfKeyOf(".hidden.json")).toBe("hidden")
    expect(shelfKeyOf("::")).toBe("-")
    expect(shelfKeyOf(".")).toBe("round")
  })
})

describe("keptRoundOf", () => {
  it("reads back a kept round through the paste's own check", () => {
    const kept: unknown = JSON.parse(serializeRound(ROUND))
    expect(keptRoundOf(kept)?.id).toBe(ROUND.id)
  })

  it("refuses a body the check refuses", () => {
    expect(keptRoundOf({ ...ROUND, diffOptions: [] })).toBeNull()
    expect(keptRoundOf([ROUND])).toBeNull()
    expect(keptRoundOf({ id: "x" })).toBeNull()
  })
})

describe("shelfFailureOf", () => {
  it("reads the host's reason, and calls anything else a failure", () => {
    expect(shelfFailureOf({ reason: "full" })).toBe("full")
    expect(shelfFailureOf({ reason: "signed-out" })).toBe("signed-out")
    expect(shelfFailureOf(new Error("offline"))).toBe("failed")
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
})
