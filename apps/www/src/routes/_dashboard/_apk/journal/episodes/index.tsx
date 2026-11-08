import type { JSX } from "react"
import { STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import {
  FEED_FACTS,
  FEEDS_A_TO_Z,
  KIND_WORDS,
  STUDIO_INDEX_WORDS,
} from "@/lib/studio-index"
import { PairHomeLink } from "@/components/pair-home-link"
import { FeedEpisodes } from "@/components/studio/feed-episodes"
import { Part, StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.episodes

/**
 * Studio's Episodes (SFEED1, #2731): every feed's episodes as home holds
 * them (ST38, FEED4), the feeds A to Z and each one's newest first, each
 * opening its own page; and the videos being made in sittings.
 */
const Episodes = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.episodes.name}
    intro={WORDS.intro}
    back="index"
  >
    {FEEDS_A_TO_Z.map((feed) => (
      <Part key={feed} label={FEED_FACTS[feed].name}>
        <FeedEpisodes
          feed={feed}
          pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
        />
      </Part>
    ))}
    <Link to="/journal/episodes/making" className={TILE}>
      <TileBody title={WORDS.making} line={WORDS.makingLine} />
    </Link>
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/episodes/")({
  component: Episodes,
})
