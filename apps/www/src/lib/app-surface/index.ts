import type { FileRoutesByTo } from "@/routeTree.gen"
import { redirect } from "@tanstack/react-router"

import { MOBILE_APP } from "@/lib/build-profile"

/**
 * What the Android app (apps/mobile) carries: sessions - the list, the
 * composer and the player - and the settings page, which in that build is the
 * phone's own (sync from home, study nudges, the voice). Everything else www
 * routes to (the landing, Home, the résumé, jobs, profile, the extensions tour,
 * the LAN tools) is the web app's, and the phone has no use for it.
 *
 * An allowlist, not a list of exclusions, so that a page added to www later
 * stays off the phone until someone puts it here. Typed against the route
 * tree, so renaming or removing one of these routes fails `tsc` here.
 */
const MOBILE_SURFACE: ReadonlyArray<keyof FileRoutesByTo> = [
  "/sessions",
  "/settings",
  // Not a page the phone shows: the device backend is always signed in. But
  // the root's sign-in guard sends a signed-out visit here, and redirecting it
  // back would loop between the two - so if the backend ever fails to answer,
  // the app shows the sign-in page's error instead of hanging. The sidebar
  // never lists it.
  "/auth",
]

/** Where the app opens, and where a path off the surface lands. */
export const MOBILE_HOME = "/sessions" satisfies keyof FileRoutesByTo

/** Whether `pathname` is one of `MOBILE_SURFACE`'s routes or under one. */
export function isOnMobileSurface(pathname: string): boolean {
  return MOBILE_SURFACE.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  )
}

/**
 * The root route's first `beforeLoad` step. In the Android app's build, a
 * path off the surface - `"/"` at launch, a link some shared component still
 * makes to Home, a stale deep link - is replaced by the sessions list. A no-op
 * in every other build.
 *
 * A redirect rather than not-found: nothing the person did on the phone is
 * wrong when they reach one of these, so it should land them somewhere useful.
 * The pages themselves are still in the bundle (the route tree is the same in
 * every build); this only makes them unreachable.
 */
export function keepToMobileSurface(pathname: string): void {
  if (MOBILE_APP && !isOnMobileSurface(pathname)) {
    throw redirect({ to: MOBILE_HOME, replace: true })
  }
}
