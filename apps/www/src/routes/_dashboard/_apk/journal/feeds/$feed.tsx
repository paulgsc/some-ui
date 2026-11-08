import type { JSX } from "react"
import { STUDIO_WORDS } from "@some-ui/soundbites"
import { templateFormat } from "@some-ui/video-render"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import type { Feed } from "@/lib/feeds"
import { FEED_TEMPLATES, isFeed } from "@/lib/feeds"
import { feedName, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { FeedEpisodeLinks } from "@/components/call-videos"
import { PairHomeLink } from "@/components/pair-home-link"
import {
  BACK,
  Part,
  StudioPage,
  TILE,
  TileBody,
} from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.feeds

/**
 * Home's list of each feed's episodes, the phone's alone, so no other build
 * carries the link (`build.paths.ts`).
 */
const EpisodeLinks =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? FeedEpisodeLinks : null

/**
 * One feed (SFEED1, #2731): the intuition it was fed, when it runs, the
 * templates its episodes are made with, and its episodes, each linking to
 * its own page.
 */
const FeedPage = (): JSX.Element => {
  const { feed }: { feed: Feed } = Route.useParams()
  const facts = WORDS.facts[feed]
  return (
    <StudioPage
      heading={feedName(feed)}
      back={
        <Link to="/journal/feeds" className={BACK}>
          {STUDIO_INDEX_WORDS.backTo("feeds")}
        </Link>
      }
    >
      <Part label={WORDS.intuition}>
        <p className="text-sm">“{facts.intuition}”</p>
      </Part>
      <Part label={WORDS.cadence}>
        <p className="text-sm">{facts.cadence}</p>
      </Part>
      <Part label={WORDS.templates}>
        <ul className="flex flex-col gap-2">
          {FEED_TEMPLATES[feed].map((template) => (
            <li key={template}>
              <Link
                to="/journal/templates/$template"
                params={{ template }}
                className={TILE}
              >
                <TileBody title={templateFormat(template).title} />
              </Link>
            </li>
          ))}
        </ul>
      </Part>
      <Part label={WORDS.episodes}>
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
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/feeds/$feed")({
  params: {
    parse: ({ feed }): { feed: Feed } => {
      if (!isFeed(feed)) throw notFound()
      return { feed }
    },
    stringify: ({ feed }: { feed: Feed }): { feed: string } => ({ feed }),
  },
  component: FeedPage,
})
