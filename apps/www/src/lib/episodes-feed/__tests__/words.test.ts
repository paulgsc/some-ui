/**
 * @vitest-environment node
 *
 * Everything Studio's Episodes, by week, says is in the person's terms
 * (CLAUDE.md, "State in the person's terms"): no line names the machinery
 * behind it, and a week is named by its days.
 */
import { describe, expect, it } from "vitest"

import { FEEDS } from "@/lib/call-videos/model"
import { EPISODES_FEED_WORDS as WORDS } from "@/lib/episodes-feed/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

describe("EPISODES_FEED_WORDS", () => {
  it("name no machinery, in any line they can say", () => {
    const said = [
      ...strings(WORDS),
      ...FEEDS.flatMap((feed) => [
        WORDS.chipLabel(WORDS.genre[feed], 3),
        WORDS.none(feed),
        ...(["away", "older", "unreadable"] as const)
          .map((kind) =>
            [false, true].map((alone) => WORDS.trouble({ feed, kind }, alone))
          )
          .flat(),
      ]),
      WORDS.week("2026-11-09", "2026-11-09"),
      WORDS.week("2026-11-02", "2026-11-09"),
      WORDS.weekLine("2026-11-02", 1),
      WORDS.parts(3, 1),
      WORDS.parts(2, 2),
      WORDS.partsBadge(3),
      WORDS.part(2),
      WORDS.partLabel(2, WORDS.status.home),
      WORDS.length(754_000),
    ]
    for (const line of said) expect(line).not.toMatch(MACHINERY)
  })

  it("names this week, else a week by its Monday and days", () => {
    expect(WORDS.week("2026-11-09", "2026-11-09")).toBe("This week")
    expect(WORDS.week("2026-11-02", "2026-11-09")).toBe("Week of Nov 2")
    expect(WORDS.weekLine("2026-10-26", 1)).toBe("Oct 26 to Nov 1 · 1 episode")
    expect(WORDS.weekLine("2026-11-02", 2)).toBe("Nov 2 to Nov 8 · 2 episodes")
  })

  it("says how many of a week's parts are on YouTube", () => {
    expect(WORDS.parts(3, 1)).toBe("3 parts, 1 on YouTube")
    expect(WORDS.parts(2, 2)).toBe("2 parts, all on YouTube")
  })

  it("names a feed that couldn't be read in its own words", () => {
    expect(WORDS.trouble({ feed: "call", kind: "away" }, false)).toBe(
      "Home couldn't give the call's videos. The rest are here."
    )
    // Alone under its chip, it promises no others.
    expect(WORDS.trouble({ feed: "call", kind: "away" }, true)).toBe(
      "Home couldn't give the call's videos. Try again in a moment."
    )
  })
})
