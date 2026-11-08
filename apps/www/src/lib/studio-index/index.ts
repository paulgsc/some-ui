import type { Feed } from "@/lib/feeds"
import { FEEDS } from "@/lib/feeds"

import { FEED_FACTS } from "./words"

/**
 * Studio's index on the phone (SFEED1, #2731; #2670's decision 1): the eight
 * kinds of thing Studio keeps, each first-class, each with its own list
 * (`/journal/<kind>`) and, where an item has one, its own page. They are
 * listed A to Z, so their order ranks nothing; the test holds that order.
 * What each is called and says is `./words`.
 */
export const STUDIO_KINDS = [
  "asks",
  "clips",
  "episodes",
  "feedback",
  "feeds",
  "intuitions",
  "takes",
  "templates",
] as const

export type StudioKind = (typeof STUDIO_KINDS)[number]

/** The address of a kind's list. */
export const kindPath = (kind: StudioKind): `/journal/${StudioKind}` =>
  `/journal/${kind}`

/** Every feed, A to Z by its name, as each kind's page lists them. */
export const FEEDS_A_TO_Z: ReadonlyArray<Feed> = [...FEEDS].sort((a, b) =>
  FEED_FACTS[a].name.localeCompare(FEED_FACTS[b].name, "en")
)

export {
  FEED_FACTS,
  FEED_KEPT,
  KIND_WORDS,
  PLACES,
  STUDIO_INDEX_WORDS,
} from "./words"
