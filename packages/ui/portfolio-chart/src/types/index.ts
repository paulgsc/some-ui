export type OptionType = "call" | "put"
export type Side = "long" | "short"

export type Leg = {
  id: string
  optionType: OptionType
  side: Side
  strike: number
  expiry: string // ISO date, e.g. "2025-01-17"
  quantity: number
  premium: number // per-share entry cost (positive)
  iv: number // annualised IV at entry, e.g. 0.72
}

export type MotifPoint = {
  id: string
  text: string
  checked: boolean
}

export type SimState = {
  spot: number
  dte: number // days to expiry from now
  ivShift: number // fractional shift: 0.1 = +10%
}

export type Greeks = {
  delta: number
  gamma: number
  theta: number // per day, dollars (100-share scale)
  vega: number // per 1% IV move, dollars
}

export type PLPoint = {
  spot: number
  pl: number
}

export type PLMetrics = {
  plAtSpot: number
  maxProfit: number
  maxLoss: number
  probProfit: number // 0–1
  breakevens: number[]
}

export type SpreadArchetype =
  | "long call"
  | "short call"
  | "long put"
  | "short put"
  | "bull call spread"
  | "bear put spread"
  | "bull put spread"
  | "bear call spread"
  | "long straddle"
  | "short straddle"
  | "long strangle"
  | "short strangle"
  | "iron condor"
  | "iron butterfly"
  | "covered call"
  | "long butterfly"
  | "custom"

// What the consumer passes down into each component — no store refs inside pkg
export type SandlotPosition = {
  name: string
  legs: Array<Leg>
  motifPoints: Array<MotifPoint>
}
