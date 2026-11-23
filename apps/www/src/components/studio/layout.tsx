/**
 * The pieces every page of Studio's index draws (SFEED1, #2731): a page
 * under its heading in the phone's column with the way back, a tile that
 * links somewhere, a labelled part of an item's page, a list read from
 * elsewhere, and a way out to where an item lives. Every word is
 * `lib/studio-index/words`'.
 */
import type { JSX, ReactNode } from "react"
import type { QueryKey, UseQueryOptions } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { StudioKind } from "@/lib/studio-index"
import { kindPath, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import type { ReadWords } from "@/components/read-list"
import { ReadList as SharedReadList } from "@/components/read-list"

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

/** A list read from elsewhere, in Studio's words (`ReadList`). */
export const ReadList = <T, K extends QueryKey>({
  query,
  words,
  children,
}: {
  query: UseQueryOptions<T, Error, T, K>
  words: Omit<ReadWords, "tryAgain">
  children: (value: T) => ReactNode
}): JSX.Element => (
  <SharedReadList
    query={query}
    words={{ ...words, tryAgain: STUDIO_INDEX_WORDS.tryAgain }}
  >
    {children}
  </SharedReadList>
)

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
