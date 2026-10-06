/**
 * The pages anyone may open without a passkey session. Everything else is
 * behind the root route's guard (`routes/__root.tsx`).
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/auth",
  "/resume",
  // Built to be sent to someone with no account here.
  "/extensions",
])

/**
 * Whether `pathname` is one of `PUBLIC_PATHS`, ignoring one trailing slash
 * (never for "/"): the router's basepath rewrite keeps it, and the canonical
 * shared résumé URL is `/resume/` (Pages' resume/index.html shell), which a
 * bare match would send to /auth.
 */
export function isPublicPath(pathname: string): boolean {
  const normalized =
    pathname !== "/" && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname
  return PUBLIC_PATHS.has(normalized)
}
