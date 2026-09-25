import { lazy, Suspense } from "react"
import type { JSX } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { HexCombMark } from "@/components/brand/hex-comb-mark"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The six browser extensions in `extensions/`, for a non-technical visitor —
 * a recruiter, a friend, someone sent a link. Not a maintainer console:
 * nothing here names a version, a manifest, a test count, a workflow or a
 * workspace, and how far along a tool is arrives as a quantity rather than a
 * changelog.
 *
 * It is mounted in two places, which is why it lives here rather than in a
 * route file:
 *
 * - `"/"` for a visitor with no session. It is the front door, so its
 *   chrome carries the ways onward that the signed-in landing's cards
 *   otherwise would: the résumé, which is what a stranger most often came
 *   for, and sign-in.
 * - `"/extensions"`, the stable address to share, reached from the signed-in
 *   landing and from `/mission`. Its chrome is a way back.
 *
 * The comb itself lives in `@some-ui/honeycomb`, where the rest of this
 * workspace's hex geometry lives, and is pulled in through a dynamic import
 * rather than a static one. That is not stylistic: `@some-ui/honeycomb` is a
 * package the content registry loads lazily, and a single static value import
 * from this app would give the bundler an eager edge and quietly undo that
 * for every host — which is exactly what `lazy-registry/no-eager-registry-import`
 * exists to catch.
 */
const ExtensionsComb = lazy(async () => {
  const { ExtensionsComb: Comb } = await import("@some-ui/honeycomb")
  return { default: Comb }
})

const CHIP =
  "text-muted-foreground hover:text-foreground bg-background/70 pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm backdrop-blur transition-colors"

type ExtensionsPageProps = {
  /**
   * `front` when this is the site's front door (`"/"` without a session),
   * `back` when it is a page reached from somewhere and needs a way back.
   */
  chrome: "front" | "back"
}

export const ExtensionsPage = ({
  chrome,
}: ExtensionsPageProps): JSX.Element => (
  <main className="bg-background text-foreground relative h-svh overflow-hidden">
    {/* The only chrome, and it costs the comb no space: a seven-cell comb
        leaves its two top corners empty at every viewport shape, so these
        controls sit in a region no cell ever reaches and the comb still gets
        the whole window. Reserving a strip for them instead would be most
        expensive exactly where there is least to spare - a 390px-tall
        landscape phone.

        It wraps rather than overflowing: at a narrow width with enlarged
        default text, the controls drop to a second row instead of running off
        the edge, since they are the front door's only navigation. */}
    <div className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-3 md:px-6">
      {chrome === "back" ? (
        <Link to="/" className={CHIP}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
      ) : (
        <span className="pointer-events-auto inline-flex items-center gap-2 px-1">
          {/* `current`, not `brand`: on this page the comb itself follows the
              session theme (the `.comb` skin), and a fixed-amber mark beside a
              slate or berry comb would read as a second palette. */}
          <HexCombMark className="text-muted-foreground size-6" />
          {/* The wordmark gives way on a phone, where the mark alone
              carries the brand and the width is the actions'. */}
          <span className="text-muted-foreground sr-only text-sm font-medium tracking-wide uppercase sm:not-sr-only">
            Some UI
          </span>
        </span>
      )}
      <div className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-1.5">
        {chrome === "front" && (
          <>
            <Link to="/resume" className={CHIP}>
              Résumé
            </Link>
            <Link to="/auth" className={CHIP}>
              Sign in
            </Link>
          </>
        )}
        <ThemeSwitcher />
      </div>
    </div>

    {/* The comb owns the viewport: it is the page, not an illustration on
        one. It positions itself absolutely against this element and scales to
        fill it, so the fallback reserves nothing - there is no layout for a
        spinner to hold open, and sizing one differently from the comb would
        only make the page jump once the chunk lands. */}
    <Suspense fallback={null}>
      <ExtensionsComb />
    </Suspense>
  </main>
)
