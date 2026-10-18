/**
 * The desktop web's reading of the Jobs wing: one morning's run, read from
 * job-desk's sample digest. The wing itself is the phone's (`components/jobs`);
 * here a reader sees what a run hands it and why, with the source a click
 * away. Made-up postings, so nothing of mine is shown.
 */
import type { JSX, ReactNode } from "react"
import type { Digest, Pick, Track } from "@some-ui/job-desk"
import { sampleDigest } from "@some-ui/job-desk/sample"
import { Badge } from "@some-ui/shared"
import { ExternalLink } from "lucide-react"

import {
  Gaps,
  resumeLabel,
  Scores,
  sectionHeading,
} from "@/components/job-reading"

const SOURCE = "https://github.com/paulgsc/some-ui/blob/main/packages/job-desk"

const TRACK_HEADINGS: Readonly<Record<Track, string>> = {
  software: "Software engineering",
  adjacent: "Software-adjacent",
}

const VERDICTS: Readonly<Record<Digest["scouts"][number]["verdict"], string>> =
  {
    agree: "The run agrees",
    disagree: "The run disagrees",
    "not-found": "The run couldn't find it",
  }

const SOURCES: ReadonlyArray<{ label: string; path: string; what: string }> = [
  {
    label: "ROUTINE.md",
    path: "ROUTINE.md",
    what: "the run, step by step",
  },
  {
    label: "policy.ts",
    path: "src/policy.ts",
    what: "picks per track, places, queries",
  },
  {
    label: "findings.ts",
    path: "src/findings.ts",
    what: "the checker every digest passes",
  },
  {
    label: "sample.digest.json",
    path: "src/sample.digest.json",
    what: "this page's digest",
  },
]

const Disclosed = ({
  summary,
  children,
}: {
  summary: string
  children: ReactNode
}): JSX.Element => (
  <details>
    <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold tracking-wider uppercase">
      {summary}
    </summary>
    <div className="mt-2 flex flex-col gap-3">{children}</div>
  </details>
)

const PickCard = ({ pick }: { pick: Pick }): JSX.Element => (
  <article className="flex flex-col gap-3 rounded-xl border p-4">
    <header className="flex flex-col gap-0.5">
      <h3 className="font-semibold">{pick.posting.title}</h3>
      <span className="text-muted-foreground text-sm">
        {pick.posting.company} · {pick.posting.location}
        {pick.family ? ` · ${pick.family}` : ""}
      </span>
    </header>
    <Scores scores={pick.scores} />
    <p className="text-sm leading-relaxed">{pick.wants}</p>
    <span className="text-sm">
      <span className="text-muted-foreground">Résumé: </span>
      {resumeLabel(pick.resume)}
    </span>
    {pick.resume.kind === "patch" && (
      <p className="text-muted-foreground text-sm">
        {pick.resume.change} Until it lands, it sends {pick.resume.fallback} ·{" "}
        {pick.resume.template}.
      </p>
    )}
    <Disclosed summary={`Where I fit, and the gaps · ${pick.fits.length}`}>
      <ul className="flex flex-col gap-2">
        {pick.fits.map((fit) => (
          <li
            key={fit.title}
            className="bg-muted flex flex-col gap-0.5 rounded-lg p-3"
          >
            <span className="text-sm font-semibold">{fit.title}</span>
            <span className="text-sm">{fit.detail}</span>
            <span className="text-muted-foreground font-mono text-xs">
              {fit.source}
            </span>
          </li>
        ))}
      </ul>
      <Gaps gaps={pick.gaps} heading="h4" />
    </Disclosed>
  </article>
)

export const JobRun = (): JSX.Element => {
  const digest = sampleDigest()
  const answered = digest.scouts.length
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">One morning&rsquo;s run</h1>
        <p className="text-muted-foreground max-w-3xl leading-relaxed">
          Each morning a scheduled agent reads my résumé and searches Indeed on
          two tracks: software engineering, and software-adjacent work in data,
          QA and solutions, never customer-facing or phone roles. It scores what
          it finds, picks up to five, answers the postings I sent it myself, and
          leaves one file in my Google Drive. On my phone I take or pass on each
          pick, build the résumé it names, and record how applying went; the
          next run reads that back. This is a sample digest on made-up postings.
          My real ones stay in my Google Drive and on my phone.
        </p>
        <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt>Day</dt>
            <dd className="text-foreground tabular-nums">{digest.day}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Postings seen</dt>
            <dd className="text-foreground tabular-nums">{digest.seen}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Picked</dt>
            <dd className="text-foreground tabular-nums">
              {digest.picks.length}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Set aside</dt>
            <dd className="text-foreground tabular-nums">
              {digest.setAside.length}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>My own finds answered</dt>
            <dd className="text-foreground tabular-nums">{answered}</dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {(["software", "adjacent"] as const).map((track) => (
          <section key={track} className="flex flex-col gap-3">
            <h2 className={sectionHeading}>{TRACK_HEADINGS[track]}</h2>
            {digest.picks
              .filter((pick) => pick.track === track)
              .map((pick) => (
                <PickCard key={pick.id} pick={pick} />
              ))}
          </section>
        ))}
      </div>

      {digest.scouts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={sectionHeading}>Postings I found myself</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {digest.scouts.map((scout) => (
              <li
                key={scout.scoutId}
                className="flex flex-col gap-2 rounded-xl border p-4"
              >
                <Badge
                  variant={
                    scout.verdict === "disagree" ? "destructive" : "secondary"
                  }
                  className="self-start"
                >
                  {VERDICTS[scout.verdict]}
                </Badge>
                <p className="text-sm">{scout.note}</p>
                {scout.review && (
                  <>
                    <Scores scores={scout.review.scores} />
                    <Gaps gaps={scout.review.gaps} heading="h4" />
                    <span className="text-sm">
                      <span className="text-muted-foreground">Résumé: </span>
                      {scout.review.sends.variant} ·{" "}
                      {scout.review.sends.template}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className={sectionHeading}>Set aside · {digest.setAside.length}</h2>
        <ul className="flex flex-col divide-y rounded-xl border">
          {digest.setAside.map((aside) => (
            <li
              key={aside.fingerprint}
              className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="text-sm font-medium sm:w-1/2">
                {aside.title} · {aside.company}
              </span>
              <span className="text-muted-foreground text-sm">{aside.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={sectionHeading}>The source</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {SOURCES.map((source) => (
            <li key={source.path}>
              <a
                href={`${SOURCE}/${source.path}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono underline-offset-4 hover:underline"
              >
                {source.label}
                <ExternalLink aria-hidden className="size-3" />
              </a>
              <span className="text-muted-foreground">: {source.what}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
