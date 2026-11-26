/**
 * Does the Cast wing (HOST8, #3532) fit the phone: each character's grid
 * of live looks, its last page, and one look in the largest and smallest
 * shot over the sample card? Each fixture (`./phone-page/cast.tsx`) at each
 * of the phone's sizes, held sideways included; each screen's first words
 * are a paragraph or its back link, so each waits for its first link.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/cast-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { CastId } from "./phone-page/cast"

const FIXTURES: ReadonlyArray<CastId> = [
  "cast-mochi",
  "cast-tin-bird",
  "cast-mochi-last",
  "cast-look-close-up",
  "cast-look-long",
]

fitsEachPhone("The Cast wing fits the phone", FIXTURES, "a")
