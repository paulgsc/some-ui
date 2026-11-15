import type { JSX } from "react"
import { BrandMark } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ArrowRight, ArrowUpRight } from "lucide-react"

import { destinationsHere } from "@/lib/site-map"
import { ThemeSwitcher } from "@/components/theme-switcher"

import { WORDS } from "./words"

const OFFERS_PLAYOFF_DELTA = destinationsHere().some(
  (d) => d.to === "/playoff-delta"
)

const ENTRIES = [
  { to: "/resume", words: WORDS.resume },
  { to: "/auth", words: WORDS.demo },
  { to: "/extensions", words: WORDS.extensions },
] as const

/** A public introduction that leads from a short read to the screens and source. */
export const OrientationPage = (): JSX.Element => (
  <main
    data-testid="orientation-page"
    className="bg-background text-foreground min-h-svh"
  >
    <div className="mx-auto max-w-6xl px-6 sm:px-10">
      <header className="flex items-center justify-between gap-4 py-6">
        <div className="text-muted-foreground flex items-center gap-3 text-sm font-medium">
          <BrandMark tone="brand" className="size-8" />
          {WORDS.brand}
        </div>
        <ThemeSwitcher />
      </header>
      <div className="grid gap-10 pt-12 pb-14 md:grid-cols-[1.4fr_1fr] md:gap-16 md:pt-20 md:pb-20">
        <section className="space-y-6">
          <p className="text-primary text-sm font-medium">{WORDS.identity}</p>
          <h1 className="text-gradient-heading max-w-2xl text-5xl leading-[1.08] font-bold tracking-tight text-balance lg:text-6xl">
            {WORDS.heading}
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
            {WORDS.introduction}
          </p>
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
            {WORDS.privacy}
          </p>
        </section>
        <nav aria-label={WORDS.start} className="space-y-3 md:pt-1">
          <p className="text-muted-foreground mb-5 text-xs font-medium tracking-widest uppercase">
            {WORDS.start}
          </p>
          {ENTRIES.map(({ to, words }) => (
            <Link
              key={to}
              to={to}
              className="border-border bg-card hover:border-primary/60 focus-visible:ring-ring group flex items-start gap-4 rounded-2xl border p-5 transition-colors focus-visible:ring-2"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <h2 className="text-lg font-semibold">{words.title}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {words.description}
                </p>
              </div>
              <ArrowRight
                className="text-primary mt-1 size-5 shrink-0 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          ))}
          {OFFERS_PLAYOFF_DELTA && (
            <Link
              to="/playoff-delta"
              className="text-primary inline-flex items-center gap-2 px-1 py-3 text-sm underline-offset-4 hover:underline"
            >
              {WORDS.playoff}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </nav>
      </div>
      <footer className="border-border grid gap-8 border-t py-8 text-sm sm:grid-cols-2">
        <nav className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <Link to="/mission" className="underline-offset-4 hover:underline">
            {WORDS.mission}
          </Link>
          <Link to="/assurance" className="underline-offset-4 hover:underline">
            {WORDS.assurance}
          </Link>
        </nav>
        <div className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
            {WORDS.source}
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <a
              href="https://github.com/paulgsc/some-ui"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              {WORDS.client}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
            <a
              href="https://github.com/paulgsc/server"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              {WORDS.server}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </footer>
    </div>
  </main>
)
