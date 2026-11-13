import type { JSX } from "react"
import { STUDIO_WORDS } from "@some-ui/soundbites"
import { templateFormat } from "@some-ui/video-render"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import type { Feed } from "@/lib/feeds"
import { FEED_TEMPLATES, isFeed } from "@/lib/feeds"
import {
  FEED_FACTS,
  FEED_KEPT,
  PLACES,
  STUDIO_INDEX_WORDS,
} from "@/lib/studio-index"
import { FeedEpisodes, FeedSizeOnHome } from "@/components/studio/feed-episodes"
import { Part, StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.feeds

/**
 * One feed (SFEED1, #2731): the intuition it was fed, when it runs, the
 * templates its episodes are made with, its episodes, each linking to its
 * own page, and where what it leaves behind is kept (SFEED8, #2748).
 */
const FeedPage = (): JSX.Element => {
  const { feed }: { feed: Feed } = Route.useParams()
  const facts = FEED_FACTS[feed]
  return (
    <StudioPage heading={FEED_FACTS[feed].name} back="feeds">
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
        <FeedEpisodes feed={feed} pairWords={STUDIO_WORDS.pair.pair} />
      </Part>
      <Part label={WORDS.kept}>
        <dl className="flex flex-col gap-3">
          {PLACES.map((place) => (
            <div key={place} className="flex flex-col gap-1">
              <dt className="text-sm font-medium">{WORDS.places[place]}</dt>
              <dd className="text-sm">{FEED_KEPT[feed][place].what}</dd>
              {place === "home" && (
                <FeedSizeOnHome feed={feed} label={WORDS.homeHolds} />
              )}
              <dd className="text-muted-foreground text-sm">
                {FEED_KEPT[feed][place].letGo}
              </dd>
            </div>
          ))}
        </dl>
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
