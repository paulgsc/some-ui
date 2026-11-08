/**
 * A feed's episodes on Studio's pages (SFEED1): home's list of them, each a
 * link to its page, and what they take up on home (SFEED8), in the Android
 * app alone, so no other build carries the
 * link (`build.paths.ts`).
 */
import type { JSX } from "react"

import type { Feed } from "@/lib/feeds"
import { FeedEpisodeLinks, FeedHomeSize } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"

const Links =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? FeedEpisodeLinks : null

const Size =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? FeedHomeSize : null

export const FeedEpisodes = ({
  feed,
  pairWords,
}: {
  feed: Feed
  /** What the way to pairing says, for a phone that isn't paired. */
  pairWords: string
}): JSX.Element | null =>
  Links === null ? null : (
    <Links feed={feed} pair={<PairHomeLink>{pairWords}</PairHomeLink>} />
  )

/** What home holds of a feed's episodes, by size, in the Android app alone. */
export const FeedSizeOnHome = ({
  feed,
  label,
}: {
  feed: Feed
  label: string
}): JSX.Element | null =>
  Size === null ? null : <Size feed={feed} label={label} />
