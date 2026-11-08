/**
 * @vitest-environment node
 *
 * Studio's index (SFEED1): the eight kinds A to Z, and everything the index
 * and its pages say in the person's terms (CLAUDE.md, "State in the person's
 * terms"), under ST34's names.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import {
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
  ...STUDIO_KINDS.map(STUDIO_INDEX_WORDS.backTo),
  STUDIO_INDEX_WORDS.asks.unblocks("the next story"),
  ...[1, 3, 12].flatMap((n) => [
    STUDIO_INDEX_WORDS.templates.version(n),
    STUDIO_INDEX_WORDS.templates.upTo(n),
    STUDIO_INDEX_WORDS.templates.chapters(n),
  ]),
  STUDIO_INDEX_WORDS.templates.usedBy("The weekly call"),
  STUDIO_INDEX_WORDS.clips.landed("2026-11-08"),
  STUDIO_INDEX_WORDS.intuitions.fed("Playoff Delta"),
  ...[null, 0, 1, 7].map(STUDIO_INDEX_WORDS.intuitions.onPhone),
]

describe("Studio's index", () => {
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
