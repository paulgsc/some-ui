import type { ComponentType } from "react"
import type { LegendSlide, WeekSlide } from "@playoff-delta/lib/slides"

import { LadderSlide, Outro, Season, Standings } from "./close"
import { Calls, Legend, Moves, Objectives, Pieces, PolesLegend } from "./legend"
import type { LegendProps, SlideProps } from "./shared"
import { Conference, Division, Results } from "./week"

export const SLIDES: Readonly<Record<WeekSlide, ComponentType<SlideProps>>> = {
  division: Division,
  conference: Conference,
  results: Results,
  standings: Standings,
  ladder: LadderSlide,
  season: Season,
  outro: Outro,
}

export const LEGEND: Readonly<Record<LegendSlide, ComponentType<LegendProps>>> =
  {
    legend: Legend,
    pieces: Pieces,
    poles: PolesLegend,
    moves: Moves,
    objectives: Objectives,
    calls: Calls,
  }
