/**
 * Does Studio's Takes › Needs your attention fit the phone? (HEARD3, #3075.)
 * Each fixture (`./phone-page/attention.tsx`) at each of the phone's sizes,
 * held sideways (780×390) included: every code's group with its widest
 * cards and acts, under the chip bar (which scrolls sideways on its own, and
 * nothing else may), the way in on Takes' first page, nothing waiting, and
 * a phone not paired.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/attention-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { AttentionId } from "./phone-page/attention"

const FIXTURES: ReadonlyArray<AttentionId> = [
  "attention-all",
  "attention-none",
  "attention-unpaired",
  "attention-way-in",
]

fitsEachPhone("Needs your attention fits the phone", FIXTURES)
