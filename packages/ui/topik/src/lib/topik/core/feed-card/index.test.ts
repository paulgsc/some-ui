import type { TopikMetadata } from "@topik/lib/topik"
import { describe, expect, it } from "vitest"

import { cardOf, seedOf } from "."

const entry = (extra: Partial<TopikMetadata>): TopikMetadata => ({
  key: "tea",
  displayName: "Tea at the chairman's",
  description: "Seo-yeon's first visit",
  batchCount: 1,
  totalQuestions: 3,
  totalMessages: 12,
  ...extra,
})

describe("cardOf", () => {
  it("reads genres from genre: tags, and the level from its tag", () => {
    expect(
      cardOf(
        entry({
          tags: [
            "topik-2",
            "genre:Office-Romance",
            "genre:office romance",
            "genre:",
            "genre:-",
            "x",
          ],
        })
      )
    ).toEqual({
      key: "tea",
      title: "Tea at the chairman's",
      premise: "Seo-yeon's first visit",
      genres: ["office romance"],
      level: 2,
    })
  })

  it("seeds a prompt with the premise, or the title when there is none", () => {
    expect(seedOf(cardOf(entry({ tags: ["genre:revenge"] })))).toEqual({
      scene: "Seo-yeon's first visit",
      genres: ["revenge"],
    })
    expect(seedOf(cardOf(entry({ description: " " }))).scene).toBe(
      "Tea at the chairman's"
    )
  })
})
