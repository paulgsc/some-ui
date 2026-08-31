import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { deriveSiteSummary, SITE_BAYS } from "@/lib/site-honeycomb/data"
import { SiteHoneycomb } from "@/components/site-honeycomb/site-honeycomb"

/**
 * "Under Construction" — the honeycomb work-site status board. Built on
 * `@some-ui/honeycomb`'s generic `HexGrid` (canonical hex geometry, no
 * domain knowledge of its own) with all work-order content, discipline
 * semantics, and interaction state owned here, per the architecture split
 * argued in the honeycomb immersion gap report: the renderer stays a
 * renderer, the feature layer owns the site.
 *
 * v1 scope: the rest/inspect/focus interaction grammar, in-lattice detail
 * (no detached modal, no rectangular context menu), keyboard and
 * reduced-motion equivalents. Deliberately deferred: the fuller
 * multi-topology responsive family and neighbor-recruited polyhex focus
 * regions the gap report sketches for later phases — this expands the
 * single selected cell in place rather than annexing its neighbors.
 */
const Site = (): JSX.Element => {
  const summary = deriveSiteSummary(SITE_BAYS)

  return (
    <main className="site-honeycomb relative min-h-svh">
      <div className="site-hazard-stripe" />
      <div className="site-honeycomb-backdrop relative">
        <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
          <Link
            to="/"
            className="site-honeycomb-mono mb-8 inline-flex items-center gap-1 text-xs uppercase tracking-widest opacity-70 transition-opacity hover:opacity-100"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Back
          </Link>

          <div className="mb-10 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <p
                className="site-honeycomb-mono text-xs uppercase tracking-[0.3em]"
                style={{ color: "var(--site-amber)" }}
              >
                Site log / Bay 01
              </p>
              <h1
                className="mt-3 text-4xl leading-[0.95] font-bold uppercase tracking-tight sm:text-6xl"
                style={{ letterSpacing: "-0.03em" }}
              >
                Under
                <br />
                Construction
              </h1>
              <p
                className="mt-4 text-sm"
                style={{ color: "var(--site-text-muted)" }}
              >
                Every cell below is a job in progress. Select a bay to read its
                work order, open it for full detail, and use its context action
                for site controls.
              </p>
            </div>
          </div>

          <SiteHoneycomb bays={SITE_BAYS} />

          <p className="site-honeycomb-mono sr-only" aria-live="polite">
            {summary.baysScheduled} bays scheduled, {summary.totalCompletion}%
            average completion, {summary.openBays} open.
          </p>
        </div>
      </div>
      <div className="site-hazard-stripe" />
    </main>
  )
}

export const Route = createFileRoute("/site")({
  component: Site,
})
