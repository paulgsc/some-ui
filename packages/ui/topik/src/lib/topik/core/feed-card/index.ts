/**
 * The phone's feed as cards (docs/makjang/README.md, "The feed is cards"):
 * a served tree's manifest entry read as a title, its genres and a premise,
 * and the seed it gives the learner's own prompt. Pure and total.
 *
 * Genres are `genre:` tags the operator types in the lesson CRM, so the
 * server stores them as it stores any tag. They are a card's label and a
 * prompt input, never a field of the scene tree.
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

/** `genre:office-romance` reads "office romance". */
export function cardOf(item: TopikMetadata): FeedCard {
  const tags = item.tags ?? []
  return {
    key: item.key,
    title: item.displayName,
    premise: item.description,
    genres: tags
      .filter(
        (tag) => tag.startsWith(GENRE_TAG) && tag.length > GENRE_TAG.length
      )
      .map((tag) => tag.slice(GENRE_TAG.length).replaceAll("-", " ")),
    level: topikLevelOf(tags),
  }
}

/** What a card gives the learner's own prompt. */
export type Seed = { scene: string; genres: Array<string> }

export const seedOf = (card: FeedCard): Seed => ({
  scene: card.premise.trim() || card.title,
  genres: card.genres,
})
