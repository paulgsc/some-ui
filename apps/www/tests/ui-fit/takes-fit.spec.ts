/**
 * Does Studio's Takes, in compartments, fit the phone? (TAKES3, #3069.)
 * Each fixture (`./phone-page/takes.tsx`) at each of the phone's sizes,
 * held sideways included: the tiles, a compartment's cards under the chip
 * bar (which scrolls sideways on its own, and nothing else may), and a
 * phone not paired.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/takes-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { TakesId } from "./phone-page/takes"

const FIXTURES: ReadonlyArray<TakesId> = [
  "takes-tiles",
  "takes-all",
  "takes-note",
  "takes-unpaired",
]

fitsEachPhone("Studio's Takes fits the phone", FIXTURES)
