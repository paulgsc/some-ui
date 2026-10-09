/**
 * The phone's feed as cards (docs/makjang/README.md, "The feed is cards"):
 * a served tree's manifest entry read as a title, its genres and a premise,
 * and the seed it gives the learner's own prompt. Pure and total.
 */

import type { TopikMetadata } from "@topik/lib/topik"
import { topikLevelOf } from "@topik/lib/topik/core/lesson-selection"

const GENRE_TAG = "genre:"

/** Genres a learner can pick for a drama of their own, with no card. */
export const GENRES: ReadonlyArray<{ genre: string; ko: string }> = [
  { genre: "makjang", ko: "막장" },
  { genre: "revenge", ko: "복수" },
  { genre: "romance", ko: "로맨스" },
  { genre: "family", ko: "가족" },
  { genre: "office", ko: "오피스" },
  { genre: "historical", ko: "사극" },
  { genre: "thriller", ko: "스릴러" },
  { genre: "comedy", ko: "코미디" },
]

export type FeedCard = {
  key: string
  title: string
  /** The entry's description: what the drama is about. */
  premise: string
  genres: Array<string>
  level: number | undefined
}

/** A templated genre's Korean name; none for a genre of the operator's own. */
export const koreanGenre = (genre: string): string | undefined =>
  GENRES.find((known) => known.genre === genre)?.ko

/** `genre:Office-Romance` reads "office romance"; blanks and repeats go. */
export function cardOf(item: TopikMetadata): FeedCard {
  const tags = item.tags ?? []
  const genres = tags
    .filter((tag) => tag.startsWith(GENRE_TAG))
    .map((tag) =>
      tag.slice(GENRE_TAG.length).replaceAll("-", " ").trim().toLowerCase()
    )
    .filter((genre) => genre !== "")
  return {
    key: item.key,
    title: item.displayName,
    premise: item.description,
    genres: [...new Set(genres)],
    level: topikLevelOf(tags),
  }
}

/** What a card gives the learner's own prompt. */
export type Seed = { scene: string; genres: Array<string> }

export const seedOf = (card: FeedCard): Seed => ({
  scene: card.premise.trim() || card.title,
  genres: card.genres,
})
