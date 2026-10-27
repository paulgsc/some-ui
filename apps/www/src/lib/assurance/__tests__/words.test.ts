/** `/assurance`'s own words name no machinery (CLAUDE.md, "State in the person's terms"). */
import { describe, expect, it } from "vitest"

import { ASSURANCE_WORDS } from "@/lib/assurance/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

function said(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "function")
    return [String(value(0, 2)), String(value(3, 1))]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(said)
  return []
}

describe("ASSURANCE_WORDS", () => {
  it("names no machinery, in any of its sentences", () => {
    const words = said(ASSURANCE_WORDS)
    expect(words.length).toBeGreaterThan(20)
    expect(words.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("says one promise in the singular", () => {
    expect(ASSURANCE_WORDS.watching(1, 1)).toBe(
      "1 tells me when it breaks; 1 shows only on a dashboard I have to open."
    )
  })
})
