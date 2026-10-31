import { readingOf } from "@topik/lib/topik/adapter/host-places"
import { describe, expect, it } from "vitest"

describe("readingOf (SS2: the open drill, as a host hands it back)", () => {
  it("reads a drill kept whole", () => {
    expect(
      readingOf({ set: "s1", begin: true, lines: ["a"], practice: "lens" })
    ).toEqual({ set: "s1", begin: true, lines: ["a"], practice: "lens" })
    expect(readingOf({ set: null })).toEqual({ set: null })
  })

  it.each([
    ["nothing kept", undefined],
    ["a closed drill", null],
    ["a set that is not a name", { set: 3 }],
    ["lines that are not ids", { set: "s1", lines: [1] }],
    ["a practice this build lacks", { set: "s1", practice: "dance" }],
    ["a begin that is not a flag", { set: "s1", begin: "yes" }],
  ])("reads no drill from %s", (_, value) => {
    expect(readingOf(value)).toBeNull()
  })
})
