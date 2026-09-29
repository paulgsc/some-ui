import { DATA_MODE } from "@/lib/data-mode"

/**
 * Go to `href` once a ceremony has started a session, possibly for a
 * different account than this tab last acted for.
 *
 * With a server, this is a full page load, not a router navigation. The new
 * account then starts from nothing in memory: no cached query, no mutation
 * still in flight for the previous account whose callback could write that
 * account's data back after a cache clear, and no module-level state. It is
 * one fence at the account boundary, where fencing each cache, callback and
 * store separately would miss the next one written.
 *
 * On the static build there is no server session to come back to (the demo's
 * "session" lives in memory), so it stays a router navigation.
 */
export function enterAccount(
  href: string,
  navigate: (href: string) => void,
  mode = DATA_MODE,
  assign: (url: string) => void = (url) => window.location.assign(url),
  here: string = window.location.href
): void {
  if (mode === "static") {
    navigate(href)
    return
  }
  assign(sameOriginUrl(href, here))
}

const FALLBACK = "/app"

/**
 * `href` under this app's base, resolved the way the browser will resolve
 * it, and refused (for `/app`) unless it stays on this origin. `/auth`'s
 * `?redirect=` is attacker-controlled: `/\evil.example` starts with `/` and
 * not `//`, yet a URL parser reads the backslash as a slash and lands on
 * another host. Checking the parsed origin catches that and any other
 * spelling a prefix check would miss.
 */
function sameOriginUrl(href: string, here: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "")
  const origin = new URL(here).origin
  const target = new URL(`${base}${href}`, here)
  return target.origin === origin
    ? `${target.pathname}${target.search}${target.hash}`
    : `${base}${FALLBACK}`
}
