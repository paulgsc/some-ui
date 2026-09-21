/**
 * Which YouTube surface a pathname is — the coarse page-type the layout table
 * (`generated/youtube-layout.ts`) is keyed by, and the bucket the
 * observability corpus is recorded under.
 *
 * Pure: a function of the pathname string alone, so the logic layer can name
 * a surface without touching `location`. Derived from `pathname` only — never
 * the query string. A watch URL's `?v=` is a video id and `?search_query=` is
 * the user's own words; neither is something a diagnostics bundle, or a
 * checked-in layout table, has any business carrying (#1382).
 */
export type BoyoSurface =
  | "home"
  | "search"
  | "watch"
  | "playlist"
  | "shorts"
  | "channel"
  | "subscriptions"
  | "other"

export const BOYO_SURFACES: ReadonlyArray<BoyoSurface> = [
  "home",
  "search",
  "watch",
  "playlist",
  "shorts",
  "channel",
  "subscriptions",
  "other",
]

export function surfaceOf(pathname: string): BoyoSurface {
  if (pathname === "/") return "home"
  if (pathname === "/results") return "search"
  if (pathname === "/watch") return "watch"
  if (pathname === "/playlist") return "playlist"
  if (pathname.startsWith("/shorts/")) return "shorts"
  if (pathname === "/feed/subscriptions") return "subscriptions"
  if (
    pathname.startsWith("/@") ||
    pathname.startsWith("/channel/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/user/")
  ) {
    return "channel"
  }
  return "other"
}
