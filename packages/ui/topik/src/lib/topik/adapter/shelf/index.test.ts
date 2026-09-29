import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { TopikMetadata } from "@topik/lib/topik"
import { serializePastedLesson } from "@topik/lib/topik/adapter/pasted-lesson"
import { describe, expect, it } from "vitest"

import { keptLessonOf, shelfFailureOf, shelfKeyOf } from "."

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
