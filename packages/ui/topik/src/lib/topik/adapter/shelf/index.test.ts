import { createHash } from "node:crypto"
import type { ShelfPort } from "@some-ui/shared"
import { keepWithoutReplacing } from "@some-ui/shared"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { TopikMetadata } from "@topik/lib/topik"
import type { PastedLesson } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  serializePastedLesson,
  serializePastedTree,
} from "@topik/lib/topik/adapter/pasted-lesson"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it, vi } from "vitest"

import { keptBodyOf, keptLessonOf, shelfKeyOf } from "."

/** A kept body's conversation lesson, or null when it is not one. */
const conversationOf = (body: unknown, key: string): PastedLesson | null => {
  const kept = keptLessonOf(body, key)
  return kept?.kind === "conversation" ? kept.lesson : null
}

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
    const lesson = conversationOf(kept(), "first-dinner")
    expect(lesson?.meta.key).toBe("local:first-dinner")
    expect(lesson?.meta.displayName).toBe("The first family dinner")
    expect(lesson?.batches).toHaveLength(FIXTURE_BATCHES.length)
  })

  it("derives counts as a paste does, whatever the kept entry claims", () => {
    const lesson = conversationOf(kept(), "first-dinner")
    expect(lesson?.meta.batchCount).toBe(FIXTURE_BATCHES.length)
    expect(lesson?.meta.totalMessages).toBe(
      FIXTURE_BATCHES.reduce((sum, batch) => sum + batch.messages.length, 0)
    )
  })

  it("reads back a kept scene tree through both audits (MK4)", () => {
    const body: unknown = JSON.parse(serializePastedTree(workedLesson()))
    expect(keptLessonOf(body, "first-tea")).toEqual({
      kind: "tree",
      tree: workedLesson(),
    })
    // A tree edited to name a feeling the renderer lacks is not played.
    const edited: unknown = JSON.parse(
      JSON.stringify(body).replace('"feeling":"tension"', '"feeling":"ennui"')
    )
    expect(keptLessonOf(edited, "first-tea")).toBeNull()
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

describe("keeping a replayed lesson again", () => {
  it("finds a replayed copy kept beside another, rather than keeping it again", async () => {
    // A replay of `first-dinner-2` comes back under `local:first-dinner-2`;
    // it must not be kept a third time.
    const held = new Map<string, string>()
    const shelf: ShelfPort = {
      list: () =>
        Promise.resolve({
          items: [...held].map(([key, body]) => ({
            key,
            contentHash: createHash("sha256").update(body).digest("hex"),
            savedAt: "2026-09-29T00:00:00.000Z",
          })),
          cap: 20,
        }),
      read: vi.fn(),
      keep: (key, body) => {
        held.set(key, body)
        return Promise.resolve({
          change: "kept" as const,
          item: { key, contentHash: "", savedAt: "" },
        })
      },
      remove: vi.fn(),
    }
    // Two pastes, as intake leaves them, that share a model-chosen key.
    const pasted = (meta: TopikMetadata): PastedLesson =>
      conversationOf(
        JSON.parse(serializePastedLesson(meta, FIXTURE_BATCHES)),
        "first-dinner"
      )!
    // The hook's own substitution (`keptBodyFor`), not a copy of it.
    const bodyFor =
      (lesson: PastedLesson) =>
      (key: string): string =>
        keptBodyOf(lesson, key)
    await keepWithoutReplacing(shelf, "first-dinner", bodyFor(pasted(META)))
    await expect(
      keepWithoutReplacing(
        shelf,
        "first-dinner",
        bodyFor(pasted({ ...META, displayName: "Another dinner" }))
      )
    ).resolves.toEqual({ change: "kept", key: "first-dinner-2" })

    const replayed = conversationOf(
      JSON.parse(held.get("first-dinner-2")!),
      "first-dinner-2"
    )!
    await expect(
      keepWithoutReplacing(
        shelf,
        shelfKeyOf(replayed.meta.key),
        bodyFor(replayed)
      )
    ).resolves.toEqual({ change: "unchanged", key: "first-dinner-2" })
    expect(held.size).toBe(2)
  })
})
