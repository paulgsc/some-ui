/**
 * Do the foyer's wings and Practice Home fit the phone, now that each card
 * that opens a wing or a round is a card link (#3234)? Each fixture
 * (`./phone-page/wings.tsx`) at each of the phone's sizes, held sideways
 * included; neither screen says anything outside its cards, so each waits
 * for its first link.
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/wings-fit.spec.ts
 */
import { fitsEachPhone } from "./harness"
import type { WingsId } from "./phone-page/wings"

const FIXTURES: ReadonlyArray<WingsId> = ["wings-foyer", "wings-practice"]

fitsEachPhone("The foyer and Practice Home fit the phone", FIXTURES, "a")
