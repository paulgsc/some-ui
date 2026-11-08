import type { JSX } from "react"
import { STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import {
  feedName,
  FEEDS_A_TO_Z,
  KIND_WORDS,
  STUDIO_INDEX_WORDS,
} from "@/lib/studio-index"
import { FeedEpisodeLinks } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"
import {
  BACK,
  Part,
  StudioPage,
  TILE,
  TileBody,
} from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.episodes

/**
 * Home's list of each feed's episodes, the phone's alone, so no other build
 * carries the link (`build.paths.ts`).
 */
const EpisodeLinks =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? FeedEpisodeLinks : null

/**
 * Studio's Episodes (SFEED1, #2731): every feed's episodes as home holds
 * them (ST38, FEED4), the feeds A to Z and each one's newest first, each
 * opening its own page; and the videos being made in sittings.
 */
const Episodes = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.episodes.name}
    intro={WORDS.intro}
    back={
      <Link to="/journal" className={BACK}>
        {STUDIO_INDEX_WORDS.back}
      </Link>
    }
  >
    {FEEDS_A_TO_Z.map((feed) => (
      <Part key={feed} label={feedName(feed)}>
        {EpisodeLinks !== null && (
          <EpisodeLinks
            feed={feed}
            pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
            renderLink={(key, label) => (
              <Link
                to="/journal/episodes/$feed/$key"
                params={{ feed, key }}
                className={TILE}
              >
                <TileBody title={label} />
              </Link>
            )}
          />
        )}
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
