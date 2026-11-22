import type { FileRoutesByTo } from "@/routeTree.gen"
import { redirect } from "@tanstack/react-router"

import { hasAudience, MOBILE_APP, PAGES_SITE } from "@/lib/build-profile"
import { FOYER } from "@/lib/wings"

/**
 * What the Android app (apps/mobile) carries, by wing (lib/wings): the foyer,
 * where a wing is chosen; Practice (its Home and settings, sessions - the
 * list, the composer and the player - the soundbites and Rust Rounds); Self (aph);
 * Studio (the Build Journal and game-day bites); Jobs (the day's picks); and
 * the front desk (settings: this phone, the theme). Everything else www routes to (the landing, the web's Home, the
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
  // microphone), Rust Rounds, aph, the Build Journal, game-day bites and Jobs. Asked rather than assumed, like
  // any gated link.
  ...(hasAudience("apk")
    ? ([
        "/foyer",
        "/practice",
        "/soundbites",
        "/rust-rounds",
        "/aph",
        "/journal",
        "/game-week",
        "/jobs",
      ] as const)
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
  if (MOBILE_APP && hasAudience("apk") && !isOnMobileSurface(pathname)) {
    throw redirect({ to: MOBILE_ENTRY, replace: true })
  }
}

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
 * The root route's step for the public site, beside `keepToMobileSurface`: a
 * path off its surface (a link a shared screen still makes to the web's
 * Home, an old link to a page the site no longer has) loads the landing, the
 * site's front page, as a whole document. A no-op in every other build.
 */
export function keepToPagesSurface(pathname: string): void {
  if (PAGES_SITE && !isOnPagesSurface(pathname)) {
    throw redirect({ href: import.meta.env.BASE_URL, reloadDocument: true })
  }
}
