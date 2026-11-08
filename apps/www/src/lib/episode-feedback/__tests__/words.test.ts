/**
 * @vitest-environment node
 *
 * SFEED6 (#2745): what feedback says, in the person's terms.
 */
import { describe, expect, it } from "vitest"

import {
  CATEGORIES,
  CATEGORY_WORDS,
  DESTINATION_WORDS,
  FEEDBACK_WORDS,
} from "@/lib/episode-feedback"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

const all = [
  ...strings(CATEGORY_WORDS),
  ...strings(DESTINATION_WORDS),
  ...strings(FEEDBACK_WORDS),
  ...[0, 1, 134_000, 3_725_000].map(FEEDBACK_WORDS.at),
  ...[1, 2].map(FEEDBACK_WORDS.onThis),
  FEEDBACK_WORDS.onHome("2026-11-14T03:01:00.000Z", "2026-11-14"),
  FEEDBACK_WORDS.onHome("2025-11-14T03:01:00.000Z", "2026-11-14"),
]

describe("feedback's words", () => {
  it("name every category its own way", () => {
    const names = CATEGORIES.map((c) => CATEGORY_WORDS[c])
    expect(new Set(names).size).toBe(CATEGORIES.length)
  })

  it("names no machinery, in any line it can say", () => {
    expect(all.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("says a moment the way the player's clock reads", () => {
    expect(FEEDBACK_WORDS.at(134_000)).toBe("At 2:14")
  })
})
