/**
 * FEED8 (#3235): every feed the phone knows has a name and a page. A row of
 * Studio › Renders from any feed in `FEEDS` names that feed and opens its
 * episode's page (a cards essay's, its essay's), and a dated feed's episode
 * finds its week under Episodes. A row from a feed this phone doesn't know
 * yet names home's feed in words instead of "Something else", and opens
 * nothing.
 *
 * Family: every feed in `FEEDS`, each by the key shape home gives its
 * episodes (`KEYS`, which the type makes whole); and any feed name home
 * sends that `FEEDS` lacks. Tolerance: home's own list of feeds (paulgsc/server
 * `feeds.rs`, `Feed::parse`) is in no file this repo receives, so a feed home
 * adds before the phone does reads as its name in words and opens nothing
 * until it is added here. paulgsc/server#989 puts home's feeds in the route
 * snapshot, so this test can walk them.
 */
import { describe, expect, it } from "vitest"

import { FEED_WORDS } from "@/lib/call-videos/words"
import { keyDay } from "@/lib/episodes-feed"
import type { Feed } from "@/lib/feeds"
import { FEEDS } from "@/lib/feeds"
import { subjectOf } from "@/lib/renders/subject"
import {
  feedName,
  kindName,
  openWords,
  renderName,
  thingName,
} from "@/lib/renders/words"
import { FEED_FACTS } from "@/lib/studio-index/words"

/** An episode's key in each feed, as home makes it. */
const KEYS: Record<Feed, string> = {
  call: "2026-11-06",
  "cards-essay": "zfs-2026-11-12",
  "interview-essay": "2026-w46",
  "playoff-delta": "2026-SF-08",
  report: "2026-W46",
  "rust-essay": "2026-w46",
}

/** The feeds whose keys name no day: Playoff Delta's, until home says. */
const UNDATED: ReadonlyArray<Feed> = ["playoff-delta"]

describe("FEED8: every feed the phone knows has a name and a page", () => {
  it.each(FEEDS)("names %s and opens its episode's page", (feed) => {
    const name = FEED_FACTS[feed].name
    expect(name).not.toBe("")
    expect(FEED_WORDS[feed].heading).toBe(name)
    expect(feedName(feed)).toBe(name)

    const subject = subjectOf({ feed, key: KEYS[feed] })
    expect(subject.kind).toBe(feed === "cards-essay" ? "essay" : "episode")
    expect(openWords(subject)).not.toBeNull()
    expect(thingName(subject)).toBe(FEED_WORDS[feed].label(KEYS[feed]))
    if (subject.kind === "episode") expect(kindName(subject)).toBe(name)

    // Its label reads the key, not the fallback for one it can't.
    expect(FEED_WORDS[feed].week(KEYS[feed])).not.toBeNull()
    if (!UNDATED.includes(feed)) expect(keyDay(feed, KEYS[feed])).not.toBeNull()
  })

  it("names the report's week and dates it by its Monday", () => {
    expect(renderName({ feed: "report", key: "2026-W46" })).toBe(
      "The engagement report: 2026, week 46"
    )
    expect(keyDay("report", "2026-W46")).toBe("2026-11-09")
  })

  it("names a feed it doesn't know by home's name for it, and opens nothing", () => {
    const subject = subjectOf({ feed: "garden-log", key: "2026-W46" })
    expect(subject).toEqual({ kind: "other", feed: "garden-log" })
    expect(openWords(subject)).toBeNull()
    expect(feedName("garden-log")).toBe("Garden log")
    expect(renderName({ feed: "garden-log", key: "2026-W46" })).toBe(
      "Garden log: A video this phone can't open yet"
    )
    // Home's name in words, whatever joins it; one with no words is
    // "Something else", and the board's own rows keep their names.
    for (const [feed, name] of [
      ["garden_log", "Garden log"],
      ["garden--log", "Garden log"],
      ["-garden-", "Garden"],
      ["", "Something else"],
      ["-", "Something else"],
      ["__", "Something else"],
      ["clip-walk", "A clip's walk-through"],
      ["preview", "Preview"],
    ] as const)
      expect(feedName(feed)).toBe(name)
    expect(renderName({ feed: "clip-walk", key: "-after" })).toBe(
      "A clip's walk-through: A video this phone can't open yet"
    )
  })
})
