import type { JSX } from "react"
import { Card, CardContent } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Sparkles,
} from "lucide-react"

import { HexCombMark } from "@/components/brand/hex-comb-mark"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * This repo's GitHub Pages deployment bundles three unrelated static
 * artifacts under one origin (see .github/workflows/pages.yml): this
 * TanStack app, a Storybook build nested at /storybook/, and this app's own
 * /resume route. A visitor landing on "/" cold has no way to know any of
 * that exists, so "/" is this standalone splash - not the learning app -
 * whose only job is to point at the three of them.
 */
type DestinationBase = {
  title: string
  description: string
  icon: typeof Sparkles
  cta: string
}

// The Storybook build is a separate static site outside the SPA's route
// tree (its href is only known at runtime, from BASE_URL), so it can't be
// typed against the router like the two in-app destinations can.
type Destination =
  | (DestinationBase & { external: true; href: string })
  | (DestinationBase & { external?: false; href: "/app" | "/resume" })

const DESTINATIONS: ReadonlyArray<Destination> = [
  {
    title: "Adaptive learning sessions",
    description:
      "Compose and run focused study sessions - Hangul Honeycomb, TOPIK practice, interview prep, and timed code-typing drills.",
    icon: Sparkles,
    cta: "Open the app",
    href: "/app",
  },
  {
    title: "Component library",
    description:
      "Every component in this workspace, documented and previewable in isolation as a static Storybook build.",
    icon: BookOpen,
    cta: "Browse Storybook",
    href: `${import.meta.env.BASE_URL}storybook/`,
    external: true,
  },
  {
    title: "Résumé & background",
    description: "Paul Gathondu's résumé, previewable inline or as a PDF.",
    icon: FileText,
    cta: "View résumé",
    href: "/resume",
  },
]

const DestinationCard = (destination: Destination): JSX.Element => {
  const { title, description, icon: Icon, cta, external } = destination
  const body = (
    <Card className="hover:border-primary/50 group h-full transition-colors">
      <CardContent className="flex h-full flex-col gap-4 pt-6">
        <div className="bg-primary/10 flex size-11 items-center justify-center rounded-full">
          <Icon className="text-primary size-5" aria-hidden />
        </div>
        <div className="min-h-0 flex-1 space-y-1.5">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
          {cta}
          {external ? (
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          ) : (
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </span>
      </CardContent>
    </Card>
  )

  if (destination.external) {
    return (
      <a
        href={destination.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        {body}
      </a>
    )
  }

  return (
    <Link to={destination.href} className="block h-full">
      {body}
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
        {/* The mark leads the hero, with the wordmark under it — the pair is
            one unit, so the mark is decorative here rather than a second
            announcement of the same name. */}
        <HexCombMark tone="brand" className="mx-auto size-12" />
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Some UI
        </p>
        <h1 className="text-gradient-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Three projects, one workspace
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-balance">
          This site hosts an adaptive study app, a component library, and a
          résumé - built and deployed from a single monorepo. Pick a destination
          below.
        </p>
        {/* The three cards answer "what is deployed here". /mission answers
            why any of it exists - kept as a text link so it doesn't compete
            with the destinations for the same glance. */}
        <Link
          to="/mission"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 transition-colors hover:underline"
        >
          Why this exists
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {DESTINATIONS.map((destination) => (
          <DestinationCard key={destination.title} {...destination} />
        ))}
      </div>
    </div>
  </main>
)

export const Route = createFileRoute("/")({
  component: Landing,
})
