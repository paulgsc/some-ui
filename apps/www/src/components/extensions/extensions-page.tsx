import { Suspense } from "react"
import type { JSX } from "react"
import { MochiShapes } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { ExtensionsComb } from "@/lib/web-surface"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The five browser extensions in `extensions/`, for a non-technical visitor:
 * no versions, manifests or workflows; progress as a quantity.
 *
 * Mounted only at `"/extensions"`, with a way back.
 */

const CHIP =
  "text-muted-foreground hover:text-foreground bg-background/70 pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm backdrop-blur transition-colors"

export const ExtensionsPage = (): JSX.Element => (
  <main className="bg-background text-foreground relative h-svh overflow-hidden">
    {/* The only chrome, in the two top corners a seven-cell comb never
        reaches, so the comb keeps the whole window. It wraps rather than
        overflowing with enlarged text: it is the only navigation. */}
    <div className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-3 md:px-6">
      <Link to="/" className={CHIP}>
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>
      <div className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <ThemeSwitcher />
      </div>
    </div>

    {/* The comb positions itself absolutely and fills this element, so the
        fallback reserves nothing (a spinner would make the page jump). */}
    <Suspense fallback={null}>
      <ExtensionsComb mark={<MochiShapes tone="brand" />} />
    </Suspense>
  </main>
)
