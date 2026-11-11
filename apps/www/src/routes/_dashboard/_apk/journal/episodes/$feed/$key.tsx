import type { JSX } from "react"
import { STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, notFound } from "@tanstack/react-router"

import type { Feed } from "@/lib/feeds"
import { isFeed } from "@/lib/feeds"
import { FEED_FACTS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { EpisodeScreen } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage } from "@/components/studio/layout"

/** The episode as home has it, the phone's alone (`build.paths.ts`). */
const Episode =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? EpisodeScreen : null

/**
 * One episode of a feed (SFEED1, #2731): watch it, share it to YouTube and
 * save its link (ST38, FEED4), under the feed's name and the episode's days
 * or week.
 */
const EpisodePage = (): JSX.Element => {
  const { feed, key }: { feed: Feed; key: string } = Route.useParams()
  return (
    <StudioPage heading={FEED_FACTS[feed].name} back="episodes">
      {Episode !== null && (
        <Episode
          feed={feed}
          episodeKey={key}
          pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
          gone={STUDIO_INDEX_WORDS.episodes.gone(feed)}
        />
      )}
    </StudioPage>
  )
}

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/episodes/$feed/$key"
)({
  params: {
    parse: ({ feed, key }): { feed: Feed; key: string } => {
      if (!isFeed(feed)) throw notFound()
      return { feed, key }
    },
    stringify: ({
      feed,
      key,
    }: {
      feed: Feed
      key: string
    }): { feed: string; key: string } => ({ feed, key }),
  },
  component: EpisodePage,
})
