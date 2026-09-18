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
  <main className="bg-background text-foreground min-h-svh">
    {/* Fixed chrome, matching /mission: the way back and the theme control
        stay reachable without hunting for a header. */}
    <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 md:px-8">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground bg-background/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm backdrop-blur transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>
      <ThemeSwitcher />
    </div>

    <div className="mx-auto flex min-h-svh max-w-6xl items-center px-5 pt-20 pb-10 md:px-8">
      {/* The comb measures itself, so the fallback reserves no height of its
          own - a spinner sized differently from the thing it stands in for
          would make the page jump once the chunk lands. */}
      <Suspense fallback={null}>
        <ExtensionsComb />
      </Suspense>
    </div>
  </main>
)

export const Route = createFileRoute("/extensions")({
  component: Extensions,
})
