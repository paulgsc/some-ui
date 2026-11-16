import type { JSX } from "react"
import { STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import type { Feed } from "@/lib/feeds"
import { isFeed } from "@/lib/feeds"
import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { FeedEpisodes } from "@/components/studio/feed-episodes"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.episodes

type EpisodesSearch = { genre?: Feed }

/** The genre a link filters to, where it names a feed; else every one. */
function validateEpisodesSearch(
  search: Record<string, unknown>
): EpisodesSearch {
  const { genre } = search
  return isFeed(genre) ? { genre } : {}
}

/**
 * Studio's Episodes (SFEED1, #2731; EPISODES2, #3067): every feed's episodes
 * as home holds them (ST38, FEED4), mixed and by week, the newest first,
 * under a chip per genre that filters them (in the link, so the way back from
 * an episode keeps it); the videos being made in sittings lead All.
 */
const Episodes = (): JSX.Element => {
  const { genre } = Route.useSearch()
  return (
    <StudioPage
      heading={KIND_WORDS.episodes.name}
      intro={WORDS.intro}
      back="index"
    >
      <FeedEpisodes
        chip={genre ?? "all"}
        chips
        pairWords={STUDIO_WORDS.pair.pair}
        top={
          <Link to="/journal/episodes/making" className={TILE}>
            <TileBody title={WORDS.making} line={WORDS.makingLine} />
          </Link>
        }
      />
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/episodes/")({
  validateSearch: validateEpisodesSearch,
  component: Episodes,
})
