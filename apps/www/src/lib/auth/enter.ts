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
  assign: (url: string) => void = (url) => window.location.assign(url)
): void {
  if (mode === "static") {
    navigate(href)
    return
  }
  assign(`${import.meta.env.BASE_URL.replace(/\/+$/, "")}${href}`)
}
