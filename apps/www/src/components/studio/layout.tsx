/**
 * The pieces every page of Studio's index draws (SFEED1, #2731): a page
 * under its heading in the phone's column with the way back, a tile that
 * links somewhere, a labelled part of an item's page, and the page of a kind
 * nothing keeps yet. Every word is `lib/studio-index/words`'.
 */
import type { JSX, ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
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

/**
 * The page of a kind nothing keeps yet (clips, SFEED7): what one is, and
 * that none is kept.
 */
export const EmptyKindPage = ({ kind }: { kind: "clips" }): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS[kind].name}
    intro={STUDIO_INDEX_WORDS[kind].intro}
    back="index"
  >
    <p className="text-muted-foreground text-sm">
      {STUDIO_INDEX_WORDS[kind].none}
    </p>
  </StudioPage>
)
