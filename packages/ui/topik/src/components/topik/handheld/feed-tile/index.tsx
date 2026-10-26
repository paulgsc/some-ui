/**
 * The handheld feed's card: a thumbnail, a title, its tags and premise, and
 * what it offers as buttons beneath. Each lesson the list shows is one: the
 * routine's scenes and dramas, and the operator's served dramas.
 *
 * The thumbnail is a slot (`FeedThumb`). Lessons carry no picture yet, so it
 * shows the kind's mark and the genre's Korean name.
 */

import type { JSX, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import { BookOpenText, Play } from "lucide-react"

type FeedTag = { label: string; lang?: string }

type FeedTileProps = {
  title: string
  lang?: string
  thumb: JSX.Element
  tags: ReadonlyArray<FeedTag>
  premise?: string
  /** Not opened yet: tinted, as everything new on the list is. */
  fresh?: boolean
  children: ReactNode
}

export const FeedTile = ({
  title,
  lang,
  thumb,
  tags,
  premise,
  fresh = false,
  children,
}: FeedTileProps): JSX.Element => (
  <li
    data-slot="feed-tile"
    className={cn(
      "flex flex-col gap-3 rounded-2xl border p-3",
      fresh ? "bg-primary/10 border-primary/30" : "bg-card border-border"
    )}
  >
    <div className="flex min-w-0 gap-3">
      {thumb}
      <div className="min-w-0 flex-1">
        <span
          lang={lang}
          data-slot="feed-title"
          className="line-clamp-2 block font-semibold break-keep"
        >
          {title}
        </span>
        {tags.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag.label}
                lang={tag.lang}
                className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
              >
                {tag.label}
              </span>
            ))}
          </span>
        )}
        {premise && (
          <span className="text-muted-foreground mt-1 line-clamp-2 block text-sm break-keep">
            {premise}
          </span>
        )}
      </div>
    </div>
    <div className="flex gap-2">{children}</div>
  </li>
)

/** The thumbnail's slot. */
export const FeedThumb = ({
  kind,
  genreKo,
}: {
  kind: "words" | "drama"
  genreKo?: string | undefined
}): JSX.Element => (
  <span
    data-slot="feed-thumb"
    aria-hidden="true"
    className="bg-primary/15 text-primary flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl"
  >
    {kind === "words" ? (
      <BookOpenText className="size-6" />
    ) : (
      <Play className="size-6" />
    )}
    {genreKo && (
      <span lang="ko" className="text-xs font-semibold">
        {genreKo}
      </span>
    )}
  </span>
)
