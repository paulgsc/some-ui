import type { LcsStep } from "@core-utils/lib/lcs"
import { lcsAlignment, lcsTable } from "@core-utils/lib/lcs"
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

  it("compares items with the test it is given", () => {
    const near = (x: number, y: number): boolean => Math.abs(x - y) <= 1
    expect(lcsTable([1, 5, 9], [2, 9, 10], near)[0]?.[0]).toBe(2)
    expect(lcsTable([1, 5, 9], [2, 9, 10])[0]?.[0]).toBe(1)
  })

  it("is all zeros against an empty sequence", () => {
    expect(lcsTable([1, 2], [])).toEqual([[0], [0], [0]])
  })
})

describe("lcsAlignment", () => {
  it("walks one longest alignment, each side's own items in order, a's first where they part", () => {
    const read = (steps: ReadonlyArray<LcsStep<string>>): string =>
      steps
        .map((step) =>
          step.kind === "both"
            ? step.a
            : step.kind === "a"
              ? `-${step.a}`
              : `+${step.b}`
        )
        .join(" ")
    expect(read(lcsAlignment(["a", "b", "c", "d"], ["b", "x", "d", "a"]))).toBe(
      "-a b -c +x d +a"
    )
    expect(read(lcsAlignment(["a"], []))).toBe("-a")
    expect(read(lcsAlignment([], ["a"]))).toBe("+a")
  })

  it("pairs items under the test it is given", () => {
    const near = (x: number, y: number): boolean => Math.abs(x - y) <= 1
    expect(lcsAlignment([1, 5, 9], [2, 9, 10], near)).toEqual([
      { kind: "both", a: 1, b: 2 },
      { kind: "a", a: 5 },
      { kind: "both", a: 9, b: 9 },
      { kind: "b", b: 10 },
    ])
  })
})
