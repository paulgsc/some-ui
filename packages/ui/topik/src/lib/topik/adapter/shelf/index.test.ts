import { serializePastedTree } from "@topik/lib/topik/adapter/pasted-lesson"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

import { keptLessonOf, treeShelfKeyOf } from "."

describe("keptLessonOf", () => {
  it("reads back a kept scene tree through both audits (MK4)", () => {
    const body: unknown = JSON.parse(serializePastedTree(workedLesson()))
    expect(keptLessonOf(body)).toEqual(workedLesson())
    // A tree edited to name a feeling the renderer lacks is not played.
    const edited: unknown = JSON.parse(
      JSON.stringify(body).replace('"feeling":"tension"', '"feeling":"ennui"')
    )
    expect(keptLessonOf(edited)).toBeNull()
  })

  it("reads a conversation lesson an earlier build kept as unreadable", () => {
    const conversation = {
      version: 1,
      meta: { key: "local:first-dinner", displayName: "The first dinner" },
      batches: [{ id: 1, messages: [] }],
    }
    expect(keptLessonOf(conversation)).toBeNull()
  })

  it("refuses a body that is not a kept tree", () => {
    expect(keptLessonOf({ version: 2, kind: "tree", tree: {} })).toBeNull()
    expect(keptLessonOf(["not", "a", "lesson"])).toBeNull()
    expect(keptLessonOf({ version: 1, kind: "tree", tree: {} })).toBeNull()
  })
})

describe("treeShelfKeyOf", () => {
  it("keys a tree by its lesson id, held to the shelf's key rule", () => {
    expect(treeShelfKeyOf(workedLesson())).toBe(workedLesson().id)
    expect(treeShelfKeyOf({ ...workedLesson(), id: "a b/c" })).toBe("a-b-c")
  })
})
