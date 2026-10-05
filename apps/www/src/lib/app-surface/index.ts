import type { FileRoutesByTo } from "@/routeTree.gen"
import { redirect } from "@tanstack/react-router"

import { hasAudience, MOBILE_APP } from "@/lib/build-profile"

/**
 * What the Android app (apps/mobile) carries: its own Home (`/today`), the
 * hub its daily tools hang off; sessions - the list, the composer and the
 * player; the soundbites; aph; and the settings page, which in that build is
 * the phone's own (sync from home, study nudges, the voice). Everything else
 * www routes to (the landing, the web's Home, the résumé, jobs, profile, the
 * extensions tour, the LAN tools) is the web app's, and the phone has no use
 * for it.
 *
 * An allowlist, not a list of exclusions, so that a page added to www later
 * stays off the phone until someone puts it here. Typed against the route
 * tree, so renaming or removing one of these routes fails `tsc` here.
 */
const MOBILE_SURFACE: ReadonlyArray<keyof FileRoutesByTo> = [
  "/sessions",
  // The pages only the Android app's build carries (the "apk" audience):
  // Home, the soundbites (the phone's microphone) and aph. Asked rather than
  // assumed, like any gated link.
  ...(hasAudience("apk") ? (["/today", "/soundbites", "/aph"] as const) : []),
  "/settings",
  // Not a page the phone shows: the device backend is always signed in. But
  // a device route answering 401 ends the session belief, and the account
  // banner then links here; in this build it is a reload, not a sign-in
  // (components/auth/device-session-lost). The sidebar never lists it.
  "/auth",
]

/** Where the app opens, and where a path off the surface lands: Home. */
export const MOBILE_HOME = "/today" satisfies keyof FileRoutesByTo

/** Whether `pathname` is one of `MOBILE_SURFACE`'s routes or under one. */
export function isOnMobileSurface(pathname: string): boolean {
  return MOBILE_SURFACE.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  )
}

/**
 * The root route's first `beforeLoad` step. In the Android app's build, a
 * path off the surface - `"/"` at launch, a link some shared component still
 * makes to the web's Home, a stale deep link - is replaced by the phone's
 * Home. A no-op in every other build.
 *
 * A redirect rather than not-found: nothing the person did on the phone is
 * wrong when they reach one of these, so it should land them somewhere useful.
 * The pages themselves are still in the bundle (the route tree is the same in
 * every build); this only makes them unreachable. That is debt, not design:
 * `build.paths.ts` lists each such route against the APK, and
 * `check:bundle-paths` fails on any other route file that reaches it.
 */
export function keepToMobileSurface(pathname: string): void {
  if (MOBILE_APP && !isOnMobileSurface(pathname)) {
    throw redirect({ to: MOBILE_HOME, replace: true })
  }
}
