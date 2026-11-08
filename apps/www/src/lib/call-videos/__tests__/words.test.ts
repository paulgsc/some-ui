/**
 * @vitest-environment node
 *
 * Everything Studio's feed videos say is in the person's terms (CLAUDE.md, "State
 * in the person's terms"): none of it names the machinery behind it, and an
 * episode is named by its days or its season and week, never its key's code.
 */
import { describe, expect, it } from "vitest"

import type { Feed } from "@/lib/call-videos/model"
import { FEEDS } from "@/lib/call-videos/model"
import { FEED_WORDS, share, VIDEOS_WORDS } from "@/lib/call-videos/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

/** Each feed's keys as home makes them. */
const KEYS: Record<Feed, ReadonlyArray<string>> = {
  call: ["2026-10-30", "2026-12-28"],
  "playoff-delta": ["2026-SF-08", "2026-SF-00", "2026-SF-17"],
}

/** Keys a feed can't read: another feed's, and none of home's. */
const UNREAD: Record<Feed, ReadonlyArray<string>> = {
  call: ["2026-SF-08", "week-44", ""],
  "playoff-delta": ["2026-10-30", "2026-SF-8", ""],
}

/** All a feed says of an episode by its key. */
const named = (feed: Feed, key: string): Array<string> => [
  FEED_WORDS[feed].label(key),
  FEED_WORDS[feed].shareTitle(key),
]

describe("VIDEOS_WORDS and FEED_WORDS", () => {
  it("name no machinery, in any line they can say", () => {
    const said = [
      ...strings(VIDEOS_WORDS),
      ...strings(FEED_WORDS),
      ...FEEDS.flatMap((feed) =>
        [...KEYS[feed], ...UNREAD[feed]].flatMap((key) => named(feed, key))
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
  })

  it("names an episode whose key it can't read by a plain word, never the key", () => {
    expect(FEED_WORDS.call.label("week-44")).toBe("This week")
    expect(FEED_WORDS.call.shareTitle("week-44")).toBe("The weekly call")
    expect(FEED_WORDS["playoff-delta"].label("2026-10-30")).toBe("This episode")
    expect(FEED_WORDS["playoff-delta"].shareTitle("2026-10-30")).toBe(
      "Playoff Delta"
    )
    for (const feed of FEEDS) {
      for (const key of UNREAD[feed].filter((key) => key !== "")) {
        for (const line of named(feed, key)) expect(line).not.toContain(key)
      }
    }
  })

  it("says a share below a hundred until the video is whole", () => {
    expect([share(0, 10), share(5, 10), share(10, 10), share(1, 0)]).toEqual([
      0, 50, 99, 0,
    ])
  })
})
