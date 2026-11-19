/**
 * Do Studio's own pages of tiles fit the phone, now that a tile that opens
 * a page is a card link (#3234)? Each fixture (`./phone-page/journal.tsx`)
 * at each of the phone's sizes, held sideways included.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/journal-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { JournalId } from "./phone-page/journal"

const FIXTURES: ReadonlyArray<JournalId> = [
  "journal-index",
  "journal-templates",
]

fitsEachPhone("Studio's pages of tiles fit the phone", FIXTURES)
