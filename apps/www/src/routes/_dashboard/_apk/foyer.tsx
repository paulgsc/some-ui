import type { JSX } from "react"
import { BrandMark, CardLink, CardLinkBody } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"

import { isOnMobileSurface } from "@/lib/app-surface"
import { WINGS } from "@/lib/wings"
import { DeviceFirstRun } from "@/components/settings/device-welcome"
import { WING_GLYPHS } from "@/components/wing-glyph"

/**
 * Where a wing is chosen (lib/wings): the phone's plain icon opens here, and
 * each wing's own icon skips it. Names and what each is for, and nothing of
 * what is inside: no "due", no counts, no "missed". A status line primes the
 * visit with what was not done before it starts, and a foyer that shows each
 * wing's state becomes the Home that mixed them all.
 *
 * On a phone not paired with home, it is the welcome that pairs it until
 * the person pairs or says "Not now" (SIGNIN2, `lib/home-link/first-run`).
 */
const Foyer = (): JSX.Element =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <DeviceFirstRun>
      <Wings />
    </DeviceFirstRun>
  ) : (
    <Wings />
  )

/** The wings, each with what it is for. */
const Wings = (): JSX.Element => {
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
            <CardLink key={wing.id} asChild className="gap-4 p-4">
              <Link to={wing.home}>
                <span className="bg-brand/30 text-brand-foreground dark:text-brand flex size-12 shrink-0 items-center justify-center rounded-2xl">
                  {Glyph && <Glyph aria-hidden className="size-6" />}
                </span>
                <CardLinkBody className="gap-0">
                  <span className="font-bold">{wing.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {wing.job}
                  </span>
                </CardLinkBody>
              </Link>
            </CardLink>
          )
        })}
      </nav>
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/foyer")({
  component: Foyer,
})
