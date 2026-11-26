/**
 * Does Studio's Previews (HOST16, #3558) fit the phone: the transitions
 * preview's cards, unpicked and picked, and home out of reach (`./phone-page/previews.tsx`), at
 * each of the phone's sizes, held sideways included.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/previews-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { PreviewsId } from "./phone-page/previews"

const FIXTURES: ReadonlyArray<PreviewsId> = [
  "previews-unpicked",
  "previews-picked",
  "previews-away",
]

fitsEachPhone("Studio's Previews fit the phone", FIXTURES, "p")
