import { lazy, Suspense } from "react"
import type { JSX } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { HexCombMark } from "@/components/brand/hex-comb-mark"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The five browser extensions in `extensions/`, for a non-technical visitor:
 * no versions, manifests or workflows; progress as a quantity.
 *
 * Mounted in two places: `"/"` for a visitor with no session (the front door,
 * so its chrome offers the résumé and sign-in), and `"/extensions"`, the
 * address to share (its chrome is a way back).
 *
 * The comb comes from `@some-ui/honeycomb` through a dynamic import: a static
 * value import would undo the registry's lazy load for every host
 * (`lazy-registry/no-eager-registry-import`).
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
    {/* The only chrome, in the two top corners a seven-cell comb never
        reaches, so the comb keeps the whole window. It wraps rather than
        overflowing with enlarged text: it is the only navigation. */}
    <div className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-3 md:px-6">
      {chrome === "back" ? (
        <Link to="/" className={CHIP}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
      ) : (
        <span className="pointer-events-auto inline-flex items-center gap-2 px-1">
          {/* `current`, not `brand`: the comb follows the session theme, and
              a fixed-amber mark would read as a second palette. */}
          <HexCombMark className="text-muted-foreground size-6" />
          {/* The wordmark gives way on a phone. */}
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

    {/* The comb positions itself absolutely and fills this element, so the
        fallback reserves nothing (a spinner would make the page jump). */}
    <Suspense fallback={null}>
      <ExtensionsComb />
    </Suspense>
  </main>
)
