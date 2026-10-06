import { DATA_MODE } from "@/lib/data-mode"

/**
 * Go to `href` once a ceremony has started a session, possibly for a
 * different account than this tab last acted for.
 *
 * With a server, a full page load, not a router navigation: the new account
 * starts with no cached query, no in-flight mutation from the previous
 * account, and no module state. One fence at the account boundary. On the
 * static build (no server session) it stays a router navigation.
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
 * `href` under this app's base, as the browser resolves it, refused (for
 * `/app`) unless it stays on this origin: `?redirect=` is attacker-controlled,
 * and `/\evil.example` passes a prefix check but parses to another host.
 */
function sameOriginUrl(href: string, here: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "")
  const origin = new URL(here).origin
  const target = new URL(`${base}${href}`, here)
  return target.origin === origin
    ? `${target.pathname}${target.search}${target.hash}`
    : `${base}${FALLBACK}`
}
