import { describe, expect, it } from "vitest"

import { frictionOf } from "@soundbites/lib/project/store"

const ROW = {
  project: "p1",
  sitting: "s1",
  at: "2026-10-29T08:00:00.000Z",
  went: "snags",
  gotInTheWay: "the mic clipped",
  shot: "s3",
}

describe("a friction row as read back", () => {
  it("keeps every field report wrote", () => {
    expect(frictionOf(ROW)).toEqual(ROW)
  })

  it("reads a row from before reports named their scene, naming none", () => {
    const { shot: _, ...older } = ROW
    expect(frictionOf(older)).toEqual({ ...ROW, shot: null })
  })

  it("is null for a row that is not a report", () => {
    expect(frictionOf({ ...ROW, went: "fine" })).toBeNull()
    expect(frictionOf(null)).toBeNull()
  })
})
