/**
 * The pieces every page of Studio's index draws (SFEED1, #2731): a page
 * under its heading in the phone's column with the way back, a tile that
 * links somewhere, a labelled part of an item's page, a list read from
 * elsewhere, and a way out to where an item lives. Every word is
 * `lib/studio-index/words`'.
 */
import type { JSX, ReactNode } from "react"
import { Button, Notice } from "@some-ui/shared"
import type { QueryKey, UseQueryOptions } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { StudioKind } from "@/lib/studio-index"
import { KIND_WORDS, kindPath, STUDIO_INDEX_WORDS } from "@/lib/studio-index"

/** A tile's link: a card the size of its neighbours. */
export const TILE =
  "bg-card border-border/60 focus-visible:ring-ring flex h-full flex-col gap-1 rounded-2xl border px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"

/**
 * The quiet way back to a kind's list, or to the index: Studio's pages are
 * the phone's ("apk"), so a build without them draws nothing (A3).
 */
export const BackLink = ({
  to,
}: {
  to: StudioKind | "index"
}): JSX.Element | null =>
  hasAudience("apk") ? (
    <Link
      to={to === "index" ? "/journal" : kindPath(to)}
      className="text-muted-foreground self-start text-sm underline underline-offset-4"
    >
      {to === "index" ? STUDIO_INDEX_WORDS.back : STUDIO_INDEX_WORDS.backTo(to)}
    </Link>
  ) : null

/** A page of Studio's: its heading, what it holds, its body, the way back. */
export const StudioPage = ({
  heading,
  intro,
  back,
  children,
}: {
  heading: string
  intro?: string
  /** Where its way back leads; the index has none. */
  back?: StudioKind | "index"
  children: ReactNode
}): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
    {intro !== undefined && (
      <p className="text-muted-foreground text-sm">{intro}</p>
    )}
    {children}
    {back !== undefined && <BackLink to={back} />}
  </div>
)

/** What a tile says: its name, and a line under it. */
export const TileBody = ({
  title,
  line,
}: {
  title: string
  line?: string
}): JSX.Element => (
  <>
    <span className="text-base font-extrabold">{title}</span>
    {line !== undefined && (
      <span className="text-muted-foreground text-sm">{line}</span>
    )}
  </>
)

/** A labelled part of an item's page. */
export const Part = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): JSX.Element => (
  <section className="bg-card border-border/60 flex flex-col gap-2 rounded-2xl border px-4 py-3">
    <h2 className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
      {label}
    </h2>
    {children}
  </section>
)


/** What a list read from elsewhere says while it reads, can't, or can't again. */
type ReadWords = {
  readonly reading: string
  readonly away: string
  readonly stale: string
}

/**
 * A list read from elsewhere (Asks, Clips), once read, or what stands in for
 * it until then. A refresh that failed keeps what was read before, and says so.
 */
export function ReadList<T, K extends QueryKey>({
  query,
  words,
  children,
}: {
  query: UseQueryOptions<T, Error, T, K>
  words: ReadWords
  children: (value: T) => ReactNode
}): JSX.Element {
  return matchQueryOutcome(queryOutcome(useQuery(query)), {
    pending: () => (
      <p className="text-muted-foreground text-sm">{words.reading}</p>
    ),
    failed: (_error, retry) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{words.away}</p>
        <Button size="sm" variant="outline" onClick={retry}>
          {STUDIO_INDEX_WORDS.tryAgain}
        </Button>
      </div>
    ),
    ready: (value, refreshError) => (
      <>
        {refreshError !== undefined && (
          <Notice
            tone="warning"
            dismissible
            action={{
              label: STUDIO_INDEX_WORDS.tryAgain,
              onClick: refreshError.retry,
            }}
          >
            {words.stale}
          </Notice>
        )}
        {children(value)}
      </>
    ),
  })
}

/** The way out to where an item lives, on GitHub. */
export const OutLink = ({
  href,
  children,
}: {
  href: string
  children: ReactNode
}): JSX.Element => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="text-brand self-start text-sm font-semibold underline underline-offset-4"
  >
    {children}
  </a>
)
