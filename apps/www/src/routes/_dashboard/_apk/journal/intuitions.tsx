import type { JSX } from "react"
import { keptIdeaStore, STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import {
  FEED_FACTS,
  FEEDS_A_TO_Z,
  KIND_WORDS,
  STUDIO_INDEX_WORDS,
} from "@/lib/studio-index"
import { CardRoute } from "@/components/card-route"
import { Part, StudioPage, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.intuitions

/**
 * Studio's Intuitions (SFEED1, #2731): what you fed in. Each feed's
 * question, opening its feed, and the ideas you caught, which Your ideas
 * (ST19) lists with what each became; the tile counts this phone's.
 */
const Intuitions = (): JSX.Element => {
  const ideas = keptIdeaStore().list()
  return (
    <StudioPage
      heading={KIND_WORDS.intuitions.name}
      intro={WORDS.intro}
      back="index"
    >
      <Part label={WORDS.feeds}>
        <ul className="flex flex-col gap-2">
          {FEEDS_A_TO_Z.map((feed) => (
            <li key={feed}>
              <CardRoute to="/journal/feeds/$feed" params={{ feed }}>
                <TileBody
                  title={`“${FEED_FACTS[feed].intuition}”`}
                  line={WORDS.fed(FEED_FACTS[feed].name)}
                />
              </CardRoute>
            </li>
          ))}
        </ul>
      </Part>
      <Part label={WORDS.ideas}>
        <CardRoute to="/journal/ideas">
          <TileBody
            title={WORDS.openIdeas}
            line={WORDS.onPhone(ideas === null ? null : ideas.length)}
          />
        </CardRoute>
        <Link
          to="/journal/idea"
          className="text-muted-foreground self-start text-sm underline underline-offset-4"
        >
          {STUDIO_WORDS.idea.newIdea}
        </Link>
      </Part>
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/intuitions")({
  component: Intuitions,
})
