import {
  byNewest,
  displacedBy,
  fitsMaxBytes,
  nextReplaced,
  SOUNDBITE_LIMIT,
  SOUNDBITES_MAX_BYTES,
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

  /** Home holds every soundbite: any may make room. */
  const all = (): boolean => true

  it("displaces nothing while there is room", () => {
    expect(nextReplaced(kept(5), null, all)).toBeNull()
    expect(displacedBy(kept(5), "b2", all)).toEqual([])
  })

  it("replaces the oldest home holds once full", () => {
    expect(nextReplaced(kept(6), null, all)?.id).toBe("b5")
    expect(displacedBy(kept(6), null, all)).toEqual(["b5"])
    const held = (id: string): boolean => id === "b2" || id === "b3"
    expect(nextReplaced(kept(6), null, held)?.id).toBe("b3")
    expect(displacedBy(kept(6), null, held)).toEqual(["b3"])
  })

  it("makes room from one set aside first, then one superseded, then the oldest", () => {
    const marked = kept(6).map((each) =>
      each.id === "b0"
        ? { ...each, standing: "set-aside" as const }
        : each.id === "b1"
          ? { ...each, standing: "earlier" as const }
          : each
    )
    expect(nextReplaced(marked, null, all)?.id).toBe("b0")
    expect(displacedBy(marked, null, all)).toEqual(["b0"])
    // Two too many: the set-aside one, then the superseded one.
    expect(displacedBy(marked, null, all, 5)).toEqual(["b0", "b1"])
    // A pick still wins.
    expect(displacedBy(marked, "b3", all)).toEqual(["b3"])
  })

  it("lets none go and refuses the next while home holds none (HF5)", () => {
    expect(nextReplaced(kept(6), null)).toBeNull()
    expect(displacedBy(kept(6), null)).toBeNull()
    expect(displacedBy(kept(6), "b1")).toBeNull()
  })

  it("replaces the one picked instead, while it is still kept and home holds it", () => {
    expect(displacedBy(kept(6), "b1", all)).toEqual(["b1"])
    expect(displacedBy(kept(6), "gone", all)).toEqual(["b5"])
    expect(displacedBy(kept(6), "b1", (id) => id === "b4")).toEqual(["b4"])
  })

  it("never leaves more than the limit, even from over it", () => {
    // Only after the limit was lowered, or a racing write: eight kept.
    expect(displacedBy(kept(8), "b0", all)).toEqual(["b0", "b7", "b6"])
    expect(8 + 1 - (displacedBy(kept(8), null, all)?.length ?? 0)).toBe(
      SOUNDBITE_LIMIT
    )
    expect(displacedBy(kept(8), null, (id) => id !== "b6")).toEqual([
      "b7",
      "b5",
      "b4",
    ])
    expect(displacedBy(kept(8), null, (id) => id === "b7")).toBeNull()
  })

  it("lists newest first", () => {
    expect(
      byNewest([bite("old", 90), bite("new", 1)]).map((b) => b.id)
    ).toEqual(["new", "old"])
  })
})

describe("the byte cap", () => {
  it("takes a soundbite up to it, and none past it", () => {
    const fifth = SOUNDBITES_MAX_BYTES / SOUNDBITE_LIMIT
    expect(fitsMaxBytes(Array(5).fill(fifth), fifth)).toBe(true)
    expect(fitsMaxBytes(Array(5).fill(fifth), fifth + 1)).toBe(false)
  })
})
