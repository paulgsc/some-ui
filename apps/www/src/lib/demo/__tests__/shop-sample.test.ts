import { describe, expect, it } from "vitest"

import { sampleLookup, sampleShop } from "@/lib/demo/shop-sample"

describe("the capture build's sample shop", () => {
  it("finds a shelf phrase for a hunch it holds, and answers any other as a miss", () => {
    expect(sampleLookup("Where's my phone?")).toEqual({
      kind: "hit",
      phrases: ["ph.where-is-my-phone"],
    })
    expect(sampleLookup("I need a plumber")).toEqual({ kind: "kept" })
  })

  it("keeps nothing", () => {
    expect(sampleShop.keep("I need a plumber", "r-1")).toBe(false)
  })
})
