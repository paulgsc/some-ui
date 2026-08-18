import type { Leg, PLPoint } from "@portfolio/types"
import { describe, expect, it } from "vitest"

import {
  bsPrice,
  buildPLCurve,
  computeNetGreeks,
  computePLMetrics,
  legPLAtSpot,
  positionPLAtSpot,
} from "./blackScholes"

function leg(overrides: Partial<Leg> = {}): Leg {
  return {
    id: "leg-1",
    optionType: "call",
    side: "long",
    strike: 100,
    expiry: "2025-01-17",
    quantity: 1,
    premium: 5,
    iv: 0.3,
    ...overrides,
  }
}

describe("bsPrice", () => {
  it("returns an all-zero result for non-positive spot/strike/iv (degenerate guard)", () => {
    const zero = { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0 }
    expect(bsPrice(0, 100, 30, 0.3, "call")).toEqual(zero)
    expect(bsPrice(100, 0, 30, 0.3, "call")).toEqual(zero)
    expect(bsPrice(100, 100, 30, 0, "call")).toEqual(zero)
  })

  it("honors put-call parity: C - P = S - K*e^(-rT)", () => {
    const spot = 100
    const strike = 95
    const dte = 45
    const iv = 0.35
    const r = 0.05
    const call = bsPrice(spot, strike, dte, iv, "call", r)
    const put = bsPrice(spot, strike, dte, iv, "put", r)
    const T = dte / 365
    const expected = spot - strike * Math.exp(-r * T)
    expect(call.price - put.price).toBeCloseTo(expected, 6)
  })

  it("keeps call delta within [0, 1] and put delta within [-1, 0]", () => {
    const call = bsPrice(100, 100, 30, 0.4, "call")
    const put = bsPrice(100, 100, 30, 0.4, "put")
    expect(call.delta).toBeGreaterThanOrEqual(0)
    expect(call.delta).toBeLessThanOrEqual(1)
    expect(put.delta).toBeGreaterThanOrEqual(-1)
    expect(put.delta).toBeLessThanOrEqual(0)
  })

  it("pushes deep-ITM call delta toward 1 and deep-OTM call delta toward 0", () => {
    const deepItm = bsPrice(1000, 100, 30, 0.2, "call")
    const deepOtm = bsPrice(10, 1000, 30, 0.2, "call")
    expect(deepItm.delta).toBeGreaterThan(0.95)
    expect(deepOtm.delta).toBeLessThan(0.05)
  })
})

describe("legPLAtSpot", () => {
  it("negates a short leg's P/L relative to the same long leg", () => {
    const spot = 100
    const dte = 30
    const ivShift = 0
    const longPl = legPLAtSpot(leg({ side: "long" }), spot, dte, ivShift)
    const shortPl = legPLAtSpot(leg({ side: "short" }), spot, dte, ivShift)
    expect(shortPl).toBeCloseTo(-longPl, 6)
  })

  it("scales P/L linearly with quantity", () => {
    const single = legPLAtSpot(leg({ quantity: 1 }), 110, 30, 0)
    const tripled = legPLAtSpot(leg({ quantity: 3 }), 110, 30, 0)
    expect(tripled).toBeCloseTo(single * 3, 6)
  })
})

describe("positionPLAtSpot", () => {
  it("sums each leg's independent P/L", () => {
    const legs = [
      leg({ id: "a", side: "long", strike: 95 }),
      leg({ id: "b", side: "short", strike: 105 }),
    ]
    const spot = 100
    const dte = 30
    const ivShift = 0
    const expected =
      legPLAtSpot(legs[0]!, spot, dte, ivShift) +
      legPLAtSpot(legs[1]!, spot, dte, ivShift)
    expect(positionPLAtSpot(legs, spot, dte, ivShift)).toBeCloseTo(expected, 6)
  })

  it("returns 0 for an empty position", () => {
    expect(positionPLAtSpot([], 100, 30, 0)).toBe(0)
  })
})

describe("buildPLCurve", () => {
  it("spans [0.7x, 1.3x] of the center spot across the requested point count", () => {
    const curve = buildPLCurve([leg()], 100, 30, 0, 10)
    expect(curve).toHaveLength(10)
    expect(curve[0]!.spot).toBeCloseTo(70, 6)
    expect(curve[curve.length - 1]!.spot).toBeCloseTo(130, 6)
  })
})

describe("computeNetGreeks", () => {
  it("nets an equal long/short pair to zero rather than doubling it", () => {
    const legs = [
      leg({ id: "a", side: "long", optionType: "call" }),
      leg({ id: "b", side: "short", optionType: "call" }),
    ]
    const greeks = computeNetGreeks(legs, 100, 30, 0)
    expect(greeks.delta).toBeCloseTo(0, 6)
    expect(greeks.gamma).toBeCloseTo(0, 6)
    expect(greeks.vega).toBeCloseTo(0, 6)
  })
})

describe("computePLMetrics", () => {
  it("returns an all-zero result for an empty position or curve", () => {
    expect(computePLMetrics([], 100, [], 30, 0)).toEqual({
      plAtSpot: 0,
      maxProfit: 0,
      maxLoss: 0,
      probProfit: 0,
      breakevens: [],
    })
  })

  it("interpolates breakevens where the curve crosses zero, from a synthetic curve", () => {
    const curve: Array<PLPoint> = [
      { spot: 90, pl: -10 },
      { spot: 100, pl: 10 },
      { spot: 110, pl: 10 },
      { spot: 120, pl: -20 },
    ]
    const metrics = computePLMetrics(curve, 100, [leg()], 30, 0)
    expect(metrics.breakevens).toHaveLength(2)
    expect(metrics.breakevens[0]).toBeCloseTo(95, 6)
    expect(metrics.breakevens[1]).toBeCloseTo(113.33, 1)
    expect(metrics.maxProfit).toBe(10)
    expect(metrics.maxLoss).toBe(-20)
    expect(metrics.probProfit).toBeCloseTo(0.5, 6)
  })
})
