import type { JSX } from "react"
import type { Verdict } from "@some-ui/assurance"
import { LEDGER } from "@some-ui/assurance"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { assurancePageOf } from "@/lib/assurance"
import { ASSURANCE_WORDS as W } from "@/lib/assurance/words"
import { PromiseRow, VerdictMark } from "@/components/assurance/promise-row"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The promises the toolkit makes about outcomes and work, and the evidence
 * for each (docs/operational-assurance.md, "What `/assurance` shows"): the
 * ledger as this build was made from it, broken first, each opening into
 * what it takes, its evidence and its receipt. It shows code, not live
 * state, and says so.
 */
const VERDICTS: ReadonlyArray<Verdict> = ["broken", "unproven", "holds"]

const page = assurancePageOf(LEDGER, import.meta.env.VITE_BUILD_COMMIT ?? "")

const Assurance = (): JSX.Element => (
  <main className="bg-background text-foreground min-h-svh">
    <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 md:px-8">
      <Link
        to="/mission"
        className="text-muted-foreground hover:text-foreground bg-background/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm backdrop-blur transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Mission
      </Link>
      <ThemeSwitcher />
    </div>

    <div className="mx-auto max-w-4xl px-4 pt-24 pb-20 md:px-8">
      <header className="space-y-6">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
          {W.eyebrow}
        </p>
        <h1 className="text-gradient-heading text-3xl leading-[1.1] font-bold tracking-tight text-balance md:text-5xl">
          {W.title}
        </h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed text-pretty">
          {W.lead}
        </p>
        <h2 className="sr-only">{W.tallyLabel}</h2>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
          {VERDICTS.map((verdict) => (
            <div key={verdict} className="flex items-center gap-2">
              <dt>
                <VerdictMark verdict={verdict} />
              </dt>
              <dd className="text-2xl font-bold tabular-nums">
                {page.tally[verdict]}
              </dd>
            </div>
          ))}
        </dl>
        <ul className="text-muted-foreground space-y-1 text-xs">
          {VERDICTS.map((verdict) => (
            <li key={verdict}>
              <span className="text-foreground font-medium">
                {W.verdicts[verdict]}:
              </span>{" "}
              {W.verdictLegend[verdict]}
            </li>
          ))}
        </ul>
      </header>

      <section
        aria-labelledby="limits-heading"
        className="border-warning/40 bg-warning/5 mt-10 space-y-2 rounded-lg border p-4 text-sm leading-relaxed"
      >
        <h2 id="limits-heading" className="font-semibold">
          {W.limitsHeading}
        </h2>
        <ul className="text-muted-foreground list-disc space-y-1 pl-5">
          <li>{W.live}</li>
          <li>{page.mergesBlocked ? W.merges.blocked : W.merges.open}</li>
          <li>{W.watching(page.alerting, page.dashboardOnly)}</li>
        </ul>
        <p className="text-muted-foreground text-xs">
          {page.built ? (
            <>
              {W.built}{" "}
              <a
                href={page.built.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-mono underline-offset-4 hover:underline"
              >
                {page.built.label}
              </a>
            </>
          ) : (
            W.builtUnknown
          )}
          {" · "}
          <a
            href="https://github.com/paulgsc/some-ui/blob/main/docs/operational-assurance.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {W.source}
          </a>
        </p>
      </section>

      {page.families.map(({ family, rows }) => (
        <section
          key={family.id}
          aria-labelledby={`family-${family.id}`}
          className="mt-14"
        >
          <h2
            id={`family-${family.id}`}
            className="text-xl font-bold tracking-tight text-balance"
          >
            {family.name}
          </h2>
          <p className="text-muted-foreground mt-2 mb-4 max-w-2xl text-sm leading-relaxed text-pretty">
            {family.why}
          </p>
          {rows.map((row) => (
            <PromiseRow key={row.objective.id} row={row} />
          ))}
        </section>
      ))}
    </div>
  </main>
)

export const Route = createFileRoute("/assurance")({
  component: Assurance,
})
