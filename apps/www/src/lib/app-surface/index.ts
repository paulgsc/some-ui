import type { FileRoutesByTo } from "@/routeTree.gen"
import { redirect } from "@tanstack/react-router"

import { hasAudience, MOBILE_APP } from "@/lib/build-profile"

/**
 * What the Android app (apps/mobile) carries: its Home (`/today`); sessions
 * (list, composer, player); the soundbites; aph; and settings, which there is
 * the phone's own. Everything else www routes to is the web app's.
 *
 * An allowlist, so a page added later stays off the phone until listed here.
 * Typed against the route tree, so renaming a route fails `tsc`.
 */
const MOBILE_SURFACE: ReadonlyArray<keyof FileRoutesByTo> = [
  "/sessions",
  // The "apk" audience's pages: Home, the soundbites (the microphone) and
  // aph. Asked rather than assumed, like any gated link.
  ...(hasAudience("apk") ? (["/today", "/soundbites", "/aph"] as const) : []),
  "/settings",
  // Not shown (the device backend is always signed in), but the root's
  // sign-in guard sends a signed-out visit here; redirecting it back would
  // loop, so a backend failure shows the sign-in page's error instead.
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
 * The root route's first `beforeLoad` step. In the Android build, a path off
 * the surface (`"/"` at launch, a shared component's link to the web's Home, a
 * stale deep link) is redirected to the phone's Home, not not-found: the
 * person did nothing wrong. A no-op elsewhere.
 *
 * Those pages are still in the bundle; that is debt, not design:
 * `build.paths.ts` lists each such route and `check:bundle-paths` fails on
 * any other route file that reaches the APK.
 */
export function keepToMobileSurface(pathname: string): void {
  if (MOBILE_APP && !isOnMobileSurface(pathname)) {
    throw redirect({ to: MOBILE_HOME, replace: true })
  }
}
