/**
 * The phone's ways into a wing whose cards open something (#3234), as the
 * phone draws them, for `../wings-fit.spec.ts`: the foyer's wings and
 * Practice Home, each the route's own component under a router of its own.
 */
import { Route as Foyer } from "@/routes/_dashboard/_apk/foyer"
import { Route as Practice } from "@/routes/_dashboard/_apk/practice/index"
import { routeComponent } from "@/test-support/router-stubs"

import { routed } from "./my-data"

export const WINGS_FIXTURES = {
  "wings-foyer": routed(routeComponent(Foyer), "/foyer"),
  "wings-practice": routed(routeComponent(Practice), "/practice"),
}

export type WingsId = keyof typeof WINGS_FIXTURES
