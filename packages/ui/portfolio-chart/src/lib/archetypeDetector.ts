import type { Leg, SpreadArchetype } from "../types"

export const ARCHETYPE_DESCRIPTIONS: Record<SpreadArchetype, string> = {
  "long call": "directional bullish · unlimited upside · defined risk",
  "short call": "bearish / neutral · premium seller · unlimited risk",
  "long put": "directional bearish · unlimited downside capture · defined risk",
  "short put": "bullish / neutral · premium seller · put-away risk",
  "bull call spread": "defined-risk bullish · net debit · capped upside",
  "bear put spread": "defined-risk bearish · net debit · capped downside",
  "bull put spread": "bullish / neutral · net credit · theta positive",
  "bear call spread": "bearish / neutral · net credit · theta positive",
  "long straddle": "volatility play · expects big move · direction agnostic",
  "short straddle": "mean reversion · theta decay · high risk",
  "long strangle": "volatility play · cheaper than straddle · wider breakevens",
  "short strangle": "high theta income · neutral bias · wing risk unprotected",
  "iron condor": "range-bound income · theta decay · defined risk on both wings",
  "iron butterfly": "ATM premium capture · tighter range · higher max profit",
  "covered call": "yield enhancement on long stock · capped upside",
  "long butterfly": "low-cost neutral · max profit at ATM · defined risk",
  custom: "custom multi-leg position",
}

export function detectArchetype(legs: Array<Leg>): SpreadArchetype {
  if (legs.length === 0) return "custom"

  const c = legs.filter((l) => l.optionType === "call")
  const p = legs.filter((l) => l.optionType === "put")
  const longs = legs.filter((l) => l.side === "long")

  if (legs.length === 1) {
    const [leg] = legs as [Leg]
    if (leg.optionType === "call") return leg.side === "long" ? "long call" : "short call"
    return leg.side === "long" ? "long put" : "short put"
  }

  if (legs.length === 2) {
    const sameExp = legs[0]!.expiry === legs[1]!.expiry

    // straddle / strangle
    if (c.length === 1 && p.length === 1 && sameExp) {
      const [call] = c as [Leg]
      const [put] = p as [Leg]
      if (call.strike === put.strike)
        return longs.length === 2 ? "long straddle" : "short straddle"
      if (call.strike > put.strike)
        return longs.length === 2 ? "long strangle" : "short strangle"
    }

    // call verticals
    if (c.length === 2 && sameExp) {
      const [lo, hi] = [...c].sort((a, b) => a.strike - b.strike) as [Leg, Leg]
      if (lo.side === "long" && hi.side === "short") return "bull call spread"
      if (lo.side === "short" && hi.side === "long") return "bear call spread"
    }

    // put verticals
    if (p.length === 2 && sameExp) {
      const [lo, hi] = [...p].sort((a, b) => a.strike - b.strike) as [Leg, Leg]
      if (lo.side === "long" && hi.side === "short") return "bear put spread"
      if (lo.side === "short" && hi.side === "long") return "bull put spread"
    }
  }

  if (legs.length === 3 && legs.every((l) => l.expiry === legs[0]!.expiry)) {
    const sameType = legs.every((l) => l.optionType === legs[0]!.optionType)
    if (sameType) {
      const [lo, mid, hi] = [...legs].sort((a, b) => a.strike - b.strike) as [Leg, Leg, Leg]
      const equidist = Math.abs((hi.strike - mid.strike) - (mid.strike - lo.strike)) < 0.5
      if (equidist && lo.side === "long" && mid.side === "short" && hi.side === "long")
        return "long butterfly"
    }
  }

  if (legs.length === 4 && legs.every((l) => l.expiry === legs[0]!.expiry)) {
    if (c.length === 2 && p.length === 2) {
      const [cLo, cHi] = [...c].sort((a, b) => a.strike - b.strike) as [Leg, Leg]
      const [pLo, pHi] = [...p].sort((a, b) => a.strike - b.strike) as [Leg, Leg]
      if (
        cLo.side === "short" && cHi.side === "long" &&
        pLo.side === "long"  && pHi.side === "short"
      ) {
        return cLo.strike === pHi.strike ? "iron butterfly" : "iron condor"
      }
    }
  }

  return "custom"
}
