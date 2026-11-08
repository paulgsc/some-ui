/**
 * @vitest-environment node
 *
 * Everything Studio's feed videos say is in the person's terms (CLAUDE.md, "State
 * in the person's terms"): none of it names the machinery behind it, and an
 * episode is named by its days or its season and week, never its key's code.
 */
import { describe, expect, it } from "vitest"

import { FEEDS } from "@/lib/call-videos/model"
import { FEED_WORDS, share, VIDEOS_WORDS } from "@/lib/call-videos/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

const KEYS = ["2026-10-30", "2026-SF-08", "2026-SF-00", "2026-SF-17"]

describe("VIDEOS_WORDS and FEED_WORDS", () => {
  it("name no machinery, in any line they can say", () => {
    const said = [
      ...strings(VIDEOS_WORDS),
      ...strings(FEED_WORDS),
      ...FEEDS.flatMap((feed) =>
        KEYS.flatMap((key) => [
          FEED_WORDS[feed].label(key),
          FEED_WORDS[feed].shareTitle(key),
        ])
      ),
      ...[0, 1, 50, 99, 100].map((done) => VIDEOS_WORDS.bringing(done, 100)),
    ]
    for (const line of said) expect(line).not.toMatch(MACHINERY)
  })

  it("names a week of the call by its seven days, across a month's end", () => {
    expect(FEED_WORDS.call.label("2026-10-30")).toBe("2026-10-30 to 2026-11-05")
    expect(FEED_WORDS.call.label("2026-12-28")).toBe("2026-12-28 to 2027-01-03")
    expect(FEED_WORDS.call.shareTitle("2026-10-30")).toBe(
      "The weekly call, the week of 2026-10-30"
    )
  })

  it("names a week of Playoff Delta by its season and week, the legend for week 00, and no team code", () => {
    expect(FEED_WORDS["playoff-delta"].label("2026-SF-08")).toBe("2026, week 8")
    expect(FEED_WORDS["playoff-delta"].label("2026-SF-00")).toBe(
      "2026, the legend"
    )
    expect(FEED_WORDS["playoff-delta"].label("2026-SF-17")).toBe(
      "2026, week 17"
    )
    expect(FEED_WORDS["playoff-delta"].shareTitle("2026-SF-08")).toBe(
      "Playoff Delta, 2026, week 8"
    )
    for (const key of ["2026-SF-08", "2026-SF-00"]) {
      expect(FEED_WORDS["playoff-delta"].label(key)).not.toContain("SF")
    }
  })

  it("says a share below a hundred until the video is whole", () => {
    expect([share(0, 10), share(5, 10), share(10, 10), share(1, 0)]).toEqual([
      0, 50, 99, 0,
    ])
  })
})
