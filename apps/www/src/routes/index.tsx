import type { JSX } from "react"
import { Card, CardContent } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Puzzle,
  Sparkles,
} from "lucide-react"

import { useAuthoritySnapshot } from "@/lib/authority"
import { HexCombMark } from "@/components/brand/hex-comb-mark"
import { ExtensionsPage } from "@/components/extensions/extensions-page"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The signed-in visitor's "/": a splash pointing at what this origin hosts
 * (.github/workflows/pages.yml): the app, Storybook at /storybook/, /resume,
 * and /extensions. A visitor with no session gets the extensions tour instead
 * (see `Root`).
 */
type DestinationBase = {
  title: string
  description: string
  icon: typeof Sparkles
  cta: string
}

// Storybook is a separate static site (href known only at runtime, from
// BASE_URL), so it can't be typed against the router.
type Destination =
  | (DestinationBase & { external: true; href: string })
  | (DestinationBase & {
      external?: false
      href: "/app" | "/resume" | "/extensions"
    })

const DESTINATIONS: ReadonlyArray<Destination> = [
  {
    title: "Adaptive learning sessions",
    description:
      "Compose and run focused study sessions - Hangul Honeycomb, TOPIK practice, and timed code-typing drills.",
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
    title: "Browser extensions",
    description:
      "Five small tools for your browser - what each one does, how far along it is, and what it sends.",
    icon: Puzzle,
    cta: "See the five",
    href: "/extensions",
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
      <CardContent className="flex h-full flex-col gap-4 pt-[var(--card-p,1.5rem)]">
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
        {/* The mark and wordmark are one unit, so the mark is decorative. */}
        <HexCombMark tone="brand" className="mx-auto size-12" />
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Some UI
        </p>
        <h1 className="text-gradient-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Four projects, one workspace
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-balance">
          This site hosts an adaptive study app, a component library, a set of
          browser extensions, and a résumé - built and deployed from a single
          monorepo. Pick a destination below.
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
      {/* Two by two: a row of three would leave the fourth card alone. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {DESTINATIONS.map((destination) => (
          <DestinationCard key={destination.title} {...destination} />
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
