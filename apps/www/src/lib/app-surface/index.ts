import type { FileRoutesByTo } from "@/routeTree.gen"
import { redirect } from "@tanstack/react-router"

import { hasAudience, MOBILE_APP } from "@/lib/build-profile"
import { FOYER } from "@/lib/wings"

/**
 * What the Android app (apps/mobile) carries, by wing (lib/wings): the foyer,
 * where a wing is chosen; Practice (its Home and settings, sessions - the
 * list, the composer and the player - and the soundbites); Self (aph);
 * Studio (the Build Journal); and the front desk (settings: this phone, the
 * theme). Everything else www routes to (the landing, the web's Home, the
 * résumé, profile, the extensions tour, the LAN tools) is the web app's, and
 * the phone has no use for it.
 *
 * An allowlist, not a list of exclusions, so that a page added to www later
 * stays off the phone until someone puts it here. Typed against the route
 * tree, so renaming or removing one of these routes fails `tsc` here.
 */
const MOBILE_SURFACE: ReadonlyArray<keyof FileRoutesByTo> = [
  "/sessions",
  // The pages only the Android app's build carries (the "apk" audience): the
  // foyer, Practice's Home and settings, the soundbites (the phone's
  // microphone), aph and the Build Journal. Asked rather than assumed, like
  // any gated link.
  ...(hasAudience("apk")
    ? (["/foyer", "/practice", "/soundbites", "/aph", "/journal"] as const)
    : []),
  "/settings",
  // Not a page the phone shows: the device backend is always signed in. But
  // a device route answering 401 ends the session belief, and the account
  // banner then links here; in this build it is a reload, not a sign-in
  // (components/auth/device-session-lost). The sidebar never lists it.
  "/auth",
]

/**
 * Where the plain app icon opens, and where a path off the surface lands: the
 * foyer. Each wing's own icon opens its Home instead; apps/mobile's
 * `MainActivity` repeats both (`routes/__tests__/mobile-surface.test.ts`
 * checks they agree).
 */
export const MOBILE_ENTRY = FOYER

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
 * foyer. A no-op in every other build.
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
    throw redirect({ to: MOBILE_ENTRY, replace: true })
  }
}
