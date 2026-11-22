// @vitest-environment node
/**
 * PO1 (#3157): while the phone hasn't read whether it is paired with home,
 * nothing here says what it would of no pairing: `pairedOf` keeps not
 * known, and a take's `unknown` place says it is on this phone and nothing
 * of whether it goes home or stays.
 */
import type { HomeReach } from "@voice-capture/lib/bundle"
import { pairedOf } from "@voice-capture/lib/bundle"
import { keptSaid, TAKE_WORDS } from "@voice-capture/lib/take-words"
import { describe, expect, it } from "vitest"

describe("not known yet (PO1)", () => {
  it("keeps not known apart from unpaired, and away from home as paired", () => {
    const of: Record<HomeReach, string> = {
      near: pairedOf("near"),
      away: pairedOf("away"),
      unpaired: pairedOf("unpaired"),
      unknown: pairedOf("unknown"),
    }
    expect(of).toEqual({
      near: "paired",
      away: "paired",
      unpaired: "unpaired",
      unknown: "unknown",
    })
  })

  it("says a take of unknown place is on this phone, and nothing of home or of staying", () => {
    const said = [
      keptSaid(TAKE_WORDS, { place: "unknown" }),
      TAKE_WORDS.setAside.unknown,
    ]
    for (const line of said) {
      expect(line).toMatch(/on this phone/i)
      expect(line).not.toMatch(/home|stays|only|kept/i)
    }
    expect(TAKE_WORDS.setAside.unknown).not.toBe(TAKE_WORDS.setAside.phone)
    expect(TAKE_WORDS.place.unknown).not.toBe(TAKE_WORDS.place.phone)
  })
})
