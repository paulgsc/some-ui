/**
 * Does Studio's Episodes, by week, fit the phone? (EPISODES2, #3067.) Each
 * fixture (`./phone-page/episodes.tsx`) at each of the phone's sizes, held
 * sideways included: the chip bar scrolls sideways on its own, and nothing
 * else may.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/episodes-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { EpisodesId } from "./phone-page/episodes"

const FIXTURES: ReadonlyArray<EpisodesId> = [
  "episodes-all",
  "episodes-call",
  "episodes-trouble",
  "episodes-unpaired",
]

fitsEachPhone("Studio's Episodes fits the phone", FIXTURES)
