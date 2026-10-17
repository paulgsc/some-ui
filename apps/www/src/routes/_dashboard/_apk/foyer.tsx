import type { JSX } from "react"
import { BrandMark } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"

import { isOnMobileSurface } from "@/lib/app-surface"
import { WINGS } from "@/lib/wings"
import { WING_GLYPHS } from "@/components/wing-glyph"

/**
 * Where a wing is chosen (lib/wings): the phone's plain icon opens here, and
 * each wing's own icon skips it. Names and what each is for, and nothing of
 * what is inside: no "due", no counts, no "missed". A status line primes the
 * visit with what was not done before it starts, and a foyer that shows each
 * wing's state becomes the Home that mixed them all.
 */
const Foyer = (): JSX.Element => {
  const wings = WINGS.flatMap((wing) =>
    wing.home !== null && isOnMobileSurface(wing.home)
      ? [{ ...wing, home: wing.home }]
      : []
  )
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex items-center gap-3">
        <BrandMark tone="brand" className="size-12 shrink-0" />
        <h1 className="text-2xl font-bold tracking-tight">Where to?</h1>
      </header>
      <nav aria-label="Wings" className="flex flex-col gap-3">
        {wings.map((wing) => {
          const Glyph = WING_GLYPHS[wing.id]
          return (
            <Link
              key={wing.id}
              to={wing.home}
              className="bg-card border-border/50 hover:bg-accent flex items-center gap-4 rounded-2xl border p-4 shadow-sm"
            >
              <span className="bg-brand/30 text-brand-foreground dark:text-brand flex size-12 shrink-0 items-center justify-center rounded-2xl">
                {Glyph && <Glyph aria-hidden className="size-6" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold">{wing.name}</span>
                <span className="text-muted-foreground text-sm">
                  {wing.job}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="text-muted-foreground size-5"
              />
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/foyer")({
  component: Foyer,
})
