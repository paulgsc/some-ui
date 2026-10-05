import {
  byNewest,
  displacedBy,
  nextReplaced,
  SOUNDBITE_LIMIT,
} from "@soundbites/lib/policy"
import { describe, expect, it } from "vitest"

import { bite } from "./fixture"

/** `n` soundbites, `b0` the newest. */
function kept(n: number): Array<ReturnType<typeof bite>> {
  return Array.from({ length: n }, (_, i) => bite(`b${i}`, i * 60))
}

describe("the cap", () => {
  it("is six", () => {
    expect(SOUNDBITE_LIMIT).toBe(6)
  })

  it("displaces nothing while there is room", () => {
    expect(nextReplaced(kept(5), null)).toBeNull()
    expect(displacedBy(kept(5), "b2")).toEqual([])
  })

  it("replaces the oldest once full", () => {
    expect(nextReplaced(kept(6), null)?.id).toBe("b5")
    expect(displacedBy(kept(6), null)).toEqual(["b5"])
  })

  it("replaces the one picked instead, while it is still kept", () => {
    expect(displacedBy(kept(6), "b1")).toEqual(["b1"])
    expect(displacedBy(kept(6), "gone")).toEqual(["b5"])
  })

  it("never leaves more than the limit, even from over it", () => {
    // Only after the limit was lowered, or a racing write: eight kept.
    expect(displacedBy(kept(8), "b0")).toEqual(["b0", "b7", "b6"])
    expect(8 + 1 - displacedBy(kept(8), null).length).toBe(SOUNDBITE_LIMIT)
  })

  it("lists newest first", () => {
    expect(
      byNewest([bite("old", 90), bite("new", 1)]).map((b) => b.id)
    ).toEqual(["new", "old"])
  })
})
