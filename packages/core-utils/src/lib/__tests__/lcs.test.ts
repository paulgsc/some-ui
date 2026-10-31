import { lcsTable } from "@core-utils/lib/lcs"
import { describe, expect, it } from "vitest"

describe("lcsTable", () => {
  it("holds the longest common subsequence of every pair of suffixes", () => {
    const table = lcsTable(["a", "b", "c", "d"], ["b", "x", "d", "a"])
    expect(table[0]?.[0]).toBe(2)
    expect(table[2]?.[0]).toBe(1)
    expect(table[0]?.[3]).toBe(1)
    expect(table[4]?.[0]).toBe(0)
    expect(table).toHaveLength(5)
    expect(table[0]).toHaveLength(5)
  })

  it("is all zeros against an empty sequence", () => {
    expect(lcsTable([1, 2], [])).toEqual([[0], [0], [0]])
  })
})
