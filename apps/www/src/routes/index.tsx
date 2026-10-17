import type { ComponentType, JSX } from "react"
import type { FileRoutesByTo } from "@/routeTree.gen"
import { BrandMark, Card, CardContent } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Globe, Lock, Settings, Sparkles } from "lucide-react"

import { useAuthoritySnapshot } from "@/lib/authority"
import type { Destination } from "@/lib/site-map"
import { destinationsHere } from "@/lib/site-map"
import { webWingsHere } from "@/lib/wings"
import { DemoLink } from "@/components/demo-link"
import { ExtensionsPage } from "@/components/extensions/extensions-page"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { WING_GLYPHS } from "@/components/wing-glyph"

const DestinationCard = ({
  title,
  blurb,
  icon: Icon,
  cta,
  to,
}: {
  to: keyof FileRoutesByTo
  title: string
  blurb: string
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  cta: string
}): JSX.Element => {
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

/**
 * What "Published from here" lists: the destinations this build serves that
 * are published somewhere, each with its channel and, where one exists, a
 * demo.
 */
const PUBLISHED = destinationsHere().filter(
  (d): d is Destination & { channel: string } => d.channel !== undefined
)

/**
 * The owner's "/" on the home network: the web's foyer. First the wings to go
 * into (lib/wings), then what is published from here, each with its channel
 * (`lib/site-map`). A visitor with no session gets the extensions tour
 * instead (see `Root`).
 */
const Landing = (): JSX.Element => (
  <main className="bg-background text-foreground relative min-h-svh">
    <div className="absolute top-4 right-4 flex items-center gap-1">
      <Link
        to="/settings"
        aria-label="Front desk"
        className="text-muted-foreground hover:text-foreground inline-flex size-9 items-center justify-center rounded-md"
      >
        <Settings className="size-5" aria-hidden />
      </Link>
      <ThemeSwitcher />
    </div>
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col justify-center gap-10 px-6 py-16">
      <div className="flex items-center gap-3">
        <BrandMark tone="brand" className="size-12" />
        <h1 className="text-gradient-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Where to?
        </h1>
      </div>
      <nav aria-label="Wings" className="grid gap-4 sm:grid-cols-3">
        {webWingsHere().map((wing) => (
          <div key={wing.id} className="relative">
            <DestinationCard
              to={wing.web.home}
              title={wing.name}
              blurb={wing.web.job}
              icon={WING_GLYPHS[wing.id] ?? Sparkles}
              cta="Go in"
            />
            {wing.web.lanOnly && (
              <span className="bg-foreground text-background absolute top-4 right-4 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <Lock className="size-3" aria-hidden />
                Home network
              </span>
            )}
          </div>
        ))}
      </nav>
      <section aria-labelledby="published" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="published"
            className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
          >
            Published from here
          </h2>
          <Link
            to="/mission"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            Why this exists
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        <ul className="bg-card divide-border/60 divide-y rounded-2xl border">
          {PUBLISHED.map(({ to, title, blurb, icon: Icon, channel, demo }) => (
            <li key={to} className="flex items-center gap-3 px-5 py-3.5">
              <Link to={to} className="flex min-w-0 flex-1 items-center gap-4">
                <Icon className="text-primary size-5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium">{title}</span>
                  <span className="text-muted-foreground block text-sm">
                    {blurb}
                  </span>
                </span>
              </Link>
              {demo && <DemoLink youtubeId={demo} title={title} />}
              <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
                <Globe className="size-3" aria-hidden />
                {channel}
              </span>
            </li>
          ))}
        </ul>
      </section>
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
