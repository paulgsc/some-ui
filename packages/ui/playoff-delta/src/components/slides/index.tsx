import type { ComponentType } from "react"
import type { SlideId } from "@playoff-delta/lib/slides"

import { Benchmark, Collisions, Next, Outro, Rivals } from "./close"
import { Hook, Law, Test } from "./intro"
import type { SlideProps } from "./shared"
import { After, Before, Boundary, Game, League, Path } from "./week"

export const SLIDES: Readonly<Record<SlideId, ComponentType<SlideProps>>> = {
  hook: Hook,
  test: Test,
  before: Before,
  game: Game,
  law: Law,
  league: League,
  after: After,
  path: Path,
  boundary: Boundary,
  rivals: Rivals,
  collisions: Collisions,
  next: Next,
  benchmark: Benchmark,
  outro: Outro,
}
