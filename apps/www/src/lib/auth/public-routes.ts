/**
 * The pages anyone may open without a passkey session. Everything else is
 * behind the root route's guard (`routes/__root.tsx`).
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/auth",
  "/resume",
  // A page built to be sent to someone who has no account here and never
  // will - gating it behind the passkey screen would defeat the only reason
  // it exists.
  "/extensions",
])

/**
 * Whether `pathname` is one of `PUBLIC_PATHS`.
 *
 * The router's own basepath rewrite preserves a trailing slash (it only
 * strips the basepath prefix), and GitHub Pages' /resume/index.html shell
 * (see vite.config.ts's build.rolldownOptions.input) is the canonical,
 * publicly-shared résumé URL - with the slash. A bare string match against
 * "/resume" would pass every in-app navigation (which the router's default
 * trailingSlash: "never" always produces without one) but fail a fresh
 * visitor's first hit on that exact canonical link, redirecting them to
 * /auth instead of the résumé they followed. Stripping a single trailing
 * slash before comparing (never for "/" itself, which has nothing left to
 * strip) matches that default instead of special-casing "/resume/" alone.
 */
export function isPublicPath(pathname: string): boolean {
  const normalized =
    pathname !== "/" && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname
  return PUBLIC_PATHS.has(normalized)
}
