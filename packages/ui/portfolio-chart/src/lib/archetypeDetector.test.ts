import { describe, expect, it } from "vitest"

import type { Leg } from "../types"
import { detectArchetype } from "./archetypeDetector"

let nextId = 0
function leg(overrides: Partial<Leg>): Leg {
  nextId += 1
  return {
    id: `leg-${nextId}`,
    optionType: "call",
    side: "long",
    strike: 100,
    expiry: "2025-01-17",
    quantity: 1,
    premium: 1,
    iv: 0.3,
    ...overrides,
  }
}

describe("detectArchetype — degenerate input", () => {
  it("returns 'custom' for an empty position", () => {
    expect(detectArchetype([])).toBe("custom")
  })
})

describe("detectArchetype — single leg", () => {
  it("classifies a lone long call", () => {
    expect(detectArchetype([leg({ optionType: "call", side: "long" })])).toBe(
      "long call"
    )
  })

  it("classifies a lone short call", () => {
    expect(detectArchetype([leg({ optionType: "call", side: "short" })])).toBe(
      "short call"
    )
  })

  it("classifies a lone long put", () => {
    expect(detectArchetype([leg({ optionType: "put", side: "long" })])).toBe(
      "long put"
    )
  })

  it("classifies a lone short put", () => {
    expect(detectArchetype([leg({ optionType: "put", side: "short" })])).toBe(
      "short put"
    )
  })
})

describe("detectArchetype — two-leg straddle/strangle", () => {
  it("classifies same-strike call+put as a straddle, keyed by side", () => {
    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 100, side: "long" }),
        leg({ optionType: "put", strike: 100, side: "long" }),
      ])
    ).toBe("long straddle")

    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 100, side: "short" }),
        leg({ optionType: "put", strike: 100, side: "short" }),
      ])
    ).toBe("short straddle")
  })

  it("classifies call-strike-above-put-strike as a strangle, keyed by side", () => {
    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 110, side: "long" }),
        leg({ optionType: "put", strike: 90, side: "long" }),
      ])
    ).toBe("long strangle")

    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 110, side: "short" }),
        leg({ optionType: "put", strike: 90, side: "short" }),
      ])
    ).toBe("short strangle")
  })
})

describe("detectArchetype — two-leg verticals", () => {
  it("classifies call verticals by which strike is long vs short", () => {
    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 95, side: "long" }),
        leg({ optionType: "call", strike: 105, side: "short" }),
      ])
    ).toBe("bull call spread")

    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 95, side: "short" }),
        leg({ optionType: "call", strike: 105, side: "long" }),
      ])
    ).toBe("bear call spread")
  })

  it("classifies put verticals by which strike is long vs short", () => {
    expect(
      detectArchetype([
        leg({ optionType: "put", strike: 95, side: "short" }),
        leg({ optionType: "put", strike: 105, side: "long" }),
      ])
    ).toBe("bear put spread")

    expect(
      detectArchetype([
        leg({ optionType: "put", strike: 95, side: "long" }),
        leg({ optionType: "put", strike: 105, side: "short" }),
      ])
    ).toBe("bull put spread")
  })

  it("falls back to 'custom' when the two legs have different expiries", () => {
    expect(
      detectArchetype([
        leg({
          optionType: "call",
          strike: 95,
          side: "long",
          expiry: "2025-01-17",
        }),
        leg({
          optionType: "call",
          strike: 105,
          side: "short",
          expiry: "2025-02-21",
        }),
      ])
    ).toBe("custom")
  })
})

describe("detectArchetype — three-leg butterfly", () => {
  it("classifies an equidistant long/short/long same-type triple as a long butterfly", () => {
    expect(
      detectArchetype([
        leg({ strike: 90, side: "long" }),
        leg({ strike: 100, side: "short" }),
        leg({ strike: 110, side: "long" }),
      ])
    ).toBe("long butterfly")
  })

  it("falls back to 'custom' when the wings aren't equidistant from the body", () => {
    expect(
      detectArchetype([
        leg({ strike: 90, side: "long" }),
        leg({ strike: 103, side: "short" }),
        leg({ strike: 110, side: "long" }),
      ])
    ).toBe("custom")
  })
})

describe("detectArchetype — four-leg iron condor/butterfly", () => {
  it("classifies distinct short strikes as an iron condor", () => {
    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 110, side: "short" }),
        leg({ optionType: "call", strike: 120, side: "long" }),
        leg({ optionType: "put", strike: 90, side: "long" }),
        leg({ optionType: "put", strike: 100, side: "short" }),
      ])
    ).toBe("iron condor")
  })

  it("classifies coincident short strikes as an iron butterfly", () => {
    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 100, side: "short" }),
        leg({ optionType: "call", strike: 110, side: "long" }),
        leg({ optionType: "put", strike: 90, side: "long" }),
        leg({ optionType: "put", strike: 100, side: "short" }),
      ])
    ).toBe("iron butterfly")
  })

  it("falls back to 'custom' when call/put counts aren't balanced 2-and-2", () => {
    expect(
      detectArchetype([
        leg({ optionType: "call", strike: 90, side: "long" }),
        leg({ optionType: "call", strike: 100, side: "short" }),
        leg({ optionType: "call", strike: 110, side: "long" }),
        leg({ optionType: "put", strike: 100, side: "short" }),
      ])
    ).toBe("custom")
  })
})

describe("detectArchetype — beyond four legs", () => {
  it("falls back to 'custom' for a five-leg position", () => {
    const legs = Array.from({ length: 5 }, (_, i) =>
      leg({ strike: 90 + i * 5, side: i % 2 === 0 ? "long" : "short" })
    )
    expect(detectArchetype(legs)).toBe("custom")
  })
})
