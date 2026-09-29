import { createHash } from "node:crypto"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { TopikMetadata } from "@topik/lib/topik"
import type { PastedLesson } from "@topik/lib/topik/adapter/pasted-lesson"
import { serializePastedLesson } from "@topik/lib/topik/adapter/pasted-lesson"
import { describe, expect, it, vi } from "vitest"

import type { ShelfPort } from "."
import {
  keepWithoutReplacing,
  keptLessonOf,
  shelfFailureOf,
  shelfKeyOf,
} from "."

const META: TopikMetadata = {
  key: "local:first-dinner",
  displayName: "The first family dinner",
  description: "Seo-yeon meets Chairman Kang.",
  batchCount: FIXTURE_BATCHES.length,
  totalQuestions: 0,
  totalMessages: 0,
  tags: ["topik-2"],
}

describe("shelfKeyOf", () => {
  it("strips the pasted prefix, whose colon is not a plain key character", () => {
    expect(shelfKeyOf("local:first-dinner")).toBe("first-dinner")
  })

  it("holds whatever is left to the shelf's key rule", () => {
    expect(shelfKeyOf("local:http-basics")).toBe("lesson-http-basics")
    expect(shelfKeyOf("local:.hidden")).toBe("hidden")
    expect(shelfKeyOf("local:notes.json")).toBe("notes")
    expect(shelfKeyOf("local:a b/c")).toBe("a-b-c")
    expect(shelfKeyOf("local:")).toBe("lesson")
  })
})

describe("keptLessonOf", () => {
  const kept = (): unknown =>
    JSON.parse(serializePastedLesson(META, FIXTURE_BATCHES))

  it("reads back what the pasted slot kept, under its shelf key", () => {
    const lesson = keptLessonOf(kept(), "first-dinner")
    expect(lesson?.meta.key).toBe("local:first-dinner")
    expect(lesson?.meta.displayName).toBe("The first family dinner")
    expect(lesson?.batches).toHaveLength(FIXTURE_BATCHES.length)
  })

  it("derives counts as a paste does, whatever the kept entry claims", () => {
    const lesson = keptLessonOf(kept(), "first-dinner")
    expect(lesson?.meta.batchCount).toBe(FIXTURE_BATCHES.length)
    expect(lesson?.meta.totalMessages).toBe(
      FIXTURE_BATCHES.reduce((sum, batch) => sum + batch.messages.length, 0)
    )
  })

  it("refuses a body that is not a kept lesson", () => {
    expect(keptLessonOf({ version: 2, meta: {}, batches: [] }, "k")).toBeNull()
    expect(keptLessonOf(["not", "a", "lesson"], "k")).toBeNull()
    expect(keptLessonOf({ version: 1, meta: {}, batches: [] }, "k")).toBeNull()
    expect(
      keptLessonOf({ version: 1, meta: {}, batches: [{ id: "x" }] }, "k")
    ).toBeNull()
  })
})

describe("shelfFailureOf", () => {
  it("reads the host's reason, and calls anything else a failure", () => {
    expect(shelfFailureOf(Object.assign(new Error(), { reason: "full" }))).toBe(
      "full"
    )
    expect(shelfFailureOf({ reason: "signed-out" })).toBe("signed-out")
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

  it("finds a replayed copy kept beside another, rather than keeping it again", async () => {
    // Confirming review, #1600: a replay of `first-dinner-2` came back under
    // `local:first-dinner-2` and was kept a third time.
    // Two pastes, as intake leaves them, that share a model-chosen key.
    const pasted = (meta: TopikMetadata): PastedLesson =>
      keptLessonOf(
        JSON.parse(serializePastedLesson(meta, FIXTURE_BATCHES)),
        "first-dinner"
      )!
    const bodyFor =
      (lesson: PastedLesson) =>
      (key: string): string =>
        serializePastedLesson(
          { ...lesson.meta, key: `local:${key}` },
          lesson.batches
        )
    const shelf = port({})
    await keepWithoutReplacing(shelf, "first-dinner", bodyFor(pasted(META)))
    await expect(
      keepWithoutReplacing(
        shelf,
        "first-dinner",
        bodyFor(pasted({ ...META, displayName: "Another dinner" }))
      )
    ).resolves.toEqual({ change: "kept", key: "first-dinner-2" })

    const replayed = keptLessonOf(
      JSON.parse(shelf.held.get("first-dinner-2")!),
      "first-dinner-2"
    )!
    await expect(
      keepWithoutReplacing(
        shelf,
        shelfKeyOf(replayed.meta.key),
        bodyFor(replayed)
      )
    ).resolves.toEqual({ change: "unchanged", key: "first-dinner-2" })
    expect(shelf.held.size).toBe(2)
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
})
