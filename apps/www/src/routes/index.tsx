import type { JSX } from "react"
import { BrandMark, Card, CardContent } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { useAuthoritySnapshot } from "@/lib/authority"
import { destinationsHere, type Destination } from "@/lib/site-map"
import { ExtensionsPage } from "@/components/extensions/extensions-page"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The signed-in visitor's "/": a splash pointing at what this origin hosts
 * (.github/workflows/pages.yml): the catalog's `landing` entries
 * (`lib/site-map`) this build serves. A visitor with no session gets the
 * extensions tour instead (see `Root`).
 */
const CARDS = destinationsHere().flatMap((d) =>
  d.landing ? [{ ...d, cta: d.landing }] : []
)

const DestinationCard = ({
  title,
  blurb,
  icon: Icon,
  cta,
  to,
}: Destination & { cta: string }): JSX.Element => {
  return (
    <Link to={to} className="block h-full">
      <Card className="hover:border-primary/50 group h-full transition-colors">
        <CardContent className="flex h-full flex-col gap-4 pt-[var(--card-p,1.5rem)]">
          <div className="bg-primary/10 flex size-11 items-center justify-center rounded-full">
            <Icon className="text-primary size-5" aria-hidden />
          </div>
          <div className="min-h-0 flex-1 space-y-1.5">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-muted-foreground text-sm">{blurb}</p>
          </div>
          <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
            {cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}

const Landing = (): JSX.Element => (
  <main className="bg-background text-foreground relative min-h-svh">
    <div className="absolute top-4 right-4">
      <ThemeSwitcher />
    </div>
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-3 text-center">
        {/* The mark and wordmark are one unit, so the mark is decorative. */}
        <BrandMark tone="brand" className="mx-auto size-12" />
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Some UI
        </p>
        <h1 className="text-gradient-heading text-3xl font-bold tracking-tight sm:text-4xl">
          A few projects, one workspace
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-balance">
          Everything below is built and deployed from a single monorepo. Pick a
          destination.
        </p>
        {/* /mission answers why any of it exists: a text link, so it doesn't
            compete with the destinations. */}
        <Link
          to="/mission"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 transition-colors hover:underline"
        >
          Why this exists
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <DestinationCard key={card.to} {...card} />
        ))}
      </div>
    </div>
  </main>
)

/**
 * `"/"` is two pages. Where a person can learn on the device (every build with
 * a `file_host`), the landing above is everyone's front door. On the public
 * site, with no server and mostly strangers sent a link, the extensions comb
 * is the front door; someone who opened the demo gets the landing.
 *
 * Chosen in the component, not a `beforeLoad` redirect, so the front door
 * keeps the address `"/"`.
 */
const Root = (): JSX.Element => {
  const { backend, session } = useAuthoritySnapshot()
  return backend !== "none" || session === "signed-in" ? (
    <Landing />
  ) : (
    <ExtensionsPage chrome="front" />
  )
}

export const Route = createFileRoute("/")({
  component: Root,
})
