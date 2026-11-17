/**
 * Episodes on Studio's pages (SFEED1; EPISODES2, #3067): every feed's
 * episodes by week, filtered by genre (`EpisodesByWeek`), on Episodes with
 * its chips and on a feed's own page without them; and what a feed's
 * episodes take up on home (SFEED8). In the Android app alone, so no other
 * build carries them (`build.paths.ts`).
 */
import type { JSX, ReactNode } from "react"

import type { Chip } from "@/lib/episodes-feed"
import type { Feed } from "@/lib/feeds"
import { FeedHomeSize } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"
import { EpisodesByWeek } from "@/components/studio/episodes-by-week"

const onPhone = import.meta.env.VITE_DEVICE_BACKEND === "true"
const ByWeek = onPhone ? EpisodesByWeek : null
const Size = onPhone ? FeedHomeSize : null

export const FeedEpisodes = ({
  chip,
  chips,
  pairWords,
  top,
}: {
  chip: Chip
  /** Whether the genre chips lead it (Episodes), or not (a feed's page). */
  chips: boolean
  /** What the way to pairing says, for a phone that isn't paired. */
  pairWords: string
  /** What leads the feed under All. */
  top?: ReactNode
}): JSX.Element | null =>
  ByWeek === null ? null : (
    <ByWeek
      chip={chip}
      chips={chips}
      pair={<PairHomeLink>{pairWords}</PairHomeLink>}
      top={top}
    />
  )

export const FeedSizeOnHome = ({
  feed,
  label,
}: {
  feed: Feed
  label: string
}): JSX.Element | null =>
  Size === null ? null : <Size feed={feed} label={label} />
