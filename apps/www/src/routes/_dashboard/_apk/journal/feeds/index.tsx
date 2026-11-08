import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import {
  FEED_FACTS,
  FEEDS_A_TO_Z,
  KIND_WORDS,
  STUDIO_INDEX_WORDS,
} from "@/lib/studio-index"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.feeds

/** Studio's Feeds (SFEED1, #2731): every feed, A to Z, by what it's fed. */
const Feeds = (): JSX.Element => (
  <StudioPage heading={KIND_WORDS.feeds.name} intro={WORDS.intro} back="index">
    <ul className="flex flex-col gap-2">
      {FEEDS_A_TO_Z.map((feed) => (
        <li key={feed}>
          <Link to="/journal/feeds/$feed" params={{ feed }} className={TILE}>
            <TileBody
              title={FEED_FACTS[feed].name}
              line={`“${FEED_FACTS[feed].intuition}” ${FEED_FACTS[feed].cadence}.`}
            />
          </Link>
        </li>
      ))}
    </ul>
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/feeds/")({
  component: Feeds,
})
