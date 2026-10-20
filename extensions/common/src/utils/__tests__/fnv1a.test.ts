import { fnv1a } from "@common/utils/fnv1a"
import { describe, expect, it } from "vitest"

describe("fnv1a", () => {
  it("matches the reference vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5)
    expect(fnv1a("a")).toBe(0xe40c292c)
    expect(fnv1a("foobar")).toBe(0xbf9cf968)
  })
})
