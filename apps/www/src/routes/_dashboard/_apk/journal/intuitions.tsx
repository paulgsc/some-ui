import type { JSX } from "react"
import { keptIdeaStore, STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import {
  feedName,
  FEEDS_A_TO_Z,
  KIND_WORDS,
  STUDIO_INDEX_WORDS,
} from "@/lib/studio-index"
import {
  BACK,
  Part,
  StudioPage,
  TILE,
  TileBody,
} from "@/components/studio/layout"

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
      back={
        <Link to="/journal" className={BACK}>
          {STUDIO_INDEX_WORDS.back}
        </Link>
      }
    >
      <Part label={WORDS.feeds}>
        <ul className="flex flex-col gap-2">
          {FEEDS_A_TO_Z.map((feed) => (
            <li key={feed}>
              <Link
                to="/journal/feeds/$feed"
                params={{ feed }}
                className={TILE}
              >
                <TileBody
                  title={`“${STUDIO_INDEX_WORDS.feeds.facts[feed].intuition}”`}
                  line={WORDS.fed(feedName(feed))}
                />
              </Link>
            </li>
          ))}
        </ul>
      </Part>
      <Part label={WORDS.ideas}>
        <Link to="/journal/ideas" className={TILE}>
          <TileBody
            title={WORDS.openIdeas}
            line={WORDS.onPhone(ideas === null ? null : ideas.length)}
          />
        </Link>
        <Link to="/journal/idea" className={BACK}>
          {STUDIO_WORDS.idea.newIdea}
        </Link>
      </Part>
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/intuitions")({
  component: Intuitions,
})
