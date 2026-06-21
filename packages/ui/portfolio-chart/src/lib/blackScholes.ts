/**
 * Pure Black-Scholes pricing functions.
 * No React, no side effects, fully unit-testable.
 */

import type { Greeks, Leg, PLMetrics, PLPoint } from "../types"

// ── math primitives ──────────────────────────────────────────────────────────

function normCDF(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const t = 1.0 / (1.0 + p * Math.abs(x))
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1.0 + sign * y)
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

// ── core pricing ─────────────────────────────────────────────────────────────

export type BSResult = {
  price: number
  delta: number
  gamma: number
  theta: number // per day
  vega: number // per 1% IV change
}

export function bsPrice(
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  optionType: "call" | "put",
  r = 0.05
): BSResult {
  if (spot <= 0 || strike <= 0 || iv <= 0) {
    return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0 }
  }
  const T = Math.max(dte, 0.001) / 365
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(spot / strike) + (r + 0.5 * iv * iv) * T) / (iv * sqrtT)
  const d2 = d1 - iv * sqrtT

  const price =
    optionType === "call"
      ? spot * normCDF(d1) - strike * Math.exp(-r * T) * normCDF(d2)
      : strike * Math.exp(-r * T) * normCDF(-d2) - spot * normCDF(-d1)

  const delta = optionType === "call" ? normCDF(d1) : normCDF(d1) - 1

  const gamma = normPDF(d1) / (spot * iv * sqrtT)

  const thetaCall =
    (-(spot * normPDF(d1) * iv) / (2 * sqrtT) -
      r * strike * Math.exp(-r * T) * normCDF(d2)) /
    365

  const theta =
    optionType === "call"
      ? thetaCall
      : thetaCall + (r * strike * Math.exp(-r * T)) / 365

  const vega = (spot * normPDF(d1) * sqrtT) / 100

  return { price: Math.max(price, 0), delta, gamma, theta, vega }
}

// ── position-level helpers ───────────────────────────────────────────────────

export function legPLAtSpot(
  leg: Leg,
  spot: number,
  dte: number,
  ivShift: number
): number {
  const { price } = bsPrice(
    spot,
    leg.strike,
    dte,
    Math.max(leg.iv * (1 + ivShift), 0.01),
    leg.optionType
  )
  return (
    (leg.side === "long" ? 1 : -1) * (price - leg.premium) * leg.quantity * 100
  )
}

export function positionPLAtSpot(
  legs: Array<Leg>,
  spot: number,
  dte: number,
  ivShift: number
): number {
  return legs.reduce((acc, l) => acc + legPLAtSpot(l, spot, dte, ivShift), 0)
}

export function buildPLCurve(
  legs: Array<Leg>,
  centerSpot: number,
  dte: number,
  ivShift: number,
  points = 120
): Array<PLPoint> {
  const lo = centerSpot * 0.7
  const hi = centerSpot * 1.3
  return Array.from({ length: points }, (_, i) => {
    const spot = lo + ((hi - lo) * i) / (points - 1)
    return { spot, pl: positionPLAtSpot(legs, spot, dte, ivShift) }
  })
}

export function computeNetGreeks(
  legs: Array<Leg>,
  spot: number,
  dte: number,
  ivShift: number
): Greeks {
  let delta = 0
  let gamma = 0
  let theta = 0
  let vega = 0
  for (const leg of legs) {
    const bs = bsPrice(
      spot,
      leg.strike,
      dte,
      Math.max(leg.iv * (1 + ivShift), 0.01),
      leg.optionType
    )
    const sign = leg.side === "long" ? 1 : -1
    const scale = leg.quantity * 100
    delta += sign * bs.delta * scale
    gamma += sign * bs.gamma * scale
    theta += sign * bs.theta * scale
    vega += sign * bs.vega * scale
  }
  return { delta, gamma, theta, vega }
}

export function computePLMetrics(
  curve: Array<PLPoint>,
  spot: number,
  legs: Array<Leg>,
  dte: number,
  ivShift: number
): PLMetrics {
  if (legs.length === 0 || curve.length === 0) {
    return {
      plAtSpot: 0,
      maxProfit: 0,
      maxLoss: 0,
      probProfit: 0,
      breakevens: [],
    }
  }
  const pls = curve.map((p) => p.pl)
  const profitable = curve.filter((p) => p.pl > 0).length
  const breakevens: Array<number> = []
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1]!
    const curr = curve[i]!
    if (prev.pl * curr.pl <= 0) {
      const t = Math.abs(prev.pl) / (Math.abs(prev.pl) + Math.abs(curr.pl))
      breakevens.push(prev.spot + t * (curr.spot - prev.spot))
    }
  }
  return {
    plAtSpot: positionPLAtSpot(legs, spot, dte, ivShift),
    maxProfit: Math.max(...pls),
    maxLoss: Math.min(...pls),
    probProfit: profitable / curve.length,
    breakevens,
  }
}
