/**
 * The pieces every page of Studio's index draws (SFEED1, #2731): a page
 * under its heading in the phone's column, a tile that links somewhere, and
 * the quiet way back. Links are the route's, so each stays typed; these only
 * lay them out. Every word is the caller's (`lib/studio-index/words`).
 */
import type { JSX, ReactNode } from "react"

/** A tile's link: a card the size of its neighbours. */
export const TILE =
  "bg-card border-border/60 focus-visible:ring-ring flex h-full flex-col gap-1 rounded-2xl border px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"

/** The quiet way back, under a page. */
export const BACK =
  "text-muted-foreground self-start text-sm underline underline-offset-4"

/** A page of Studio's: its heading, what it holds, its body, the way back. */
export const StudioPage = ({
  heading,
  intro,
  back,
  children,
}: {
  heading: string
  intro?: string
  /** The way back, the route's link. */
  back?: ReactNode
  children: ReactNode
}): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
    {intro !== undefined && (
      <p className="text-muted-foreground text-sm">{intro}</p>
    )}
    {children}
    {back}
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
