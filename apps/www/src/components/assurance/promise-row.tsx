import type { JSX } from "react"
import type { Verdict } from "@some-ui/assurance"
import {
  Archive,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
} from "lucide-react"

import type { Link, Row } from "@/lib/assurance"
import { ASSURANCE_WORDS } from "@/lib/assurance/words"
import { GrowthChart } from "@/components/assurance/growth-chart"

const MARKS = {
  holds: { Icon: CircleCheck, tone: "text-success" },
  broken: { Icon: CircleX, tone: "text-destructive" },
  unproven: { Icon: CircleDashed, tone: "text-warning" },
} as const satisfies Record<Verdict, unknown>

/** A verdict's mark: its own shape and its word, never its colour alone. */
export const VerdictMark = ({ verdict }: { verdict: Verdict }): JSX.Element => {
  const { Icon, tone } = MARKS[verdict]
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {ASSURANCE_WORDS.verdicts[verdict]}
    </span>
  )
}

const Out = ({ link }: { link: Link }): JSX.Element => {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary font-mono text-xs break-all underline-offset-4 hover:underline"
    >
      {link.label}
    </a>
  )
}

const Part = ({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}): JSX.Element => {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-[11px] font-medium tracking-[0.15em] uppercase">
        {heading}
      </h3>
      {children}
    </section>
  )
}

/**
 * One promise, in three depths: the line (its mark, its claim and where it
 * stands), then on opening what exactly it takes and the evidence with any
 * before-and-after, then the receipt to check it by.
 */
export const PromiseRow = ({ row }: { row: Row }): JSX.Element => {
  const { objective: o } = row
  return (
    <details className="group border-border/60 border-t py-4">
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr_auto]">
        {o.retired ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
            <Archive className="size-4 shrink-0" aria-hidden />
            {ASSURANCE_WORDS.retired}
          </span>
        ) : (
          <VerdictMark verdict={o.verdict} />
        )}
        <ChevronRight
          className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90 sm:order-last"
          aria-hidden
        />
        <span className="col-span-2 block space-y-1 sm:col-span-1">
          <span className="block font-medium text-pretty">{o.claim}</span>
          <span className="text-muted-foreground block text-sm leading-relaxed text-pretty">
            {o.conclusion}
          </span>
        </span>
      </summary>
      <div className="mt-5 space-y-6 sm:ml-[9rem]">
        <Part heading={ASSURANCE_WORDS.requirement}>
          <p className="text-sm leading-relaxed text-pretty">{o.requirement}</p>
          {o.bound && (
            <p className="text-muted-foreground text-xs">
              {ASSURANCE_WORDS.bound}: {o.bound.value.toLocaleString("en")}{" "}
              {o.bound.unit}
            </p>
          )}
        </Part>
        <Part heading={ASSURANCE_WORDS.evidenceHeading}>
          <ul className="space-y-2">
            {row.evidence.map(({ item, link }) => (
              <li
                key={`${item.class}:${item.says}`}
                className="text-sm leading-relaxed"
              >
                <span className="text-muted-foreground mr-2 text-xs font-medium">
                  {ASSURANCE_WORDS.evidenceClass[item.class]}
                </span>
                {item.says} {link && <Out link={link} />}
              </li>
            ))}
          </ul>
        </Part>
        {o.comparison && (
          <Part heading={ASSURANCE_WORDS.comparisonHeading}>
            <GrowthChart comparison={o.comparison} />
          </Part>
        )}
        <Part heading={ASSURANCE_WORDS.receiptHeading}>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            {row.proofs.length > 0 && (
              <>
                <dt className="text-muted-foreground">
                  {ASSURANCE_WORDS.proof}
                </dt>
                <dd className="flex flex-col gap-1">
                  {row.proofs.map((link) => (
                    <Out key={link.href + link.label} link={link} />
                  ))}
                </dd>
              </>
            )}
            {row.tracked && (
              <>
                <dt className="text-muted-foreground">
                  {ASSURANCE_WORDS.tracked}
                </dt>
                <dd>
                  <Out link={row.tracked} />
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">
              {ASSURANCE_WORDS.watchHeading}
            </dt>
            <dd>
              {ASSURANCE_WORDS.watch[o.watch.by]}
              {row.watch && (
                <>
                  {" "}
                  <Out link={row.watch} />
                </>
              )}
            </dd>
            <dt className="text-muted-foreground">
              {ASSURANCE_WORDS.amendmentsHeading}
            </dt>
            <dd>
              {o.amendments.length === 0 ? (
                ASSURANCE_WORDS.noAmendments
              ) : (
                <ul className="space-y-1">
                  {o.amendments.map((a) => (
                    <li key={a.on + a.change}>
                      {a.on}: {a.change} {a.why}{" "}
                      <Out
                        link={{
                          label: ASSURANCE_WORDS.decided,
                          href: a.decision,
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </dd>
            <dt className="text-muted-foreground font-mono text-xs">{o.id}</dt>
            <dd className="text-muted-foreground font-mono text-xs">
              {o.kind}
            </dd>
          </dl>
        </Part>
      </div>
    </details>
  )
}
