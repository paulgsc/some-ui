/**
 * Studio's own pages whose tiles open a page (#3234), as the phone draws
 * them, for `../journal-fit.spec.ts`: Studio's index (the eight kinds, two
 * to a row) and the templates; Takes' tiles are `./takes`' (`takes-tiles`).
 * Each is the route's own component, mounted under a router of its own,
 * since its tiles are links (`CardRoute`).
 */
import { Route as StudioIndex } from "@/routes/_dashboard/_apk/journal/index"
import { Route as Templates } from "@/routes/_dashboard/_apk/journal/templates/index"
import { routeComponent } from "@/test-support/router-stubs"

import { routed } from "./my-data"

export const JOURNAL_FIXTURES = {
  "journal-index": routed(routeComponent(StudioIndex), "/journal"),
  "journal-templates": routed(routeComponent(Templates), "/journal/templates"),
}

export type JournalId = keyof typeof JOURNAL_FIXTURES
