/**
 * @vitest-environment node
 *
 * Studio's index (SFEED1): the eight kinds A to Z, and everything the index
 * and its pages say in the person's terms (CLAUDE.md, "State in the person's
 * terms"), under ST34's names.
 */
import { describe, expect, it } from "vitest"

import { FEEDS } from "@/lib/feeds"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import {
  FEED_FACTS,
  FEED_KEPT,
  KIND_WORDS,
  STUDIO_INDEX_WORDS,
  STUDIO_KINDS,
} from "@/lib/studio-index"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

/** Every line the tables can say, the ones made from a value included. */
const all = [
  ...strings(KIND_WORDS),
  ...strings(STUDIO_INDEX_WORDS),
  ...strings(FEED_KEPT),
  ...strings(FEED_FACTS),
  ...FEEDS.map(STUDIO_INDEX_WORDS.episodes.gone),
  ...STUDIO_KINDS.map(STUDIO_INDEX_WORDS.backTo),
  STUDIO_INDEX_WORDS.asks.unblocks("the next story"),
  ...[1, 3, 12].flatMap((n) => [
    STUDIO_INDEX_WORDS.templates.version(n),
    STUDIO_INDEX_WORDS.templates.upTo(n),
    STUDIO_INDEX_WORDS.templates.chapters(n),
  ]),
  STUDIO_INDEX_WORDS.templates.usedBy("The weekly call"),
  STUDIO_INDEX_WORDS.templates.promo.featureFor(0.8, 0.6),
  STUDIO_INDEX_WORDS.templates.promo.lasts(3.2),
  STUDIO_INDEX_WORDS.templates.promo.limit(1, 18),
  STUDIO_INDEX_WORDS.templates.promo.limit(2, 24),
  STUDIO_INDEX_WORDS.clips.landed("2026-11-08"),
  STUDIO_INDEX_WORDS.templates.drawnFrom("the sample week"),
  STUDIO_INDEX_WORDS.templates.inAll(540_000),
  STUDIO_INDEX_WORDS.templates.when(65_000, 9_000),
  STUDIO_INDEX_WORDS.templates.chapter("The board"),
  STUDIO_INDEX_WORDS.templates.item("Where we are", 2),
  STUDIO_INDEX_WORDS.intuitions.fed("Playoff Delta"),
  STUDIO_INDEX_WORDS.templates.look.named("broadcast"),
  ...[0, 140].map(STUDIO_INDEX_WORDS.templates.look.popInMs),
  STUDIO_INDEX_WORDS.templates.mark.named("Mochi Night"),
  ...[null, 0, 1, 7].map(STUDIO_INDEX_WORDS.intuitions.onPhone),
]

describe("Studio's index", () => {
  it("says where a frame starts as a player does (SFEED3)", () => {
    expect(STUDIO_INDEX_WORDS.templates.when(65_000, 9_000)).toBe(
      "1:05, about 9 seconds"
    )
    expect(STUDIO_INDEX_WORDS.templates.when(0, 400)).toBe(
      "0:00, about 1 second"
    )
  })

  it("says the promo's lengths and limits as a person would (C32)", () => {
    const { promo } = STUDIO_INDEX_WORDS.templates
    expect(promo.lasts(1)).toBe("1 second long")
    expect(promo.limit(1, 18)).toBe("One line, up to 18 characters")
    expect(promo.limit(2, 24)).toBe("Up to 2 lines of 24 characters")
  })

  it("lists the eight kinds A to Z, so none comes first", () => {
    const names = STUDIO_KINDS.map((kind) => KIND_WORDS[kind].name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")))
  })

  it("names no machinery, in any line it can say", () => {
    expect(all.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("ST34: calls the place Studio, a take a take, and no place your video", () => {
    expect(STUDIO_INDEX_WORDS.heading).toBe("Studio")
    expect(all.filter((line) => /\bjournal\b/i.test(line))).toEqual([])
    expect(
      all.filter((line) => /\b(recordings?|bites?)\b/i.test(line))
    ).toEqual([])
    expect(all.filter((line) => /^\s*your video\s*$/i.test(line))).toEqual([])
  })
})
