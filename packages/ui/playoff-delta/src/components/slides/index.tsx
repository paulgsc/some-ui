import type { ComponentType } from "react"
import type { SlideId } from "@playoff-delta/lib/slides"

import { Outro, Season, Stake, Verdict } from "./close"
import { Hook, Law } from "./intro"
import type { SlideProps } from "./shared"
import { Lights, Luck } from "./week"

export const SLIDES: Readonly<Record<SlideId, ComponentType<SlideProps>>> = {
  hook: Hook,
  lights: Lights,
  law: Law,
  luck: Luck,
  stake: Stake,
  verdict: Verdict,
  season: Season,
  outro: Outro,
}
