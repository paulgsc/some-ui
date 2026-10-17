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

/**
 * `ytd-page-manager`'s hidden child: the page an SPA navigation left behind.
 * Its cards stay in the document while the pathname names the page shown, so
 * a card under it is not on the surface the path names (#1848).
 */
export const HIDDEN_PAGE_SELECTOR = "ytd-page-manager > [hidden]"

/**
 * The surface a hidden page container held, from its tag and `page-subtype`.
 * Only the two containers seen hidden in a capture are named; any other is
 * `"other"`, which is never the visible page's surface by mistake.
 */
export function hiddenPageSurface(
  tag: string,
  pageSubtype: string | null
): BoyoSurface {
  if (tag === "ytd-watch-flexy") return "watch"
  if (tag === "ytd-browse" && pageSubtype === "home") return "home"
  return "other"
}
