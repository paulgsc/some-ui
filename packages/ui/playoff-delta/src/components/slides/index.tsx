import type { ComponentType } from "react"
import type { LegendSlide, WeekSlide } from "@playoff-delta/lib/slides"

import { Outro, Podium, Season, Stake, Verdict } from "./close"
import { BandsLegend, Calls, Legend, Material, Pieces } from "./legend"
import type { SlideProps } from "./shared"
import { Best, Given, Rank, Road } from "./week"

export const SLIDES: Readonly<Record<WeekSlide, ComponentType<SlideProps>>> = {
  best: Best,
  road: Road,
  given: Given,
  rank: Rank,
  podium: Podium,
  stake: Stake,
  verdict: Verdict,
  season: Season,
  outro: Outro,
}

export const LEGEND: Readonly<Record<LegendSlide, ComponentType>> = {
  legend: Legend,
  pieces: Pieces,
  material: Material,
  bands: BandsLegend,
  calls: Calls,
}
