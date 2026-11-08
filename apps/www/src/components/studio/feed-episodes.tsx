/**
 * A feed's episodes on Studio's pages (SFEED1): home's list of them, each a
 * link to its page, in the Android app alone, so no other build carries the
 * link (`build.paths.ts`).
 */
import type { JSX } from "react"

import type { Feed } from "@/lib/feeds"
import { FeedEpisodeLinks } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"

const Links =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? FeedEpisodeLinks : null

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
