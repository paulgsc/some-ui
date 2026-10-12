import type { ComponentType } from "react"
import type { SlideId } from "@playoff-delta/lib/slides"

import { Benchmark, Collisions, Outro, Rivals } from "./close"
import { Alphabet, Grammar, Hook, Test } from "./intro"
import type { SlideProps } from "./shared"
import { After, Before, Game, How, Path, Who } from "./week"

export const SLIDES: Readonly<Record<SlideId, ComponentType<SlideProps>>> = {
  hook: Hook,
  test: Test,
  alphabet: Alphabet,
  grammar: Grammar,
  before: Before,
  game: Game,
  who: Who,
  how: How,
  after: After,
  path: Path,
  rivals: Rivals,
  collisions: Collisions,
  benchmark: Benchmark,
  outro: Outro,
}
