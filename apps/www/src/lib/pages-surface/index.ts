import type { FileRoutesByTo } from "@/routeTree.gen"
import { redirect } from "@tanstack/react-router"

import { PAGES_SITE } from "@/lib/build-profile"

/**
 * What the public site carries (the `pages` profile; C1055, #3401): the
 * résumé, and the authorship record every published video's end card links.
 * Its "/" is the static landing, not a route (vite.config.ts, `landingPage`).
 * The Pages build's route tree holds these routes alone (vite.config.ts,
 * `PAGES_ROUTE_FILES`); this list is what the app checks a path against.
 */
export const PAGES_SURFACE: ReadonlyArray<keyof FileRoutesByTo> = [
  "/resume",
  "/authorship",
]

/** Whether `pathname` is one of `PAGES_SURFACE`'s routes or under one. */
export function isOnPagesSurface(pathname: string): boolean {
  return PAGES_SURFACE.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  )
}

/**
 * The root route's step for the public site, beside `lib/app-surface`'s `keepToMobileSurface`: a
 * path off its surface (a link a shared screen still makes to the web's
 * Home, an old link to a page the site no longer has) loads the landing, the
 * site's front page, as a whole document. A no-op in every other build.
 */
export function keepToPagesSurface(pathname: string): void {
  if (PAGES_SITE && !isOnPagesSurface(pathname)) {
    throw redirect({ href: import.meta.env.BASE_URL, reloadDocument: true })
  }
}
