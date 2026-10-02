import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import { describe, expect, it } from "vitest"

import { keptRoundOf, shelfKeyOf } from "."

const ROUND = AUTHORED_ROUNDS[0]!

describe("shelfKeyOf", () => {
  it("keeps a plain round id as it is", () => {
    expect(shelfKeyOf("count-present")).toBe("count-present")
  })

  it("holds any other id to the shelf's key rule", () => {
    expect(shelfKeyOf("my round: pairs")).toBe("my-round-pairs")
    expect(shelfKeyOf("http-cache")).toBe("round-http-cache")
    expect(shelfKeyOf(".hidden.json")).toBe("hidden")
    expect(shelfKeyOf("::")).toBe("-")
    expect(shelfKeyOf(".")).toBe("round")
  })
})

describe("keptRoundOf", () => {
  it("reads back a kept round through the paste's own check", () => {
    const kept: unknown = JSON.parse(serializeRound(ROUND))
    expect(keptRoundOf(kept)?.id).toBe(ROUND.id)
  })

  it("refuses a body the check refuses", () => {
    expect(keptRoundOf({ ...ROUND, diffOptions: [] })).toBeNull()
    expect(keptRoundOf([ROUND])).toBeNull()
    expect(keptRoundOf({ id: "x" })).toBeNull()
  })
})
