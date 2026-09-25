import { lazy, Suspense } from "react"
import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The six browser extensions in `extensions/`, for a non-technical visitor —
 * a recruiter, a friend, someone sent a link. Not a maintainer console:
 * nothing here names a version, a manifest, a test count, a workflow or a
 * workspace, and how far along a tool is arrives as a quantity rather than a
 * changelog.
 *
 * Public and standalone (the `mission.tsx` archetype), which means
 * `"/extensions"` has to be in `__root.tsx`'s public-route set or a
 * signed-out visitor following the link lands on the passkey screen instead.
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

const Extensions = (): JSX.Element => (
  <main className="bg-background text-foreground relative h-svh overflow-hidden">
    {/* The only chrome, and it costs the comb no space: a seven-cell comb
        leaves its two top corners empty at every viewport shape, so the back
        link and the theme control sit in a region no cell ever reaches and
        the comb still gets the whole window. Reserving a strip for them
        instead would be most expensive exactly where there is least to
        spare - a 390px-tall landscape phone. */}
    <div className="pointer-events-none fixed inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-3 md:px-6">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground bg-background/70 pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm backdrop-blur transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>
      <div className="pointer-events-auto">
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

export const Route = createFileRoute("/extensions")({
  component: Extensions,
})
