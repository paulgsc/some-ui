/**
 * Studio's index (#3234), the eight kinds two to a row, as the phone draws
 * it, for `../journal-fit.spec.ts`.
 */
import { Route as StudioIndex } from "@/routes/_dashboard/_apk/journal/index"
import { routeComponent } from "@/test-support/router-stubs"

import { routed } from "./my-data"

export const JOURNAL_FIXTURES = {
  "journal-index": routed(routeComponent(StudioIndex), "/journal"),
}

export type JournalId = keyof typeof JOURNAL_FIXTURES
