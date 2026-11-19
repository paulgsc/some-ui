/**
 * Does Studio's index, its tiles two to a row, fit the phone (#3234)? The
 * fixture (`./phone-page/journal.tsx`) at each of the phone's sizes, held
 * sideways included.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/journal-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { JournalId } from "./phone-page/journal"

const FIXTURES: ReadonlyArray<JournalId> = ["journal-index"]

fitsEachPhone("Studio's index fits the phone", FIXTURES)
